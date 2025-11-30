import apiClient from './client'

export interface Server {
  id: number
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'private_key'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ServerCreate {
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'private_key'
  password?: string
  private_key?: string
  passphrase?: string
}

export interface CommandResponse {
  success: boolean
  exit_code: number
  stdout: string
  stderr: string
  error?: string
}

export interface DirectoryResponse {
  code: number
  stdout: string
  stderr: string
}

export interface StatsResponse {
  code: number
  stdout: string
  stderr: string
}

export interface DetailedStatsResponse {
  cpu_percent: number | null
  memory_percent: number | null
  memory_used_mb: number | null
  memory_total_mb: number | null
  disk_percent: number | null
  disk_used_gb: number | null
  disk_total_gb: number | null
}

export interface MetricData {
  timestamp: string
  cpu_percent: number | null
  memory_percent: number | null
  memory_used_mb: number | null
  memory_total_mb: number | null
  disk_percent: number | null
  disk_used_gb: number | null
  disk_total_gb: number | null
}

export const serversApi = {
  list: async (): Promise<Server[]> => {
    const response = await apiClient.get<any>('/servers/')
    // Обрабатываем пагинацию: если ответ содержит results, используем его, иначе сам ответ
    if (response.data && Array.isArray(response.data.results)) {
      return response.data.results
    } else if (Array.isArray(response.data)) {
      return response.data
    }
    return []
  },
  
  get: async (id: number): Promise<Server> => {
    const response = await apiClient.get<Server>(`/servers/${id}/`)
    return response.data
  },
  
  create: async (server: ServerCreate): Promise<Server> => {
    const response = await apiClient.post<Server>('/servers/', server)
    return response.data
  },
  
  update: async (id: number, server: Partial<ServerCreate>): Promise<Server> => {
    const response = await apiClient.patch<Server>(`/servers/${id}/`, server)
    return response.data
  },
  
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/servers/${id}/`)
  },
  
  exec: async (id: number, command: string): Promise<CommandResponse> => {
    const response = await apiClient.post<CommandResponse>(`/servers/${id}/exec/`, { command })
    return response.data
  },
  
  listDirectory: async (id: number, path: string = '~'): Promise<DirectoryResponse> => {
    const response = await apiClient.get<DirectoryResponse>(`/servers/${id}/ls/`, {
      params: { path },
    })
    return response.data
  },
  
  getStats: async (id: number): Promise<StatsResponse> => {
    const response = await apiClient.get<StatsResponse>(`/servers/${id}/stats/`)
    return response.data
  },
  
  testConnection: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/test_connection/`
    )
    return response.data
  },
  
  uploadFile: async (id: number, file: File, remotePath: string): Promise<{ success: boolean; message: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('remote_path', remotePath)
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/upload_file/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  },
  
  createFile: async (id: number, filePath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/create_file/`,
      { file_path: filePath }
    )
    return response.data
  },

  createDirectory: async (id: number, dirPath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/create_directory/`,
      { dir_path: dirPath }
    )
    return response.data
  },

  renameFile: async (id: number, oldPath: string, newPath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/rename_file/`,
      { old_path: oldPath, new_path: newPath }
    )
    return response.data
  },

  readFile: async (id: number, filePath: string): Promise<{ success: boolean; content?: string; message: string }> => {
    const response = await apiClient.get<{ success: boolean; content?: string; message: string }>(
      `/servers/${id}/read_file/`,
      { params: { file_path: filePath } }
    )
    return response.data
  },

  writeFile: async (id: number, filePath: string, content: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/write_file/`,
      { file_path: filePath, content }
    )
    return response.data
  },

  deleteFile: async (id: number, filePath: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/servers/${id}/delete_file/`,
      { file_path: filePath }
    )
    return response.data
  },

  searchFiles: async (id: number, searchPath: string, pattern: string, maxResults: number = 100): Promise<{
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
      `/servers/${id}/search_files/`,
      { search_path: searchPath, pattern, max_results: maxResults }
    )
    return response.data
  },
  
  toggleStatus: async (id: number): Promise<{ success: boolean; is_active: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; is_active: boolean; message: string }>(
      `/servers/${id}/toggle_status/`
    )
    return response.data
  },
  
  getDetailedStats: async (id: number): Promise<DetailedStatsResponse> => {
    const response = await apiClient.get<DetailedStatsResponse>(`/servers/${id}/detailed_stats/`)
    return response.data
  },
  
  getMetricsHistory: async (id: number, hours: number = 1): Promise<MetricData[]> => {
    const response = await apiClient.get<MetricData[]>(`/servers/${id}/metrics_history/`, {
      params: { hours },
    })
    return response.data
  },
}

