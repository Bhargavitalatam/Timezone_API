import 'reflect-metadata';
import dotenv from 'dotenv';
import { initializeDatabase } from './database';
import { PostgresBookingRepository } from './repositories/PostgresBookingRepository';
import { BookingService } from './services/BookingService';
import { createApp } from './app';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  try {
    console.log('Connecting to PostgreSQL database...');
    const dataSource = await initializeDatabase();

    const bookingRepository = new PostgresBookingRepository(dataSource);
    const bookingService = new BookingService(bookingRepository);
    const app = createApp(bookingService);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Office Hours Booking API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

startServer();
