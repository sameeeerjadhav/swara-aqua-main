-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Jun 10, 2026 at 06:13 AM
-- Server version: 11.8.6-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `u182510996_swara_aqua`
--

-- --------------------------------------------------------

--
-- Table structure for table `advance_transactions`
--

CREATE TABLE `advance_transactions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('credit','debit') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `mode` enum('razorpay','cash','wallet','refund') NOT NULL DEFAULT 'razorpay',
  `status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
  `reference_id` varchar(255) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `advance_transactions`
--

INSERT INTO `advance_transactions` (`id`, `user_id`, `type`, `amount`, `mode`, `status`, `reference_id`, `note`, `created_at`) VALUES
(1, 11, 'credit', 5.00, 'razorpay', 'completed', 'pay_SxonhmKOPECXgB', 'Advance credit via Razorpay', '2026-06-05 04:30:09'),
(2, 11, 'debit', 2.00, '', 'completed', '8', 'Payment for Order #8', '2026-06-05 04:30:59');

-- --------------------------------------------------------

--
-- Table structure for table `app_settings`
--

CREATE TABLE `app_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` varchar(500) NOT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `app_settings`
--

INSERT INTO `app_settings` (`setting_key`, `setting_value`, `updated_at`) VALUES
('booking_end_time', '18:00', '2026-06-03 11:17:58'),
('booking_start_time', '08:00', '2026-06-03 11:17:58');

-- --------------------------------------------------------

--
-- Table structure for table `banners`
--

