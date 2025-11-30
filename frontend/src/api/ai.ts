import { apiClient } from './client'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIChatRequest {
  messages: AIMessage[]
  serverId?: number
  serverType?: 'ssh' | 'allocated'
}

export interface AIChatResponse {
  response: string
  success: boolean
  error?: string
}

export const aiApi = {
  chat: async (data: AIChatRequest): Promise<AIChatResponse> => {
    const response = await apiClient.post<AIChatResponse>('/ai/chat/', data)
    return response.data
  },
}





