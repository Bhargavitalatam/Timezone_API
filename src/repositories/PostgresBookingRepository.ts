import { DataSource, Repository } from 'typeorm';
import { Booking, BookingEntity, CreateBookingDTO } from '../entities/BookingEntity';
import { IBookingRepository } from './IBookingRepository';

export class PostgresBookingRepository implements IBookingRepository {
  private repository: Repository<BookingEntity>;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(BookingEntity);
  }

  async save(booking: CreateBookingDTO): Promise<Booking> {
    const entity = this.repository.create({
      professor_id: booking.professor_id,
      student_id: booking.student_id,
      starts_at_utc: booking.starts_at_utc,
      duration_minutes: booking.duration_minutes,
      original_timezone: booking.original_timezone,
    });
    const saved = await this.repository.save(entity);
    return {
      id: saved.id,
      professor_id: saved.professor_id,
      student_id: saved.student_id,
      starts_at_utc: new Date(saved.starts_at_utc),
      duration_minutes: saved.duration_minutes,
      original_timezone: saved.original_timezone,
    };
  }

  async findOverlapping(professorId: string, startUtc: Date, endUtc: Date): Promise<Booking[]> {
    // Condition: (startA < endB) AND (endA > startB)
    // where starts_at_utc is startA, starts_at_utc + interval is endA
    const rawResults = await this.dataSource.query(
      `SELECT id, professor_id, student_id, starts_at_utc, duration_minutes, original_timezone
       FROM office_hour_bookings
       WHERE professor_id = $1
         AND starts_at_utc < $3
         AND (starts_at_utc + (duration_minutes * interval '1 minute')) > $2`,
      [professorId, startUtc.toISOString(), endUtc.toISOString()]
    );

    return rawResults.map((r: any) => ({
      id: Number(r.id),
      professor_id: r.professor_id,
      student_id: r.student_id,
      starts_at_utc: new Date(r.starts_at_utc),
      duration_minutes: Number(r.duration_minutes),
      original_timezone: r.original_timezone,
    }));
  }

  async findByProfessor(professorId: string): Promise<Booking[]> {
    const results = await this.repository.find({
      where: { professor_id: professorId },
      order: { starts_at_utc: 'ASC' },
    });

    return results.map((r) => ({
      id: r.id,
      professor_id: r.professor_id,
      student_id: r.student_id,
      starts_at_utc: new Date(r.starts_at_utc),
      duration_minutes: r.duration_minutes,
      original_timezone: r.original_timezone,
    }));
  }

  async findAll(): Promise<Booking[]> {
    const results = await this.repository.find({
      order: { starts_at_utc: 'ASC' },
    });

    return results.map((r) => ({
      id: r.id,
      professor_id: r.professor_id,
      student_id: r.student_id,
      starts_at_utc: new Date(r.starts_at_utc),
      duration_minutes: r.duration_minutes,
      original_timezone: r.original_timezone,
    }));
  }
}
