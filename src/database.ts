import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BookingEntity } from './entities/BookingEntity';
import dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'campus_bookings',
  synchronize: true, // Ensures schema is created if not present
  logging: process.env.NODE_ENV === 'development',
  entities: [BookingEntity],
  subscribers: [],
  migrations: [],
});

export async function initializeDatabase(retries = 10, delayMs = 3000): Promise<DataSource> {
  for (let i = 0; i < retries; i++) {
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        console.log('PostgreSQL database connection established successfully.');
      }
      return AppDataSource;
    } catch (err: any) {
      console.warn(`Database connection attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i === retries - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return AppDataSource;
}
