-- ============================================================
-- Swara Aqua — Wallet → Advance Payment Migration
-- Run this ONCE on your MySQL database.
-- Safe to run: uses CHANGE COLUMN (rename only, no data loss)
-- ============================================================

-- Step 1: Rename wallet_balance → prepaid_balance on users table
--   (The existing advance_balance column stays UNTOUCHED — it is
--    used by the billing module for monthly advance adjustments)
ALTER TABLE users
  CHANGE wallet_balance  prepaid_balance  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  CHANGE wallet_access   advance_access   ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none';

-- Step 2: Rename wallet_transactions table → advance_transactions
RENAME TABLE wallet_transactions TO advance_transactions;

-- Verify: check column names on users
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
--   AND COLUMN_NAME IN ('prepaid_balance', 'advance_balance', 'advance_access');

-- Verify: check advance_transactions exists
-- SHOW TABLES LIKE 'advance_transactions';
