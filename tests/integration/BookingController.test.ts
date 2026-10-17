import request from 'supertest';
import { createApp } from '../../src/app';
import { BookingService } from '../../src/services/BookingService';
import { MockBookingRepository } from '../../src/repositories/MockBookingRepository';

describe('Booking API Integration Tests (Endpoints & HTTP contracts)', () => {
  let mockRepo: MockBookingRepository;
  let service: BookingService;
  let app: any;

  beforeEach(() => {
    mockRepo = new MockBookingRepository();
    service = new BookingService(mockRepo);
    app = createApp(service);
  });

  describe('Health check', () => {
    it('GET /health returns 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('Requirement 3: POST /api/bookings', () => {
    it('successfully creates a booking with valid local time and IANA timezone', async () => {
      const payload = {
        professor_id: 'prof_oak',
        student_id: 'ash_ketchum',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/Chicago',
        duration_minutes: 30,
      };

      const res = await request(app).post('/api/bookings').send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.professor_id).toBe('prof_oak');
      expect(res.body.student_id).toBe('ash_ketchum');
      expect(res.body.duration_minutes).toBe(30);
      // Chicago in October is CDT (-05:00)
      expect(res.body.starts_at).toBe('2024-10-15T10:00:00-05:00');
    });
  });

  describe('Requirement 4: GET /api/bookings?professor_id={id}', () => {
    it('retrieves bookings for a specific professor with exact offset in starts_at', async () => {
      // Seed a booking
      await request(app).post('/api/bookings').send({
        professor_id: 'prof_mcgonagall',
        student_id: 'hermione_granger',
        local_start_time: '2024-10-15T14:00:00',
        timezone: 'America/New_York',
        duration_minutes: 60,
      });

      const res = await request(app)
        .get('/api/bookings')
        .query({ professor_id: 'prof_mcgonagall' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].professor_id).toBe('prof_mcgonagall');
      expect(res.body[0].starts_at).toBe('2024-10-15T14:00:00-04:00');
      expect(res.body[0].starts_at).not.toMatch(/Z$/);
    });
  });

  describe('Requirement 5: Overlap Validation', () => {
    it('rejects overlapping bookings for the same professor with 409 Conflict', async () => {
      // Prof A 10:00 - 10:30
      await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_1',
        local_start_time: '2024-10-15T10:00:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      // Prof A 10:15 - 10:45 (overlapping) -> 409
      const conflictRes = await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_2',
        local_start_time: '2024-10-15T10:15:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body).toHaveProperty('error');

      // Prof A 10:30 - 11:00 (adjacent) -> 201
      const adjacentRes = await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_3',
        local_start_time: '2024-10-15T10:30:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(adjacentRes.status).toBe(201);

      // Prof B 10:15 - 10:45 (different professor) -> 201
      const diffProfRes = await request(app).post('/api/bookings').send({
        professor_id: 'prof_B',
        student_id: 'student_4',
        local_start_time: '2024-10-15T10:15:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(diffProfRes.status).toBe(201);
    });
  });

  describe('Requirement 6: DST Spring Forward Validation', () => {
    it('rejects invalid local time in Spring Forward gap with 400 Bad Request', async () => {
      const res = await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_1',
        local_start_time: '2024-03-10T02:30:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/Daylight Saving Time|spring forward/i);
    });
  });

  describe('Requirement 9: DST Fall Back Handling', () => {
    it('handles ambiguous local time during Fall Back without crashing, defaulting to EDT (-04:00)', async () => {
      const res = await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_1',
        local_start_time: '2024-11-03T01:30:00',
        timezone: 'America/New_York',
        duration_minutes: 30,
      });

      expect(res.status).toBe(201);
      expect(res.body.starts_at).toBe('2024-11-03T01:30:00-04:00');
    });
  });

  describe('Requirement 10: Cross-Timezone Overlap Normalization', () => {
    it('detects overlap across different timezones by normalizing to UTC', async () => {
      // 12:00 EDT = 16:00 UTC (1 hr -> ends 17:00 UTC)
      await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_ny',
        local_start_time: '2024-05-15T12:00:00',
        timezone: 'America/New_York',
        duration_minutes: 60,
      });

      // 09:30 PDT = 16:30 UTC (overlaps with 16:00 - 17:00 UTC) -> 409 Conflict
      const res = await request(app).post('/api/bookings').send({
        professor_id: 'prof_A',
        student_id: 'student_la',
        local_start_time: '2024-05-15T09:30:00',
        timezone: 'America/Los_Angeles',
        duration_minutes: 60,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/overlap/i);
    });
  });
});
