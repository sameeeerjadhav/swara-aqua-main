-- ============================================================
-- Billing Breakdown Migration
-- IMPORTANT: Select your database in phpMyAdmin first!
-- Run AFTER migrate_pay_later.sql
-- ============================================================

-- 1. Add payment breakdown columns to bills table
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS cash_paid        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_paid      DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_paid     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_later_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 2. Backfill: set advance_paid = advance_used for existing bills
UPDATE bills SET advance_paid = advance_used WHERE advance_paid = 0 AND advance_used > 0;

-- 3. Backfill: set paid_amount as the running total for existing bills
--    (existing paid_amount is already correct as a total, leave it)