CREATE TABLE `banners` (
  `id` int(11) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `image_url` varchar(500) NOT NULL,
  `link_url` varchar(500) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `banners`
--

INSERT INTO `banners` (`id`, `title`, `image_url`, `link_url`, `sort_order`, `is_active`, `created_by`, `created_at`) VALUES
(1, NULL, '/uploads/banners/banner_1780598041111.jpg', NULL, 0, 1, 2, '2026-06-04 18:34:01'),
(2, NULL, '/uploads/banners/banner_1780929672631.jpg', NULL, 0, 1, 2, '2026-06-08 14:41:12');

-- --------------------------------------------------------

--
-- Table structure for table `bills`
--

CREATE TABLE `bills` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `month` char(7) NOT NULL,
  `total_jars` int(11) NOT NULL DEFAULT 0,
  `jar_rate` decimal(10,2) NOT NULL DEFAULT 50.00,
  `subtotal` decimal(10,2) NOT NULL DEFAULT 0.00,
  `previous_pending` decimal(10,2) NOT NULL DEFAULT 0.00,
  `advance_used` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `paid_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('paid','partial','unpaid') NOT NULL DEFAULT 'unpaid',
  `due_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `cash_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
  `online_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
  `advance_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
  `pay_later_amount` decimal(10,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `bills`
--

INSERT INTO `bills` (`id`, `customer_id`, `month`, `total_jars`, `jar_rate`, `subtotal`, `previous_pending`, `advance_used`, `total_amount`, `paid_amount`, `status`, `due_date`, `created_at`, `cash_paid`, `online_paid`, `advance_paid`, `pay_later_amount`) VALUES
(1, 11, '2026-06', 2, 50.00, 100.00, 0.00, 0.00, 100.00, 100.00, 'paid', '2026-07-10', '2026-06-03 14:49:38', 100.00, 0.00, 0.00, 0.00);

-- --------------------------------------------------------

--
-- Table structure for table `cancel_requests`
--

CREATE TABLE `cancel_requests` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` int(11) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cash_submissions`
--

CREATE TABLE `cash_submissions` (
  `id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `total_cash` decimal(10,2) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `status` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  `verified_by` int(11) DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT current_timestamp(),
  `verified_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `casual_deliveries`
--

CREATE TABLE `casual_deliveries` (
  `id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `person_name` varchar(150) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `amount_collected` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_mode` enum('cash','online','credit') NOT NULL DEFAULT 'cash',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `deliveries`
--

CREATE TABLE `deliveries` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `delivered_quantity` int(11) NOT NULL,
  `collected_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_mode` enum('cash','online','advance','pay_later') NOT NULL,
  `status` enum('pending','delivered') NOT NULL DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `deliveries`
--

INSERT INTO `deliveries` (`id`, `order_id`, `staff_id`, `delivered_quantity`, `collected_amount`, `payment_mode`, `status`, `notes`, `delivered_at`, `created_at`) VALUES
(1, 1, 12, 2, 100.00, 'online', 'delivered', NULL, '2026-06-03 14:46:21', '2026-06-03 14:46:21'),
(2, 9, 12, 5, 0.00, 'pay_later', 'delivered', NULL, '2026-06-05 05:28:33', '2026-06-05 05:28:33'),
(3, 10, 12, 5, 0.00, 'cash', 'delivered', NULL, '2026-06-08 14:35:25', '2026-06-08 14:35:25');

-- --------------------------------------------------------

--
-- Table structure for table `device_tokens`
--

CREATE TABLE `device_tokens` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `token` varchar(512) NOT NULL,
  `platform` varchar(20) DEFAULT 'web',
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `device_tokens`
--

INSERT INTO `device_tokens` (`id`, `user_id`, `token`, `platform`, `created_at`) VALUES
(37, 2, 'fWFqFLh_xxhnD64SNoslCz:APA91bHLjcvil4hsBMIR9TuKAqeEbPKxYNLnzQhvO6T77_kwLkYb_s9Y_8HxFl6kjgrIViwgSO33gf7gh_85-W3NDX6n84pjcU-BgpEiC96G2_nwdT-2I28', 'web', '2026-06-04 11:55:46'),
(38, 2, 'fWFqFLh_xxhnD64SNoslCz:APA91bFyGoHEJHxS30aiO9j69ZBFUMpBocr70_8DZWiX0INNAzqyGzZQil-t8Stk7pRWBpHaV4VYD-OuArurLcS2Z_dCARsWPn-ZRFZRXROcNwjALY__h7U', 'web', '2026-06-04 11:55:46'),
(176, 2, 'fv9DZ7DNNCZTN56xJG5Cn9:APA91bGGUIqBzyAVeasDMGxX5AKejDagFh_jtge3zWQ3AVGeg57rwN7pw8PvPvuE9DpNmqBjoYLFHbNB9XRTQguH33ywRaNd7E3GwcEtYLQLk25-lPytyfM', 'web', '2026-06-08 14:45:09'),
(185, 12, 'cUwtA7WKoSuReHITtI5YiD:APA91bF6rUrOhTxmFpZfASeRn_-hfJaSZItVV_BI0KPvLL_R8l1_PvQs2_3B0jR5ih4LXEBhSyif31UwIIolZv5bmCzBTEvrqOeGg20RdO2PvMVblTA-6pw', 'web', '2026-06-08 15:56:23'),
(195, 11, 'dmwGq7t-92Cxs0MJOGBWp4:APA91bEZFFrj6QYfqTs8RNtTqX4Xlf9Mg5q7J5tiFCuWkBKm9ES261E9wtA5CxRL6C22b-k9vt5a9NIwb3bJwuVIg8n24E2teUccxVHK0ZzBmTC4weOlZx0', 'web', '2026-06-08 16:48:37'),
(196, 11, 'dmwGq7t-92Cxs0MJOGBWp4:APA91bHcHhlAsURwW0QMcQek7OovleaUxYtMcRGmM21wSM0pEMyRNuedCrEc5Tz9odPRT-CBkLnyfAosH8FrZXi-zP6UzMzb5OsIXaySHiM9BM8MQ7nPk7Q', 'web', '2026-06-08 16:48:37'),
(197, 11, 'dmwGq7t-92Cxs0MJOGBWp4:APA91bGunNwrIChA-JoB2iifpxi0_zY_buG8YXnqTmTdioipZiFxWPh0HWpzTBRyBy3wQNdH8_eAa8XVC4orEGoFaj1g8eEQn8idGmVA2mitumEr17vcZBw', 'web', '2026-06-08 16:48:38'),
(199, 11, 'dmwGq7t-92Cxs0MJOGBWp4:APA91bGg3hYgMi04_fKVgqqFscCGwjGaIgs-UjrMJalYW_msoQtbx078q1S56iGDqPevWjtTh-MIDQ0Tc8UI6_rqSk96snqWr-Xh-WQt4W0Zpm23ZfMEGJ4', 'web', '2026-06-08 16:48:54');

-- --------------------------------------------------------

--
-- Table structure for table `inventory`
--

CREATE TABLE `inventory` (
  `id` int(11) NOT NULL,
  `total_jars` int(11) NOT NULL DEFAULT 0,
  `available_jars` int(11) NOT NULL DEFAULT 0,
  `low_stock_threshold` int(11) NOT NULL DEFAULT 20,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `inventory`
--

INSERT INTO `inventory` (`id`, `total_jars`, `available_jars`, `low_stock_threshold`, `updated_at`) VALUES
(1, 0, 0, 20, '2026-06-03 11:05:48');

-- --------------------------------------------------------

--
-- Table structure for table `inventory_logs`
--

CREATE TABLE `inventory_logs` (
  `id` int(11) NOT NULL,
  `type` enum('add','assign','return','delivered','damaged') NOT NULL,
  `quantity` int(11) NOT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `inventory_logs`
--

INSERT INTO `inventory_logs` (`id`, `type`, `quantity`, `reference_id`, `note`, `created_by`, `created_at`) VALUES
(1, 'delivered', 2, 1, 'Delivered 2 jars for order #1', 12, '2026-06-03 14:46:21'),
(2, 'delivered', 5, 9, 'Delivered 5 jars for order #9', 12, '2026-06-05 05:28:33'),
(3, 'delivered', 5, 10, 'Delivered 5 jars for order #10', 12, '2026-06-08 14:35:25');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `type` varchar(50) DEFAULT 'general',
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `title`, `body`, `type`, `data`, `is_read`, `created_at`) VALUES
(1, 12, 'New Delivery Assigned! 📦', 'Order #1 — 2 jars from Customer 1', 'delivery', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:45:22'),
(3, 11, 'Order Placed ✅', 'Your order #1 for 2 jars has been placed.', 'order', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:45:22'),
(4, 2, 'New Order 📦', 'Order #1 — 2 jars for Customer 1', 'order', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:45:22'),
(5, 11, 'Order Delivered! 🎉', 'Your order of 2 jars has been delivered. Amount collected: ₹100.00.', 'order', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:46:21'),
(6, 12, 'Order Delivered', 'Order #1 — 2 jars for Customer 1 has been delivered.', 'delivery', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:46:21'),
(7, 11, '📄 Monthly Bill Ready', 'Your bill for 2026-06 has been generated. Please check and pay before the due date.', 'payment', '{}', 1, '2026-06-03 14:49:38'),
(8, 12, 'New Delivery Assigned! 📦', 'Order #2 — 4 jars from Customer 1', 'delivery', '{\"orderId\":\"2\"}', 1, '2026-06-03 14:51:59'),
(9, 11, 'Order Scheduled 📅', 'Your 4 jar order is scheduled for tomorrow.', 'order', '{\"orderId\":\"2\"}', 1, '2026-06-03 14:51:59'),
(11, 2, 'New Order 📦', 'Order #2 — 4 jars from Customer 1', 'order', '{\"orderId\":\"2\"}', 1, '2026-06-03 14:51:59'),
(12, 11, '✅ Payment Successful!', '₹100 paid for Order #1 via Razorpay.', 'payment', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:55:42'),
(14, 2, '💳 Online Payment Received', 'Order #1 — ₹100 paid online by customer.', 'payment', '{\"orderId\":\"1\"}', 1, '2026-06-03 14:55:42'),
(15, 11, '✅ Payment Successful!', '₹200 paid for Order #2 via Razorpay.', 'payment', '{\"orderId\":\"2\"}', 1, '2026-06-03 15:05:42'),
(17, 2, '💳 Online Payment Received', 'Order #2 — ₹200 paid online by customer.', 'payment', '{\"orderId\":\"2\"}', 1, '2026-06-03 15:05:42'),
(18, 12, 'New Delivery Assigned! 📦', 'Order #3 — 1 jars from Customer 1', 'delivery', '{\"orderId\":\"3\"}', 1, '2026-06-03 15:17:28'),
(20, 2, 'New Order 📦', 'Order #3 — 1 jars from Customer 1', 'order', '{\"orderId\":\"3\"}', 1, '2026-06-03 15:17:28'),
(21, 11, 'Order Scheduled 📅', 'Your 1 jar order is scheduled for tomorrow.', 'order', '{\"orderId\":\"3\"}', 1, '2026-06-03 15:17:28'),
(22, 11, '✅ Payment Successful!', '₹50 paid for Order #3 via Razorpay.', 'payment', '{\"orderId\":\"3\"}', 1, '2026-06-03 15:18:03'),
(24, 2, '💳 Online Payment Received', 'Order #3 — ₹50 paid online by customer.', 'payment', '{\"orderId\":\"3\"}', 1, '2026-06-03 15:18:03'),
(25, 12, 'New Delivery Assigned! 📦', 'Order #6 — 1 jars from Customer 1', 'delivery', '{\"orderId\":\"6\"}', 1, '2026-06-04 14:47:26'),
(26, 11, 'Order Scheduled 📅', 'Your 1 jar order is scheduled for tomorrow.', 'order', '{\"orderId\":\"6\"}', 1, '2026-06-04 14:47:26'),
(28, 2, 'New Order 📦', 'Order #6 — 1 jars from Customer 1', 'order', '{\"orderId\":\"6\"}', 1, '2026-06-04 14:47:26'),
(29, 11, '✅ Payment Successful!', '₹1 paid for Order #6 via Razorpay.', 'payment', '{\"orderId\":\"6\"}', 1, '2026-06-04 14:48:07'),
(31, 2, '💳 Online Payment Received', 'Order #6 — ₹1 paid online by customer.', 'payment', '{\"orderId\":\"6\"}', 1, '2026-06-04 14:48:07'),
(32, 12, 'New Delivery Assigned! 📦', 'Order #7 — 1 jars from Customer 1', 'delivery', '{\"orderId\":\"7\"}', 1, '2026-06-04 15:02:41'),
(33, 11, 'Order Scheduled 📅', 'Your 1 jar order is scheduled for tomorrow.', 'order', '{\"orderId\":\"7\"}', 1, '2026-06-04 15:02:41'),
(35, 2, 'New Order 📦', 'Order #7 — 1 jars from Customer 1', 'order', '{\"orderId\":\"7\"}', 1, '2026-06-04 15:02:41'),
(36, 11, '✅ Payment Successful!', '₹10 paid for Order #7 via Razorpay.', 'payment', '{\"orderId\":\"7\"}', 1, '2026-06-04 15:03:13'),
(38, 2, '💳 Online Payment Received', 'Order #7 — ₹10 paid online by customer.', 'payment', '{\"orderId\":\"7\"}', 1, '2026-06-04 15:03:13'),
(39, 2, '💳 Advance Payment Access Requested', 'A customer has requested advance payment access.', 'approval', '{}', 1, '2026-06-04 19:40:33'),
(40, 86, '💳 Advance Payment Access Requested', 'A customer has requested advance payment access.', 'approval', '{}', 0, '2026-06-04 19:40:33'),
(41, 92, '💳 Advance Payment Access Requested', 'A customer has requested advance payment access.', 'approval', '{}', 0, '2026-06-04 19:40:33'),
(42, 11, '✅ Advance Payment Access Approved!', 'Your advance payment account has been activated. You can now add credit and pay using advance balance.', 'payment', '{}', 1, '2026-06-04 19:54:55'),
(43, 11, '💰 Advance Credit Added!', '₹5 added to your advance balance. Total: ₹5', 'payment', '{}', 1, '2026-06-05 04:30:09'),
(44, 12, 'New Delivery Assigned! 📦', 'Order #8 — 2 jars from Customer', 'delivery', '{\"orderId\":\"8\"}', 1, '2026-06-05 04:30:59'),
(45, 11, 'Order Placed ✅', 'Your order #8 for 2 jars has been placed successfully.', 'order', '{\"orderId\":\"8\"}', 1, '2026-06-05 04:30:59'),
(46, 2, 'New Order 📦', 'Order #8 — 2 jars from Customer', 'order', '{\"orderId\":\"8\"}', 1, '2026-06-05 04:30:59'),
(47, 86, 'New Order 📦', 'Order #8 — 2 jars from Customer', 'order', '{\"orderId\":\"8\"}', 0, '2026-06-05 04:30:59'),
(48, 92, 'New Order 📦', 'Order #8 — 2 jars from Customer', 'order', '{\"orderId\":\"8\"}', 0, '2026-06-05 04:30:59'),
(49, 11, '✅ Payment Successful', 'Order #8 paid via advance balance. Remaining: ₹3', 'payment', '{}', 1, '2026-06-05 04:30:59'),
(50, 12, 'New Delivery Assigned! 📦', 'Order #9 — 5 jars from Customer', 'delivery', '{\"orderId\":\"9\"}', 1, '2026-06-05 05:21:31'),
(51, 11, 'Order Placed ✅', 'Your order #9 for 5 jars has been placed successfully.', 'order', '{\"orderId\":\"9\"}', 1, '2026-06-05 05:21:31'),
(52, 2, 'New Order 📦', 'Order #9 — 5 jars from Customer', 'order', '{\"orderId\":\"9\"}', 1, '2026-06-05 05:21:31'),
(53, 86, 'New Order 📦', 'Order #9 — 5 jars from Customer', 'order', '{\"orderId\":\"9\"}', 0, '2026-06-05 05:21:31'),
(54, 92, 'New Order 📦', 'Order #9 — 5 jars from Customer', 'order', '{\"orderId\":\"9\"}', 0, '2026-06-05 05:21:31'),
(55, 11, 'Order Delivered — Payment Pending 💳', 'Your order of 5 jars has been delivered. Payment of ₹5.00 is pending.', 'order', '{\"orderId\":\"9\"}', 1, '2026-06-05 05:28:33'),
(56, 12, 'Order Delivered', 'Order #9 — 5 jars for Customer has been delivered.', 'delivery', '{\"orderId\":\"9\"}', 1, '2026-06-05 05:28:33'),
(57, 11, '✅ Payment Recorded', '₹100 payment recorded for your 2026-06 bill.', 'payment', '{}', 1, '2026-06-05 06:04:00'),
(58, 12, 'New Delivery Assigned! 📦', 'Order #10 — 5 jars from Customer', 'delivery', '{\"orderId\":\"10\"}', 1, '2026-06-08 14:34:57'),
(59, 2, 'New Order 📦', 'Order #10 — 5 jars from Customer', 'order', '{\"orderId\":\"10\"}', 1, '2026-06-08 14:34:57'),
(60, 11, 'Order Scheduled 📅', 'Your 5 jar order is scheduled for tomorrow.', 'order', '{\"orderId\":\"10\"}', 1, '2026-06-08 14:34:57'),
(61, 86, 'New Order 📦', 'Order #10 — 5 jars from Customer', 'order', '{\"orderId\":\"10\"}', 0, '2026-06-08 14:34:57'),
(62, 92, 'New Order 📦', 'Order #10 — 5 jars from Customer', 'order', '{\"orderId\":\"10\"}', 0, '2026-06-08 14:34:57'),
(63, 11, 'Order Delivered! 🎉', 'Your order of 5 jars has been delivered. Amount collected: ₹0.', 'order', '{\"orderId\":\"10\"}', 1, '2026-06-08 14:35:25'),
(64, 12, 'Order Delivered', 'Order #10 — 5 jars for Customer has been delivered.', 'delivery', '{\"orderId\":\"10\"}', 1, '2026-06-08 14:35:25'),
(65, 2, 'New Customer Registration 👤', 'Saloni jadhav (21212121212) signed up — pending your approval', 'approval', '{\"userId\":\"178\",\"customerId\":\"178\"}', 1, '2026-06-08 14:45:01'),
(66, 86, 'New Customer Registration 👤', 'Saloni jadhav (21212121212) signed up — pending your approval', 'approval', '{\"userId\":\"178\",\"customerId\":\"178\"}', 0, '2026-06-08 14:45:01'),
(67, 92, 'New Customer Registration 👤', 'Saloni jadhav (21212121212) signed up — pending your approval', 'approval', '{\"userId\":\"178\",\"customerId\":\"178\"}', 0, '2026-06-08 14:45:01'),
(68, 178, '✅ Account Approved', 'Your account has been approved. You can now place orders.', 'approval', '{}', 0, '2026-06-08 14:46:53'),
(69, 12, 'New Delivery Assigned! 📦', 'Order #11 — 1 jars from Customer', 'delivery', '{\"orderId\":\"11\"}', 0, '2026-06-08 16:48:52'),
(70, 2, 'New Order 📦', 'Order #11 — 1 jars from Customer', 'order', '{\"orderId\":\"11\"}', 0, '2026-06-08 16:48:52'),
(71, 11, 'Order Scheduled 📅', 'Your 1 jar order is scheduled for tomorrow.', 'order', '{\"orderId\":\"11\"}', 0, '2026-06-08 16:48:52'),
(72, 86, 'New Order 📦', 'Order #11 — 1 jars from Customer', 'order', '{\"orderId\":\"11\"}', 0, '2026-06-08 16:48:52'),
(73, 92, 'New Order 📦', 'Order #11 — 1 jars from Customer', 'order', '{\"orderId\":\"11\"}', 0, '2026-06-08 16:48:52');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `staff_id` int(11) DEFAULT NULL,
  `type` enum('instant','preorder','monthly','bulk') NOT NULL DEFAULT 'instant',
  `quantity` int(11) NOT NULL,
  `price_per_jar` decimal(10,2) NOT NULL DEFAULT 50.00,
  `total_amount` decimal(10,2) NOT NULL,
  `status` enum('pending','assigned','delivered','completed','cancelled') NOT NULL DEFAULT 'pending',
  `delivery_date` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `address` varchar(500) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `subscription_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `customer_id`, `staff_id`, `type`, `quantity`, `price_per_jar`, `total_amount`, `status`, `delivery_date`, `notes`, `address`, `latitude`, `longitude`, `created_at`, `updated_at`, `subscription_id`) VALUES
