import { Response } from 'express';
import { errDetail } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import * as Reports from '../models/reports.model';

// GET /api/reports/revenue?period=daily|monthly
export const getRevenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = 'daily', days, months } = req.query as Record<string, string>;
    const [data, summary] = await Promise.all([
      period === 'monthly'
        ? Reports.getMonthlyRevenue(Number(months) || 12)
        : Reports.getDailyRevenue(Number(days) || 30),
      Reports.getRevenueSummary(),
    ]);
    res.json({ data, summary, period });
  } catch (err) {
    console.error('getRevenue error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/pending
export const getPendingPayments = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Reports.getPendingPayments();
    res.json({ data });
  } catch (err) {
    console.error('getPendingPayments error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/staff-performance?month=YYYY-MM
export const getStaffPerformance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month } = req.query as Record<string, string>;
    const data = await Reports.getStaffPerformance(month);
    res.json({ data });
  } catch (err) {
    console.error('getStaffPerformance error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/customer-growth?period=daily|monthly
export const getCustomerGrowth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = 'daily', days, months } = req.query as Record<string, string>;
    const data = period === 'monthly'
      ? await Reports.getMonthlyCustomerGrowth(Number(months) || 12)
      : await Reports.getDailyCustomerGrowth(Number(days) || 30);
    res.json({ data, period });
  } catch (err) {
    console.error('getCustomerGrowth error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/jars-trend?period=daily|monthly
export const getJarsTrend = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = 'daily', days, months } = req.query as Record<string, string>;
    const data = period === 'monthly'
      ? await Reports.getMonthlyJarsTrend(Number(months) || 12)
      : await Reports.getDailyJarsTrend(Number(days) || 30);
    res.json({ data, period });
  } catch (err) {
    console.error('getJarsTrend error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/orders-by-type
export const getOrdersByType = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Reports.getOrdersByType();
    res.json({ data });
  } catch (err) {
    console.error('getOrdersByType error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/top-customers
export const getTopCustomers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Reports.getTopCustomers(8);
    res.json({ data });
  } catch (err) {
    console.error('getTopCustomers error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};

// GET /api/reports/order-volume?period=daily|monthly
export const getOrderVolume = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = 'daily', days, months } = req.query as Record<string, string>;
    const data = period === 'monthly'
      ? await Reports.getMonthlyOrderVolume(Number(months) || 12)
      : await Reports.getDailyOrderVolume(Number(days) || 30);
    res.json({ data, period });
  } catch (err) {
    console.error('getOrderVolume error:', err);
    res.status(500).json({ message: 'Internal server error', ...errDetail(err) });
  }
};
