-- ── Add profile_photo column to users table ────────────────────────────────────
-- Run this once on your database (local dev + production)

ALTER TABLE users
  ADD COLUMN profile_photo VARCHAR(512) NULL DEFAULT NULL
  AFTER status;
