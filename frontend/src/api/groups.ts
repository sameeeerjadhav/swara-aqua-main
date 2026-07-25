import api from './axios';

export interface CustomerGroup {
  id: number;
  name: string;
  color: string;
  icon: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

export const groupsApi = {
  list: () => api.get<{ groups: CustomerGroup[] }>('/admin/groups'),

  create: (data: { name: string; color: string; icon: string; description?: string }) =>
    api.post<{ message: string; group: CustomerGroup }>('/admin/groups', data),

  update: (id: number, data: { name: string; color: string; icon: string; description?: string }) =>
    api.put<{ message: string }>(`/admin/groups/${id}`, data),

  delete: (id: number) =>
    api.delete<{ message: string }>(`/admin/groups/${id}`),

  /** Assign or unassign a single customer; pass null to ungroup */
  assignCustomer: (customerId: number, groupId: number | null) =>
    api.patch<{ message: string }>(`/admin/customers/${customerId}/group`, { group_id: groupId }),

  /** Bulk-assign multiple customers to a group */
  bulkAssign: (groupId: number, customerIds: number[]) =>
    api.patch<{ message: string }>(`/admin/groups/${groupId}/assign`, { customer_ids: customerIds }),
};
