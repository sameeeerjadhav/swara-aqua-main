-- ============================================================
--  SWARA AQUA — Client Reset Script (DELETE + AUTO_INCREMENT)
--  Works in phpMyAdmin without any FK session tricks.
--
--  HOW TO RUN:
--    1. phpMyAdmin → select your database
--    2. SQL tab → paste entire file → click Go
-- ============================================================

-- ── Step 1: DELETE in child-first order (respects FK constraints) ──

DELETE FROM `order_timeline`;
DELETE FROM `deliveries`;
DELETE FROM `pending_payments`;
DELETE FROM `subscription_slots`;
DELETE FROM `cancel_requests`;
DELETE FROM `transactions`;
DELETE FROM `advance_transactions`;
DELETE FROM `wallet_transactions`;
DELETE FROM `cash_submissions`;
DELETE FROM `bills`;
DELETE FROM `notifications`;
DELETE FROM `device_tokens`;
DELETE FROM `inventory_logs`;
DELETE FROM `staff_inventory`;
DELETE FROM `casual_deliveries`;
DELETE FROM `user_addresses`;
DELETE FROM `banners`;
DELETE FROM `subscriptions`;
DELETE FROM `orders`;
DELETE FROM `users`;
DELETE FROM `inventory`;

-- ── Step 2: Reset AUTO_INCREMENT to 1 on every table ──

ALTER TABLE `order_timeline`      AUTO_INCREMENT = 1;
ALTER TABLE `deliveries`          AUTO_INCREMENT = 1;
ALTER TABLE `pending_payments`    AUTO_INCREMENT = 1;
ALTER TABLE `subscription_slots`  AUTO_INCREMENT = 1;
ALTER TABLE `cancel_requests`     AUTO_INCREMENT = 1;
ALTER TABLE `transactions`        AUTO_INCREMENT = 1;
ALTER TABLE `advance_transactions` AUTO_INCREMENT = 1;
ALTER TABLE `wallet_transactions` AUTO_INCREMENT = 1;
ALTER TABLE `cash_submissions`    AUTO_INCREMENT = 1;
ALTER TABLE `bills`               AUTO_INCREMENT = 1;
ALTER TABLE `notifications`       AUTO_INCREMENT = 1;
ALTER TABLE `device_tokens`       AUTO_INCREMENT = 1;
ALTER TABLE `inventory_logs`      AUTO_INCREMENT = 1;
ALTER TABLE `staff_inventory`     AUTO_INCREMENT = 1;
ALTER TABLE `casual_deliveries`   AUTO_INCREMENT = 1;
ALTER TABLE `user_addresses`      AUTO_INCREMENT = 1;
ALTER TABLE `banners`             AUTO_INCREMENT = 1;
ALTER TABLE `subscriptions`       AUTO_INCREMENT = 1;
ALTER TABLE `orders`              AUTO_INCREMENT = 1;
ALTER TABLE `users`               AUTO_INCREMENT = 1;
ALTER TABLE `inventory`           AUTO_INCREMENT = 1;

-- ── Step 3: Re-seed required data ────────────────────────

-- Inventory (needs exactly one row)
INSERT INTO `inventory` (id, total_jars, available_jars, low_stock_threshold)
VALUES (1, 0, 0, 20);

-- Admin account
INSERT INTO `users` (id, name, phone, password, role, status)
VALUES (
  1,
  'Admin',
  '8788743507',
  '$2a$12$mhZxfilLyjKOX.6JUXt.f.F.ugqDuaylroQq2QhDRt53tuL0Wk9bu',
  'admin',
  'active'
);

-- App settings
INSERT IGNORE INTO `app_settings` (setting_key, setting_value)
VALUES
  ('booking_start_time', '08:00'),
  ('booking_end_time',   '18:00');

-- ============================================================
--  Done! All IDs start from 1. Admin login: 8380038838
-- ============================================================
