import { IBookingRepository } from '../repositories/IBookingRepository';
import {
  TimezoneUtil,
  InvalidTimezoneError,
  InvalidLocalTimeError,
} from '../utils/timezone';

export interface CreateBookingRequest {
  professor_id: string;
  student_id: string;
  local_start_time: string;
  timezone: string;
  duration_minutes: number;
}

export interface BookingResponse {
  id: number | string;
  professor_id: string;
  student_id: string;
  starts_at: string;
  duration_minutes: number;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class OverlapError extends Error {
  constructor(message: string = 'Booking overlaps with an existing booking for this professor') {
    super(message);
    this.name = 'OverlapError';
  }
}

export class BookingService {
  constructor(private readonly repository: IBookingRepository) {}

  async createBooking(dto: CreateBookingRequest): Promise<BookingResponse> {
    // 1. Validate fields
    if (!dto.professor_id || typeof dto.professor_id !== 'string' || dto.professor_id.trim() === '') {
      throw new ValidationError("Field 'professor_id' is required and must be a non-empty string");
    }
    if (!dto.student_id || typeof dto.student_id !== 'string' || dto.student_id.trim() === '') {
      throw new ValidationError("Field 'student_id' is required and must be a non-empty string");
    }
    if (
      dto.duration_minutes === undefined ||
      dto.duration_minutes === null ||
      typeof dto.duration_minutes !== 'number' ||
      !Number.isInteger(dto.duration_minutes) ||
      dto.duration_minutes <= 0
    ) {
      throw new ValidationError("Field 'duration_minutes' must be a positive integer greater than 0");
    }

    // 2. Convert local time + timezone to UTC (with DST gap validation)
    let startUtc: Date;
    try {
      const parsed = TimezoneUtil.parseLocalTimeToUtc(dto.local_start_time, dto.timezone);
      startUtc = parsed.startUtc;
    } catch (err) {
      if (err instanceof InvalidTimezoneError || err instanceof InvalidLocalTimeError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }

    // 3. Calculate end time in UTC
    const endUtc = new Date(startUtc.getTime() + dto.duration_minutes * 60 * 1000);

    // 4. Check for overlapping bookings for this professor
    const overlapping = await this.repository.findOverlapping(dto.professor_id, startUtc, endUtc);
    if (overlapping && overlapping.length > 0) {
      throw new OverlapError(
        `Booking overlaps with an existing booking for professor '${dto.professor_id}'`
      );
    }

    // 5. Persist booking entity
    const saved = await this.repository.save({
      professor_id: dto.professor_id,
      student_id: dto.student_id,
      starts_at_utc: startUtc,
      duration_minutes: dto.duration_minutes,
      original_timezone: dto.timezone,
    });

    // 6. Format and return response with exact timezone offset
    return {
      id: saved.id,
      professor_id: saved.professor_id,
      student_id: saved.student_id,
      starts_at: TimezoneUtil.formatWithOffset(saved.starts_at_utc, saved.original_timezone),
      duration_minutes: saved.duration_minutes,
    };
  }

  async getBookingsByProfessor(professorId: string): Promise<BookingResponse[]> {
    if (!professorId || typeof professorId !== 'string' || professorId.trim() === '') {
      throw new ValidationError("Query parameter 'professor_id' is required and must be non-empty");
    }

    const bookings = await this.repository.findByProfessor(professorId);

    return bookings.map((b) => ({
      id: b.id,
      professor_id: b.professor_id,
      student_id: b.student_id,
      starts_at: TimezoneUtil.formatWithOffset(b.starts_at_utc, b.original_timezone),
      duration_minutes: b.duration_minutes,
    }));
  }

  async getAllBookings(): Promise<BookingResponse[]> {
    const bookings = this.repository.findAll ? await this.repository.findAll() : [];
    return bookings.map((b) => ({
      id: b.id,
      professor_id: b.professor_id,
      student_id: b.student_id,
      starts_at: TimezoneUtil.formatWithOffset(b.starts_at_utc, b.original_timezone),
      duration_minutes: b.duration_minutes,
    }));
  }
}
