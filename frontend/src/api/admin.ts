import apiClient from './client'
import { AdminUser } from './user'

export const adminApi = {
  getUsers: async (): Promise<AdminUser[]> => {
    const response = await apiClient.get<AdminUser[]>('/admin/users/')
    return response.data
  },

  updateBalance: async (userId: number, amount: number): Promise<{ message: string; balance: number }> => {
    const response = await apiClient.post('/admin/update-balance/', {
      user_id: userId,
      amount: amount
    })
    return response.data
  },

  addBalance: async (userId: number, amount: number): Promise<{ message: string; balance: number }> => {
    const response = await apiClient.post('/admin/add-balance/', {
      user_id: userId,
      amount: amount
    })
    return response.data
  },

  toggleUserStatus: async (userId: number): Promise<{ message: string; is_active: boolean }> => {
    const response = await apiClient.post('/admin/toggle-user-status/', {
      user_id: userId
    })
    return response.data
  },

  deleteUser: async (userId: number): Promise<{ message: string }> => {
    const response = await apiClient.post('/admin/delete-user/', {
      user_id: userId
    })
    return response.data
  },

  grantSubscription: async (
    userId: number,
    subscriptionType: 'pro' | 'plus' | 'none',
    days: number
  ): Promise<{
    message: string
    subscription_type: string
    expires_at: string | null
  }> => {
    const response = await apiClient.post('/admin/grant-subscription/', {
      user_id: userId,
      subscription_type: subscriptionType,
      days: days
    })
    return response.data
  },

  createAllocatedServer: async (
    userId: number,
    name: string,
    cpuCores: number,
    memoryGb: number,
    diskGb: number
  ): Promise<{
    message: string
    server: {
      id: number
      name: string
      host: string
      port: number
      username: string
      cpu_cores: number
      memory_gb: number
      disk_gb: number
    }
  }> => {
    const response = await apiClient.post('/admin/create-allocated-server/', {
      user_id: userId,
      name: name,
      cpu_cores: cpuCores,
      memory_gb: memoryGb,
      disk_gb: diskGb
    })
    return response.data
  },
}

