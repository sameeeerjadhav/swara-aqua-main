import api from './axios';

export const customerOrderApi = {
  /** Admin: get the global saved order */
  getAdmin: () =>
    api.get<{ ordered_ids: number[] }>('/admin/customer-order'),

  /** Admin: save a new global order */
  saveAdmin: (ordered_ids: number[]) =>
    api.put('/admin/customer-order', { ordered_ids }),

  /** Staff/Admin: get order for the calling staff (falls back to admin global) */
  getStaff: () =>
    api.get<{ ordered_ids: number[]; source: 'staff' | 'admin' }>('/admin/staff/customer-order'),

  /** Staff: save personal order */
  saveStaff: (ordered_ids: number[]) =>
    api.put('/admin/staff/customer-order', { ordered_ids }),

  /** Staff: delete personal override → reverts to admin order */
  resetStaff: () =>
    api.delete('/admin/staff/customer-order'),
};

/** Utility: apply a saved ID array to a customer list, appending unknowns at the end */
export function applyOrder<T extends { id: number }>(
  customers: T[],
  orderedIds: number[]
): T[] {
  if (!orderedIds.length) return customers;
  const indexMap = new Map(orderedIds.map((id, i) => [id, i]));
  const inOrder  = customers.filter(c => indexMap.has(c.id))
                            .sort((a, b) => (indexMap.get(a.id) ?? 9999) - (indexMap.get(b.id) ?? 9999));
  const notInOrder = customers.filter(c => !indexMap.has(c.id));
  return [...inOrder, ...notInOrder];
}
