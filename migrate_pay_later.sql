-- ============================================================
-- Pay Later Feature Migration
-- Run this on Hostinger DB before deploying the new build
-- ============================================================

-- 1. Add pending_balance to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_balance DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 2. Extend deliveries.payment_mode to include 'pay_later'
ALTER TABLE deliveries
  MODIFY COLUMN payment_mode ENUM('cash','online','advance','pay_later') NOT NULL;

-- 3. Itemized log of each pay-later entry
CREATE TABLE IF NOT EXISTS pending_payments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  customer_id         INT NOT NULL,
  order_id            INT NOT NULL,
  amount              DECIMAL(10,2) NOT NULL,
  status              ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  paid_at             DATETIME NULL,
  razorpay_order_id   VARCHAR(64)  NULL,
  razorpay_payment_id VARCHAR(64)  NULL,
  created_at          DATETIME NOT NULL DEFAULT NOW(),
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE
);