(1, 11, 12, 'instant', 2, 50.00, 100.00, 'completed', NULL, NULL, 'Jalgaon', NULL, NULL, '2026-06-03 14:45:22', '2026-06-03 14:46:21', NULL),
(2, 11, 12, 'preorder', 4, 50.00, 200.00, 'assigned', '2026-06-04 08:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-03 14:51:59', '2026-06-03 14:51:59', NULL),
(3, 11, 12, 'preorder', 1, 50.00, 50.00, 'assigned', '2026-06-04 08:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-03 15:17:28', '2026-06-03 15:17:28', NULL),
(4, 11, 12, 'monthly', 1, 50.00, 50.00, 'cancelled', '2026-06-04 08:00:00', '[Morning] Auto-generated from subscription #1', 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-03 16:05:32', '2026-06-08 14:32:29', 1),
(5, 11, 12, 'monthly', 1, 50.00, 50.00, 'cancelled', '2026-06-04 13:00:00', '[Afternoon] Auto-generated from subscription #1', 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-03 16:05:32', '2026-06-08 14:32:29', 1),
(6, 11, 12, 'preorder', 1, 1.00, 1.00, 'assigned', '2026-06-05 08:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-04 14:47:26', '2026-06-04 14:47:26', NULL),
(7, 11, 12, 'preorder', 1, 10.00, 10.00, 'assigned', '2026-06-05 08:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-04 15:02:41', '2026-06-04 15:02:41', NULL),
(8, 11, 12, 'preorder', 2, 1.00, 2.00, '', '2026-06-07 12:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-05 04:30:59', '2026-06-05 04:30:59', NULL),
(9, 11, 12, 'instant', 5, 1.00, 5.00, 'completed', NULL, NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-05 05:21:31', '2026-06-05 05:28:33', NULL),
(10, 11, 12, 'preorder', 5, 1.00, 5.00, 'completed', '2026-06-09 08:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-08 14:34:57', '2026-06-08 14:35:25', NULL),
(11, 11, 12, 'preorder', 1, 1.00, 1.00, 'assigned', '2026-06-09 08:00:00', NULL, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, '2026-06-08 16:48:52', '2026-06-08 16:48:52', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `order_timeline`
--

CREATE TABLE `order_timeline` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `status` varchar(50) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `order_timeline`
--

INSERT INTO `order_timeline` (`id`, `order_id`, `status`, `note`, `created_by`, `created_at`) VALUES
(1, 1, 'pending', 'Order placed by admin on behalf of Customer 1', 2, '2026-06-03 14:45:22'),
(2, 1, 'assigned', 'Auto-assigned to staff 1', 2, '2026-06-03 14:45:22'),
(3, 1, 'completed', 'Status changed to completed', 12, '2026-06-03 14:46:21'),
(4, 2, 'pending', 'Order placed', 11, '2026-06-03 14:51:59'),
(5, 2, 'assigned', 'Auto-assigned to staff 1', 11, '2026-06-03 14:51:59'),
(6, 3, 'pending', 'Order placed', 11, '2026-06-03 15:17:28'),
(7, 3, 'assigned', 'Auto-assigned to staff 1', 11, '2026-06-03 15:17:28'),
(8, 4, 'pending', 'Order placed', 11, '2026-06-03 16:05:32'),
(9, 4, 'assigned', 'Auto-assigned to staff 1 (subscription)', NULL, '2026-06-03 16:05:32'),
(10, 5, 'pending', 'Order placed', 11, '2026-06-03 16:05:32'),
(11, 5, 'assigned', 'Auto-assigned to staff 1 (subscription)', NULL, '2026-06-03 16:05:32'),
(12, 6, 'pending', 'Order placed', 11, '2026-06-04 14:47:26'),
(13, 6, 'assigned', 'Auto-assigned to staff 1', 11, '2026-06-04 14:47:26'),
(14, 7, 'pending', 'Order placed', 11, '2026-06-04 15:02:41'),
(15, 7, 'assigned', 'Auto-assigned to staff 1', 11, '2026-06-04 15:02:41'),
(16, 8, 'pending', 'Order placed', 11, '2026-06-05 04:30:59'),
(17, 8, 'assigned', 'Auto-assigned to staff', 11, '2026-06-05 04:30:59'),
(18, 9, 'pending', 'Order placed', 11, '2026-06-05 05:21:31'),
(19, 9, 'assigned', 'Auto-assigned to staff', 11, '2026-06-05 05:21:31'),
(20, 9, 'completed', 'Status changed to completed', 12, '2026-06-05 05:28:33'),
(21, 10, 'pending', 'Order placed', 11, '2026-06-08 14:34:57'),
(22, 10, 'assigned', 'Auto-assigned to staff', 11, '2026-06-08 14:34:57'),
(23, 10, 'completed', 'Status changed to completed', 12, '2026-06-08 14:35:25'),
(24, 11, 'pending', 'Order placed', 11, '2026-06-08 16:48:52'),
(25, 11, 'assigned', 'Auto-assigned to staff', 11, '2026-06-08 16:48:52');

-- --------------------------------------------------------

--
-- Table structure for table `pending_payments`
--

CREATE TABLE `pending_payments` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','paid') NOT NULL DEFAULT 'pending',
  `paid_at` datetime DEFAULT NULL,
  `razorpay_order_id` varchar(64) DEFAULT NULL,
  `razorpay_payment_id` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `pending_payments`
--

INSERT INTO `pending_payments` (`id`, `customer_id`, `order_id`, `amount`, `status`, `paid_at`, `razorpay_order_id`, `razorpay_payment_id`, `created_at`) VALUES
(1, 11, 9, 5.00, 'pending', NULL, NULL, NULL, '2026-06-05 05:28:33');

-- --------------------------------------------------------

--
-- Table structure for table `staff_inventory`
--

CREATE TABLE `staff_inventory` (
  `id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `assigned_jars` int(11) NOT NULL DEFAULT 0,
  `empty_collected` int(11) NOT NULL DEFAULT 0,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `staff_inventory`
--

INSERT INTO `staff_inventory` (`id`, `staff_id`, `assigned_jars`, `empty_collected`, `updated_at`) VALUES
(1, 12, 0, 12, '2026-06-08 14:35:25');

-- --------------------------------------------------------

--
-- Table structure for table `subscriptions`
--

CREATE TABLE `subscriptions` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `address` varchar(500) DEFAULT NULL,
  `status` enum('active','paused','expired','cancelled') NOT NULL DEFAULT 'active',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `subscriptions`
--

INSERT INTO `subscriptions` (`id`, `customer_id`, `address`, `status`, `start_date`, `end_date`, `auto_renew`, `created_at`, `updated_at`) VALUES
(1, 11, 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', 'cancelled', '2026-06-03', '2026-06-30', 1, '2026-06-03 16:05:32', '2026-06-08 14:32:29');

-- --------------------------------------------------------

--
-- Table structure for table `subscription_slots`
--

CREATE TABLE `subscription_slots` (
  `id` int(11) NOT NULL,
  `subscription_id` int(11) NOT NULL,
  `slot_label` varchar(50) NOT NULL,
  `delivery_time` time NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `subscription_slots`
--

INSERT INTO `subscription_slots` (`id`, `subscription_id`, `slot_label`, `delivery_time`, `quantity`) VALUES
(3, 1, 'Morning', '08:00:00', 1),
(4, 1, 'Afternoon', '13:00:00', 2);

-- --------------------------------------------------------

--
-- Table structure for table `transactions`
--

CREATE TABLE `transactions` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `mode` enum('cash','online','advance') NOT NULL DEFAULT 'cash',
  `type` enum('credit','debit') NOT NULL DEFAULT 'credit',
  `collected_by` int(11) DEFAULT NULL,
  `status` enum('pending','completed') NOT NULL DEFAULT 'pending',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `transactions`
--

INSERT INTO `transactions` (`id`, `customer_id`, `order_id`, `amount`, `mode`, `type`, `collected_by`, `status`, `note`, `created_at`) VALUES
(1, 11, 1, 100.00, 'online', 'credit', 12, 'completed', NULL, '2026-06-03 14:46:21'),
(2, 11, 1, 100.00, 'online', 'credit', NULL, 'completed', 'Online payment for Order #1 via Razorpay (pay_SxCO3fvqTpHrI4)', '2026-06-03 14:55:42'),
(3, 11, 2, 200.00, 'online', 'credit', NULL, 'completed', 'Online payment for Order #2 via Razorpay (pay_SxCYmDxZczAiFA)', '2026-06-03 15:05:42'),
(4, 11, 3, 50.00, 'online', 'credit', NULL, 'completed', 'Online payment for Order #3 via Razorpay (pay_SxCloqiMfLzMKI)', '2026-06-03 15:18:03'),
(5, 11, 6, 1.00, 'online', 'credit', NULL, 'completed', 'Online payment for Order #6 via Razorpay (pay_Sxan6wVt6mvK0E)', '2026-06-04 14:48:07'),
(6, 11, 7, 10.00, 'online', 'credit', NULL, 'completed', 'Online payment for Order #7 via Razorpay (pay_Sxb38L8IZSGz8L)', '2026-06-04 15:03:13'),
(7, 11, 8, 2.00, 'advance', 'credit', NULL, 'completed', 'Paid via advance balance', '2026-06-05 04:30:59'),
(8, 11, 10, 0.00, 'cash', 'credit', 12, 'pending', NULL, '2026-06-08 14:35:25');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff','customer') NOT NULL DEFAULT 'customer',
  `status` enum('active','pending','rejected') NOT NULL DEFAULT 'pending',
  `advance_balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `prepaid_balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `advance_access` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  `jar_rate` decimal(10,2) NOT NULL DEFAULT 50.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `wallet_balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `wallet_access` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  `pending_balance` decimal(10,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `phone`, `password`, `role`, `status`, `advance_balance`, `prepaid_balance`, `advance_access`, `jar_rate`, `created_at`, `wallet_balance`, `wallet_access`, `pending_balance`) VALUES
(2, 'Admin', '8788743507', '$2a$12$mhZxfilLyjKOX.6JUXt.f.F.ugqDuaylroQq2QhDRt53tuL0Wk9bu', 'admin', 'active', 0.00, 0.00, 'none', 50.00, '2026-06-03 11:06:19', 0.00, 'none', 0.00),
(11, 'Customer', '1111111111', '$2a$12$yjo3ePvR0RfONSdF7Gnbnu0QQABFzpUMFTYIW8OdFfByB75xaGFvW', 'customer', 'active', 0.00, 3.00, 'approved', 1.00, '2026-06-03 11:31:30', 0.00, 'none', 5.00),
(12, 'staff', '2222222222', '$2a$12$AgaSLevOpz.UFjQNMB4DdOPtrdUUa33vo79xTZm8k9c6QN/IzQk0W', 'staff', 'active', 0.00, 0.00, 'none', 50.00, '2026-06-03 11:31:50', 0.00, 'none', 0.00),
(86, 'Admin', '8380036680', '$2a$12$mhZxfilLyjKOX.6JUXt.f.F.ugqDuaylroQq2QhDRt53tuL0Wk9bu', 'admin', 'active', 0.00, 0.00, 'none', 50.00, '2026-06-04 17:02:36', 0.00, 'none', 0.00),
(92, 'Admin', '0000000000', '$2a$12$jffF5LgXrYE/gMeu71HC5umzm9unPD5cl9aoqVWNjSsin920ZiueO', 'admin', 'active', 0.00, 0.00, 'none', 50.00, '2026-06-04 18:27:16', 0.00, 'none', 0.00),
(178, 'Saloni jadhav', '21212121212', '$2a$12$zDrSLcaX/ufcjEIgXQcdr.LCOa0EFlMpIdr6DWBfp3YiHVlk7JUPW', 'customer', 'active', 0.00, 0.00, 'none', 30.00, '2026-06-08 14:45:01', 0.00, 'none', 0.00);

-- --------------------------------------------------------

--
-- Table structure for table `user_addresses`
--

CREATE TABLE `user_addresses` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `label` varchar(50) NOT NULL DEFAULT 'Home',
  `address` varchar(500) NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Dumping data for table `user_addresses`
--

INSERT INTO `user_addresses` (`id`, `user_id`, `label`, `address`, `latitude`, `longitude`, `is_default`, `created_at`) VALUES
(1, 11, 'Home', 'Jalgaon, Jalgaon District, Maharashtra, 425001, India', NULL, NULL, 1, '2026-06-03 14:51:55'),
(2, 178, 'Home', 'Sanjivani College Of Engineering, Kopargaon', NULL, NULL, 1, '2026-06-08 14:45:01');

-- --------------------------------------------------------

--
-- Table structure for table `wallet_transactions`
--

CREATE TABLE `wallet_transactions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('credit','debit') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `mode` enum('razorpay','cash','wallet','refund') NOT NULL DEFAULT 'razorpay',
  `status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
  `reference_id` varchar(255) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `advance_transactions`
--
ALTER TABLE `advance_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_wallet_tx_user_id` (`user_id`);

--
-- Indexes for table `app_settings`
--
ALTER TABLE `app_settings`
  ADD PRIMARY KEY (`setting_key`);

--
-- Indexes for table `banners`
--
ALTER TABLE `banners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `bills`
--
ALTER TABLE `bills`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_customer_month` (`customer_id`,`month`),
  ADD KEY `idx_bills_customer_id` (`customer_id`),
  ADD KEY `idx_bills_status` (`status`),
  ADD KEY `idx_bills_due_date` (`due_date`);

--
-- Indexes for table `cancel_requests`
--
ALTER TABLE `cancel_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `reviewed_by` (`reviewed_by`);

--
-- Indexes for table `cash_submissions`
--
ALTER TABLE `cash_submissions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `staff_id` (`staff_id`),
  ADD KEY `verified_by` (`verified_by`);

--
-- Indexes for table `casual_deliveries`
--
ALTER TABLE `casual_deliveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `staff_id` (`staff_id`);

--
-- Indexes for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `order_id` (`order_id`),
  ADD KEY `idx_deliveries_staff_id` (`staff_id`),
  ADD KEY `idx_deliveries_delivered_at` (`delivered_at`);

--
-- Indexes for table `device_tokens`
--
ALTER TABLE `device_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_token` (`token`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `inventory`
--
ALTER TABLE `inventory`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `inventory_logs`
--
ALTER TABLE `inventory_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_user_id` (`user_id`),
  ADD KEY `idx_notifications_is_read` (`is_read`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orders_customer_id` (`customer_id`),
  ADD KEY `idx_orders_staff_id` (`staff_id`),
  ADD KEY `idx_orders_status` (`status`),
  ADD KEY `idx_orders_created_at` (`created_at`);

--
-- Indexes for table `order_timeline`
--
ALTER TABLE `order_timeline`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`);

--
-- Indexes for table `pending_payments`
--
ALTER TABLE `pending_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `order_id` (`order_id`);

--
-- Indexes for table `staff_inventory`
--
ALTER TABLE `staff_inventory`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `staff_id` (`staff_id`);

--
-- Indexes for table `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`);

--
-- Indexes for table `subscription_slots`
--
ALTER TABLE `subscription_slots`
  ADD PRIMARY KEY (`id`),
  ADD KEY `subscription_id` (`subscription_id`);

--
-- Indexes for table `transactions`
--
ALTER TABLE `transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `collected_by` (`collected_by`),
  ADD KEY `idx_transactions_customer_id` (`customer_id`),
  ADD KEY `idx_transactions_order_id` (`order_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `phone` (`phone`);

--
-- Indexes for table `user_addresses`
--
ALTER TABLE `user_addresses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `wallet_transactions`
--
ALTER TABLE `wallet_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_wallet_tx_user_id` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `advance_transactions`
--
ALTER TABLE `advance_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `banners`
--
ALTER TABLE `banners`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `bills`
--
ALTER TABLE `bills`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `cancel_requests`
--
ALTER TABLE `cancel_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cash_submissions`
--
ALTER TABLE `cash_submissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `casual_deliveries`
--
ALTER TABLE `casual_deliveries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `deliveries`
--
ALTER TABLE `deliveries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `device_tokens`
--
ALTER TABLE `device_tokens`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=203;

--
-- AUTO_INCREMENT for table `inventory`
--
ALTER TABLE `inventory`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `inventory_logs`
--
ALTER TABLE `inventory_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=74;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `order_timeline`
--
ALTER TABLE `order_timeline`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=26;

--
-- AUTO_INCREMENT for table `pending_payments`
--
ALTER TABLE `pending_payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `staff_inventory`
--
ALTER TABLE `staff_inventory`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `subscriptions`
--
ALTER TABLE `subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `subscription_slots`
--
ALTER TABLE `subscription_slots`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `transactions`
--
ALTER TABLE `transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=189;

--
-- AUTO_INCREMENT for table `user_addresses`
--
ALTER TABLE `user_addresses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `wallet_transactions`
--
ALTER TABLE `wallet_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `advance_transactions`
--
ALTER TABLE `advance_transactions`
  ADD CONSTRAINT `advance_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `banners`
--
ALTER TABLE `banners`
  ADD CONSTRAINT `banners_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `bills`
--
ALTER TABLE `bills`
  ADD CONSTRAINT `bills_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `cancel_requests`
--
ALTER TABLE `cancel_requests`
  ADD CONSTRAINT `cancel_requests_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cancel_requests_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cancel_requests_ibfk_3` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `cash_submissions`
--
ALTER TABLE `cash_submissions`
  ADD CONSTRAINT `cash_submissions_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cash_submissions_ibfk_2` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `casual_deliveries`
--
ALTER TABLE `casual_deliveries`
  ADD CONSTRAINT `casual_deliveries_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `deliveries_ibfk_2` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `device_tokens`
--
ALTER TABLE `device_tokens`
  ADD CONSTRAINT `device_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `inventory_logs`
--
ALTER TABLE `inventory_logs`
  ADD CONSTRAINT `inventory_logs_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `order_timeline`
--
ALTER TABLE `order_timeline`
  ADD CONSTRAINT `order_timeline_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `pending_payments`
--
ALTER TABLE `pending_payments`
  ADD CONSTRAINT `pending_payments_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `pending_payments_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `staff_inventory`
--
ALTER TABLE `staff_inventory`
  ADD CONSTRAINT `staff_inventory_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD CONSTRAINT `subscriptions_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `subscription_slots`
--
ALTER TABLE `subscription_slots`
  ADD CONSTRAINT `subscription_slots_ibfk_1` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `transactions`
--
ALTER TABLE `transactions`
  ADD CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `transactions_ibfk_3` FOREIGN KEY (`collected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `user_addresses`
--
ALTER TABLE `user_addresses`
  ADD CONSTRAINT `user_addresses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `wallet_transactions`
--
ALTER TABLE `wallet_transactions`
  ADD CONSTRAINT `wallet_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
