import { Booking, CreateBookingDTO } from '../entities/BookingEntity';
import { IBookingRepository } from './IBookingRepository';

export class MockBookingRepository implements IBookingRepository {
  private bookings: Booking[] = [];
  private nextId = 1;

  async save(booking: CreateBookingDTO): Promise<Booking> {
    const newBooking: Booking = {
      id: this.nextId++,
      professor_id: booking.professor_id,
      student_id: booking.student_id,
      starts_at_utc: new Date(booking.starts_at_utc),
      duration_minutes: booking.duration_minutes,
      original_timezone: booking.original_timezone,
    };
    this.bookings.push(newBooking);
    return { ...newBooking };
  }

  async findOverlapping(professorId: string, startUtc: Date, endUtc: Date): Promise<Booking[]> {
    const newStart = startUtc.getTime();
    const newEnd = endUtc.getTime();

    return this.bookings.filter((b) => {
      if (b.professor_id !== professorId) {
        return false;
      }
      const bStart = new Date(b.starts_at_utc).getTime();
      const bEnd = bStart + b.duration_minutes * 60 * 1000;

      // Overlap: (startA < endB) AND (endA > startB)
      return newStart < bEnd && newEnd > bStart;
    });
  }

  async findByProfessor(professorId: string): Promise<Booking[]> {
    return this.bookings
      .filter((b) => b.professor_id === professorId)
      .map((b) => ({ ...b }));
  }

  async findAll(): Promise<Booking[]> {
    return this.bookings.map((b) => ({ ...b }));
  }

  clear(): void {
    this.bookings = [];
    this.nextId = 1;
  }
}
