import apiClient from './client'
import { DetailedStatsResponse, MetricData } from './servers'

export interface Transaction {
  id: number
  type: 'deposit' | 'subscription_pro' | 'subscription_plus' | 'admin_grant'
  type_display: string
  amount: number
  description: string
  created_at: string
}

export interface AllocatedServer {
  id: number
  name: string
  host: string
  port: number
  username: string
  cpu_cores: number
  memory_gb: number
  disk_gb: number
  is_active: boolean
  created_at: string
  expires_at: string | null
}

export const paymentApi = {
  deposit: async (amount: number): Promise<{ message: string; balance: number }> => {
    const response = await apiClient.post('/payment/deposit/', {
      amount: amount
    })
    return response.data
  },

  buySubscription: async (subscriptionType: 'pro' | 'plus'): Promise<{
    message: string
    subscription_type: string
    expires_at: string
    balance: number
  }> => {
    const response = await apiClient.post('/payment/buy-subscription/', {
      subscription_type: subscriptionType
    })
    return response.data
  },

  getTransactions: async (): Promise<Transaction[]> => {
    const response = await apiClient.get<Transaction[]>('/payment/transactions/')
    return response.data
  },

  getAllocatedServers: async (): Promise<AllocatedServer[]> => {
    const response = await apiClient.get<AllocatedServer[]>('/servers/allocated/')
    return response.data
  },

  createAllocatedServer: async (
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
    cost: number
    balance: number
  }> => {
    const response = await apiClient.post('/servers/create-allocated/', {
      name,
      cpu_cores: cpuCores,
      memory_gb: memoryGb,
      disk_gb: diskGb
    })
    return response.data
  },

  allocatedServerExec: async (id: number, command: string, timeout?: number): Promise<{
    success: boolean
    exit_code: number
    stdout: string
    stderr: string
  }> => {
    const response = await apiClient.post(`/servers/allocated/${id}/exec/`, { 
      command,
      timeout
    })
    return response.data
  },

  allocatedServerListDirectory: async (id: number, path: string = '~'): Promise<{
    code: number
    stdout: string
    stderr: string
  }> => {
    const response = await apiClient.get(`/servers/allocated/${id}/ls/`, {
      params: { path },
    })
    return response.data
  },

  allocatedServerUploadFile: async (id: number, file: File, remotePath: string): Promise<{ success: boolean; message: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('remote_path', remotePath)
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/upload_file/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  },

  allocatedServerCreateFile: async (id: number, filePath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/create_file/`,
      { file_path: filePath }
    )
    return response.data
  },

  allocatedServerCreateDirectory: async (id: number, dirPath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/create_directory/`,
      { dir_path: dirPath }
    )
    return response.data
  },

  allocatedServerRenameFile: async (id: number, oldPath: string, newPath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/rename_file/`,
      { old_path: oldPath, new_path: newPath }
    )
    return response.data
  },

  allocatedServerReadFile: async (id: number, filePath: string): Promise<{ success: boolean; content?: string; message: string }> => {
    const response = await apiClient.get<{ success: boolean; content?: string; message: string }>(
      `/servers/allocated/${id}/read_file/`,
      { params: { file_path: filePath } }
    )
    return response.data
  },

  allocatedServerWriteFile: async (id: number, filePath: string, content: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/write_file/`,
      { file_path: filePath, content }
    )
    return response.data
  },

  allocatedServerDeleteFile: async (id: number, filePath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/delete_file/`,
      { file_path: filePath }
    )
    return response.data
  },

  allocatedServerSearchFiles: async (id: number, searchPath: string, pattern: string, maxResults: number = 100): Promise<{
    success: boolean
    files: string[]
    count: number
    message: string
  }> => {
    const response = await apiClient.post<{
      success: boolean
      files: string[]
      count: number
      message: string
    }>(
      `/servers/allocated/${id}/search_files/`,
      { search_path: searchPath, pattern, max_results: maxResults }
    )
    return response.data
  },

  toggleAllocatedServerStatus: async (id: number): Promise<{ success: boolean; is_active: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; is_active: boolean; message: string }>(
      `/servers/allocated/${id}/toggle_status/`
    )
    return response.data
  },

  deleteAllocatedServer: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/servers/allocated/${id}/`
    )
    return response.data
  },
  
  allocatedServerGetDetailedStats: async (id: number): Promise<DetailedStatsResponse> => {
    const response = await apiClient.get<DetailedStatsResponse>(`/servers/allocated/${id}/detailed_stats/`)
    return response.data
  },
  
  allocatedServerGetMetricsHistory: async (id: number, hours: number = 1): Promise<MetricData[]> => {
    const response = await apiClient.get<MetricData[]>(`/servers/allocated/${id}/metrics_history/`, {
      params: { hours },
    })
    return response.data
  },
}

