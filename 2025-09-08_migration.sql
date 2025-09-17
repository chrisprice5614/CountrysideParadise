-- 2025-09-08: Booking enhancements
PRAGMA foreign_keys=ON;

-- Ensure bookings table exists (idempotent statement for reference)
-- CREATE TABLE IF NOT EXISTS bookings (...);

-- Add missing customer fields
ALTER TABLE bookings ADD COLUMN customer_name TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN customer_email TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN customer_phone TEXT DEFAULT '';

-- Track money at the booking level
ALTER TABLE bookings ADD COLUMN total_cents INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN amount_paid_cents INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'pending'; -- pending|confirmed|canceled

-- Optional: link to Stripe objects
ALTER TABLE bookings ADD COLUMN stripe_pi TEXT;       -- payment_intent id for downpayment
ALTER TABLE bookings ADD COLUMN stripe_invoice TEXT;  -- invoice id for remainder (if used)

-- Enforce only one active booking per date (ignoring canceled)
-- We emulate by creating a partial index using a trigger since SQLite lacks partial unique indexes.
CREATE TABLE IF NOT EXISTS single_booking_guard (
  date TEXT PRIMARY KEY
);

-- Trigger to maintain the guard (one active booking per date)
CREATE TRIGGER IF NOT EXISTS trg_booking_insert_guard
AFTER INSERT ON bookings
WHEN NEW.status != 'canceled'
BEGIN
  INSERT OR FAIL INTO single_booking_guard(date) VALUES (NEW.date);
END;

CREATE TRIGGER IF NOT EXISTS trg_booking_update_guard
AFTER UPDATE OF status, date ON bookings
BEGIN
  -- Remove old guard row if old row was active
  DELETE FROM single_booking_guard WHERE date = OLD.date;
  -- Add new guard row if new row is active
  INSERT OR IGNORE INTO single_booking_guard(date) VALUES (NEW.date);
END;

-- Available dates table (admin-managed) with capacity of 1 by default
CREATE TABLE IF NOT EXISTS available_dates (
  id INTEGER PRIMARY KEY,
  date TEXT UNIQUE NOT NULL,
  max_bookings INTEGER DEFAULT 1
);
