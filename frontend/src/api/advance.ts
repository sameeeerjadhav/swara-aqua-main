import api from './axios';

export type AdvanceAccess = 'none' | 'pending' | 'approved' | 'rejected';

export interface AdvanceTransaction {
  id: number;
  user_id: number;
  type: 'credit' | 'debit';
  amount: number;
  mode: 'razorpay' | 'advance' | 'refund';
  status: 'completed' | 'pending' | 'failed';
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export interface AdvanceAccessRequest {
  id: number;
  name: string;
  phone: string;
  advance_access: AdvanceAccess;
  prepaid_balance: number;
  created_at: string;
}

export const advanceApi = {
  get: () =>
    api.get<{ balance: number; advanceAccess: AdvanceAccess; transactions: AdvanceTransaction[] }>('/advance'),

  requestAccess: () =>
    api.post<{ message: string; advanceAccess: AdvanceAccess }>('/advance/request-access'),

  createTopupOrder: (amount: number) =>
    api.post<{ orderId: string; amount: number; currency: string; keyId: string; baseAmount: number; platformFee: number }>(
      '/advance/topup/order', { amount }
    ),

  verifyTopup: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    amount: number;
  }) => api.post<{ balance: number }>('/advance/topup/verify', data),

  payOrder: (orderId: number) =>
    api.post<{ balance: number }>('/advance/pay-order', { orderId }),

  payBill: (billId: number) =>
    api.patch<{ message: string }>(`/billing/${billId}/pay-advance`),

  // Admin
  getAccessRequests: (status: AdvanceAccess = 'pending') =>
    api.get<{ requests: AdvanceAccessRequest[] }>('/advance/access-requests', { params: { status } }),

  approveAccess: (userId: number) =>
    api.patch<{ message: string }>(`/advance/access-requests/${userId}/approve`),

  rejectAccess: (userId: number, reason?: string) =>
    api.patch<{ message: string }>(`/advance/access-requests/${userId}/reject`, { reason }),
};
