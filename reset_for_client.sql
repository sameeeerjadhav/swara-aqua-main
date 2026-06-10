-- ============================================================
--  SWARA AQUA — Client Delivery Reset Script
--  Run this ONCE on the live database before handing over.
--  Deletes ALL test data and resets all ID counters to 1.
-- ============================================================

-- Step 1: Disable foreign key checks so we can truncate in any order
SET FOREIGN_KEY_CHECKS = 0;

-- Step 2: Truncate every table (resets AUTO_INCREMENT to 1)
TRUNCATE TABLE order_timeline;
TRUNCATE TABLE deliveries;
TRUNCATE TABLE casual_deliveries;
TRUNCATE TABLE cancel_requests;
TRUNCATE TABLE transactions;
TRUNCATE TABLE wallet_transactions;
TRUNCATE TABLE cash_submissions;
TRUNCATE TABLE bills;
TRUNCATE TABLE notifications;
TRUNCATE TABLE device_tokens;
TRUNCATE TABLE inventory_logs;
TRUNCATE TABLE staff_inventory;
TRUNCATE TABLE subscription_slots;
TRUNCATE TABLE subscriptions;
TRUNCATE TABLE orders;
TRUNCATE TABLE user_addresses;
TRUNCATE TABLE banners;
TRUNCATE TABLE users;

-- Step 3: Reset inventory to zero
TRUNCATE TABLE inventory;
INSERT INTO inventory (id, total_jars, available_jars, low_stock_threshold)
VALUES (1, 0, 0, 20);

-- Step 4: Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Step 5: Seed the default admin account
--   Phone: 0000000000
--   Password: admin@123  (bcrypt hash below)
INSERT INTO users (id, name, phone, password, role, status)
VALUES (
  1,
  'Admin',
  '0000000000',
  '$2a$12$jffF5LgXrYE/gMeu71HC5umzm9unPD5cl9aoqVWNjSsin920ZiueO',
  'admin',
  'active'
);

-- Step 6: Restore default app settings
INSERT IGNORE INTO app_settings (setting_key, setting_value)
VALUES
  ('booking_start_time', '08:00'),
  ('booking_end_time',   '18:00');

-- ============================================================
--  Done! All IDs will now start from 1 for real client data.
--  Admin login: phone=0000000000  password=admin@123
-- ============================================================
