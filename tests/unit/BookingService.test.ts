import { BookingService, ValidationError, OverlapError } from '../../src/services/BookingService';
import { MockBookingRepository } from '../../src/repositories/MockBookingRepository';

describe('BookingService (Unit Tests with Mock Repository)', () => {
  let mockRepository: MockBookingRepository;
  let service: BookingService;

  beforeEach(() => {
    // Explicitly inject MockBookingRepository - proving architectural decoupling from database
    mockRepository = new MockBookingRepository();
    service = new BookingService(mockRepository);
  });

  describe('Architectural Decoupling', () => {
    it('should operate entirely in-memory using MockBookingRepository without database connection', async () => {
      const result = await service.createBooking({
        professor_id: 'prof_oak',
        student_id: 'ash_ketchum',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.professor_id).toBe('prof_oak');
      expect(result.student_id).toBe('ash_ketchum');
      expect(result.starts_at).toBe('2024-10-15T10:00:00-04:00');
      expect(result.duration_minutes).toBe(30);

      const all = await mockRepository.findAll();
      expect(all.length).toBe(1);
    });
  });

  describe('Overlap Validation (Requirement 5 & 10)', () => {
    it('should correctly reject overlapping bookings for the same professor', async () => {
      // 1. Create booking for Prof A from 10:00 to 10:30
      await service.createBooking({
        professor_id: 'prof_A',
        student_id: 'student_1',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      // 2. Attempt overlapping booking for Prof A from 10:15 to 10:45 -> should throw OverlapError
      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_2',
          local_start_time: '2024-10-15T10:15:00',
          timezone: 'America/New_York',
          duration_minutes: 30,
        })
      ).rejects.toThrow(OverlapError);
    });

    it('should allow adjacent bookings for the same professor', async () => {
      // Create booking 10:00 to 10:30
      await service.createBooking({
        professor_id: 'prof_A',
        student_id: 'student_1',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      // Adjacent booking 10:30 to 11:00 -> should succeed
      const adjacentBooking = await service.createBooking({
        professor_id: 'prof_A',
        student_id: 'student_2',
        local_start_time: '2024-10-15T10:30:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(adjacentBooking).toBeDefined();
      expect(adjacentBooking.starts_at).toBe('2024-10-15T10:30:00-04:00');
    });

    it('should allow overlapping times for DIFFERENT professors', async () => {
      // Booking for Prof A from 10:00 to 10:30
      await service.createBooking({
        professor_id: 'prof_A',
        student_id: 'student_1',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      // Booking for Prof B from 10:15 to 10:45 -> should succeed
      const profBBooking = await service.createBooking({
        professor_id: 'prof_B',
        student_id: 'student_2',
        local_start_time: '2024-10-15T10:15:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(profBBooking).toBeDefined();
      expect(profBBooking.professor_id).toBe('prof_B');
    });

    it('should correctly process cross-timezone overlap by normalizing to UTC (Requirement 10)', async () => {
      // Prof A on 2024-05-15T12:00:00 in America/New_York (60 mins) => 16:00:00 to 17:00:00 UTC
      await service.createBooking({
        professor_id: 'prof_A',
        student_id: 'student_ny',
        local_start_time: '2024-05-15T12:00:00',
        timezone: 'America/New_York',
        duration_minutes: 60,
      });

      // Prof A on 2024-05-15T09:30:00 in America/Los_Angeles (60 mins) => 16:30:00 to 17:30:00 UTC
      // Overlaps from 16:30 to 17:00 UTC!
      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_la',
          local_start_time: '2024-05-15T09:30:00',
          timezone: 'America/Los_Angeles',
          duration_minutes: 60,
        })
      ).rejects.toThrow(OverlapError);
    });
  });

  describe('DST Handling: Spring Forward and Fall Back (Requirement 6 & 9)', () => {
    it('should reject invalid local time in Spring Forward gap with 400 ValidationError (Requirement 6)', async () => {
      // In America/New_York on March 10, 2024, clocks jumped from 01:59:59 to 03:00:00
      // 02:30:00 does not exist
      await expect(
        service.createBooking({
          professor_id: 'prof_X',
          student_id: 'student_Y',
          local_start_time: '2024-03-10T02:30:00',
          timezone: 'America/New_York',
          duration_minutes: 30,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createBooking({
          professor_id: 'prof_X',
          student_id: 'student_Y',
          local_start_time: '2024-03-10T02:30:00',
          timezone: 'America/New_York',
          duration_minutes: 30,
        })
      ).rejects.toThrow(/Daylight Saving Time|spring forward/i);
    });

    it('should handle Fall Back ambiguous local time defaulting to first occurrence EDT (-04:00) (Requirement 9)', async () => {
      // In America/New_York on November 3, 2024, clocks fell back from 02:00 to 01:00
      // 01:30:00 occurs twice. Defaults to first occurrence (-04:00)
      const booking = await service.createBooking({
        professor_id: 'prof_X',
        student_id: 'student_Y',
        local_start_time: '2024-11-03T01:30:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(booking).toBeDefined();
      expect(booking.starts_at).toBe('2024-11-03T01:30:00-04:00');
    });
  });

  describe('Retrieval and ISO-8601 Offset Formatting (Requirement 3 & 4)', () => {
    it('should format retrieved bookings with exact original timezone offset (not Z)', async () => {
      await service.createBooking({
        professor_id: 'prof_chicago',
        student_id: 'student_chi',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/Chicago',
        duration_minutes: 45,
      });

      const retrieved = await service.getBookingsByProfessor('prof_chicago');
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].starts_at).toBe('2024-10-15T10:00:00-05:00');
      expect(retrieved[0].starts_at).toMatch(/-\d{2}:\d{2}$/);
      expect(retrieved[0].starts_at.endsWith('Z')).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid duration (<= 0)', async () => {
      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_1',
          local_start_time: '2024-10-15T10:00:00',
          timezone: 'America/New_York',
          duration_minutes: 0,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_1',
          local_start_time: '2024-10-15T10:00:00',
          timezone: 'America/New_York',
          duration_minutes: -15,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject invalid IANA timezone', async () => {
      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_1',
          local_start_time: '2024-10-15T10:00:00',
          timezone: 'Invalid/Non_Existent_Zone',
          duration_minutes: 30,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject malformed local_start_time format', async () => {
      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_1',
          local_start_time: '2024-10-15 10:00:00', // missing T
          timezone: 'America/New_York',
          duration_minutes: 30,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createBooking({
          professor_id: 'prof_A',
          student_id: 'student_1',
          local_start_time: '2024-10-15T10:00:00Z', // forbidden Z
          timezone: 'America/New_York',
          duration_minutes: 30,
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
