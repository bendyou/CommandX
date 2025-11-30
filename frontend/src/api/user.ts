import apiClient from './client'

export interface UserProfile {
  id: number
  username: string
  email: string
  date_joined: string | null
  avatar: string | null
  email_verified: boolean
  balance: number
  is_staff: boolean
  subscription_type: 'none' | 'pro' | 'plus'
  subscription_expires_at: string | null
  has_active_subscription: boolean
}

export interface AdminUser {
  id: number
  username: string
  email: string
  is_staff: boolean
  is_active: boolean
  date_joined: string | null
  avatar: string | null
  balance: number
  email_verified: boolean
  subscription_type: 'none' | 'pro' | 'plus'
  subscription_expires_at: string | null
  has_active_subscription: boolean
}

export interface UpdateProfileData {
  username?: string
  email?: string
  avatar?: File | null
}

export const userApi = {
  getProfile: async (): Promise<UserProfile> => {
    const response = await apiClient.get<UserProfile>('/auth/profile/')
    return response.data
  },

  updateProfile: async (data: UpdateProfileData): Promise<UserProfile> => {
    const formData = new FormData()
    
    if (data.username !== undefined) {
      formData.append('username', data.username)
    }
    if (data.email !== undefined) {
      formData.append('email', data.email)
    }
    if (data.avatar !== undefined) {
      if (data.avatar === null) {
        formData.append('avatar', '')
      } else if (data.avatar instanceof File) {
        formData.append('avatar', data.avatar)
      }
    }
    
    const response = await apiClient.patch<UserProfile>('/auth/profile/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
}

