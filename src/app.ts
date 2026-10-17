import express, { Application, Request, Response } from 'express';
import { BookingService } from './services/BookingService';
import { BookingController } from './controllers/BookingController';

export function createApp(bookingService: BookingService): Application {
  const app: Application = express();

  app.use(express.json());

  const controller = new BookingController(bookingService);

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Booking endpoints
  app.post('/api/bookings', controller.createBooking);
  app.get('/api/bookings', controller.getBookings);

  return app;
}
