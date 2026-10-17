-- Database table definition for Campus Office Hours Booking
CREATE TABLE IF NOT EXISTS office_hour_bookings (
    id SERIAL PRIMARY KEY,
    professor_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    starts_at_utc TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL,
    original_timezone VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_prof_starts_at ON office_hour_bookings (professor_id, starts_at_utc);
