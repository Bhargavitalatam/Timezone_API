import { Booking, CreateBookingDTO } from '../entities/BookingEntity';

export interface IBookingRepository {
  save(booking: CreateBookingDTO): Promise<Booking>;
  findOverlapping(professorId: string, startUtc: Date, endUtc: Date): Promise<Booking[]>;
  findByProfessor(professorId: string): Promise<Booking[]>;
  findAll?(): Promise<Booking[]>;
}
