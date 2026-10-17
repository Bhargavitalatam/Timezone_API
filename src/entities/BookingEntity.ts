import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export interface Booking {
  id: number;
  professor_id: string;
  student_id: string;
  starts_at_utc: Date;
  duration_minutes: number;
  original_timezone: string;
}

export type CreateBookingDTO = Omit<Booking, 'id'>;

@Entity({ name: 'office_hour_bookings' })
export class BookingEntity implements Booking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  professor_id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  student_id!: string;

  @Column({ type: 'timestamptz', nullable: false })
  starts_at_utc!: Date;

  @Column({ type: 'int', nullable: false })
  duration_minutes!: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  original_timezone!: string;
}
