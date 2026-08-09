import api from './axios';

export interface CalendarDay {
  date: string;
  jars_delivered: number;
  orders_count: number;
  total_amount: number;
}

export interface CustomerProfile {
  id: number;
  name: string;
  phone: string;
  role: string;
  status: string;
  jar_rate: number;
  advance_balance: number;
  advance_access?: string | null;
  profile_photo?: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface CustomerProfileStats {
  total_jars_delivered: number;
  total_orders: number;
  total_collected: number;
  pending_amount: number;
  pending_bills: number;
}

export interface DayDelivery {
  id: number;
  delivery_id: number | null; // non-null for regular order deliveries; null for manual entries
  jars: number;
  time: string;
  period: 'morning' | 'afternoon' | 'evening';
  staff_name: string;
  // extended fields
  amount_collected: number;
  payment_mode: 'cash' | 'online' | 'advance' | 'pay_later' | 'none';
  is_paid: boolean;
  is_manual: boolean;
  notes: string | null;
}

export interface ManualDeliveryPayload {
  jars: number;
  amount_collected: number;
  is_paid: boolean;
  payment_mode: 'cash' | 'online' | 'advance';
  delivery_date: string;   // YYYY-MM-DD
  delivery_time: string;   // HH:MM:SS
  notes?: string;
}

export interface DeliveryPaymentPayload {
  payment_mode: 'cash' | 'online' | 'advance' | 'pay_later';
  collected_amount: number;
}

export const calendarApi = {
  getCalendar: (month: string, customerId?: number) =>
    api.get<{ days: CalendarDay[] }>('/orders/calendar', {
      params: { month, ...(customerId ? { customerId } : {}) },
    }),

  getDayDetail: (date: string, customerId?: number) =>
    api.get<{ date: string; deliveries: DayDelivery[]; totalJars: number }>(
      '/orders/calendar/day',
      { params: { date, ...(customerId ? { customerId } : {}) } }
    ),

  getCustomerProfile: (id: number) =>
    api.get<{
      customer: CustomerProfile;
      stats: CustomerProfileStats;
      bills: any[];
      orders: any[];
    }>(`/admin/users/${id}/profile`),

  // Admin customer delivery calendar (includes manual entries)
  getAdminCalendar: (customerId: number, month: string) =>
    api.get<{ month: string; calendar: { day: number; jars: number }[]; totalJars: number }>(
      `/admin/customer-deliveries/${customerId}`,
      { params: { month } }
    ),

  // Admin day deliveries (includes manual entries)
  getAdminDayDetail: (customerId: number, date: string) =>
    api.get<{ date: string; deliveries: DayDelivery[]; totalJars: number }>(
      `/admin/customer-deliveries/${customerId}/day`,
      { params: { date } }
    ),

  // Manual delivery CRUD
  addManualDelivery: (customerId: number, payload: ManualDeliveryPayload) =>
    api.post(`/admin/customers/${customerId}/manual-delivery`, payload),

  updateManualDelivery: (entryId: number, payload: ManualDeliveryPayload) =>
    api.put(`/admin/manual-deliveries/${entryId}`, payload),

  deleteManualDelivery: (entryId: number) =>
    api.delete(`/admin/manual-deliveries/${entryId}`),

  // Admin: correct a staff delivery's payment mode / amount
  updateDeliveryPayment: (deliveryId: number, payload: DeliveryPaymentPayload) =>
    api.patch<{ message: string }>(`/admin/deliveries/${deliveryId}/payment`, payload),
};
