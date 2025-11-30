import apiClient from './client'

export interface LoginCredentials {
  username: string
  password: string
}

export interface RegisterCredentials {
  username: string
  email: string
  password: string
  password_confirm: string
}

export interface TokenResponse {
  access: string
  refresh: string
}

export interface RegisterResponse {
  message: string
  username: string
  email: string
  access: string
  refresh: string
}

export interface RegisterError {
  username?: string[]
  email?: string[]
  password?: string[]
  password_confirm?: string[]
  error?: string
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/token/', credentials)
    return response.data
  },
  
  register: async (credentials: RegisterCredentials): Promise<RegisterResponse> => {
    const response = await apiClient.post<RegisterResponse>('/auth/register/', credentials)
    return response.data
  },
  
  refreshToken: async (refresh: string): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/token/refresh/', { refresh })
    return response.data
  },
}

