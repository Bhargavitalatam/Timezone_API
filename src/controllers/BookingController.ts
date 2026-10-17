import { Request, Response } from 'express';
import { BookingService, ValidationError, OverlapError } from '../services/BookingService';

export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  createBooking = async (req: Request, res: Response): Promise<void> => {
    try {
      const { professor_id, student_id, local_start_time, timezone, duration_minutes } = req.body;

      const result = await this.bookingService.createBooking({
        professor_id,
        student_id,
        local_start_time,
        timezone,
        duration_minutes,
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof OverlapError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error('Unexpected error in createBooking:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getBookings = async (req: Request, res: Response): Promise<void> => {
    try {
      const professorId = req.query.professor_id as string | undefined;

      if (professorId !== undefined && professorId !== '') {
        const bookings = await this.bookingService.getBookingsByProfessor(professorId);
        res.status(200).json(bookings);
        return;
      }

      // If no professor_id query param is supplied, return all bookings
      const bookings = await this.bookingService.getAllBookings();
      res.status(200).json(bookings);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error('Unexpected error in getBookings:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
