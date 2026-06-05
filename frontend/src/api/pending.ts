import api from './axios';

export interface PendingItem {
  id: number;
  order_id: number;
  amount: number;
  status: 'pending' | 'paid';
  created_at: string;
  paid_at: string | null;
  quantity: number;
  total_amount: number;
  order_date: string;
}

export const pendingApi = {
  getMy: () =>
    api.get<{ pending_balance: number; items: PendingItem[] }>('/pending/my'),

  createPayOrder: () =>
    api.post<{
      orderId: string;
      amount: number;
      keyId: string;
      platformFee: number;
      baseAmount: number;
    }>('/pending/pay-order'),

  verify: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => api.post('/pending/verify', data),

  adminSummary: () =>
    api.get<{
      customers: {
        id: number;
        name: string;
        phone: string;
        pending_balance: number;
        pending_count: number;
        oldest_pending: string;
      }[];
      total_pending: number;
    }>('/pending/admin'),
};
