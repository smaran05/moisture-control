export interface Reading {
  id?: number
  timestamp: string | null
  moisture: number
  temperature: number
  humidity: number
  target_moisture: number | null
  moisture_status: string
  pump_decision: string
  pump_status: string | null
  source: 'dataset' | 'sensor'
  row_number: number | null
  [column: string]: unknown
}

export interface Analytics {
  record_count: number
  average_moisture: number | null
  minimum_moisture: number | null
  maximum_moisture: number | null
  average_temperature: number | null
  average_humidity: number | null
  target_moisture: number | null
}

export interface Device {
  status: 'connected' | 'disconnected'
  last_seen: string | null
}

export interface DashboardData {
  monitoring_status: 'running' | 'stopped'
  record_count: number
  source: 'sensor' | 'dataset' | null
  latest_reading: (Reading & { difference: number | null }) | null
  history: Reading[]
  analytics: Analytics
  devices: Record<string, Device>
  changes: Record<string, number | null>
  last_updated: string
}

export interface DatasetResponse {
  filename: string | null
  record_count: number
  page: number
  page_size: number
  records: Reading[]
}

export interface UploadResponse {
  message: string
  dataset: { id: number; filename: string; record_count: number }
  dashboard: DashboardData
}

export interface LogEntry {
  timestamp: string
  event: string
  status: string
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 30_000

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(await responseError(response))
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.')
    }
    if (error instanceof TypeError) {
      throw new Error('Unable to connect to the Python backend.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown }
    if (typeof payload.detail === 'string') return payload.detail
    if (typeof payload.message === 'string') return payload.message
  } catch {
    // Use the status-based message below when the server does not return JSON.
  }
  return `The backend request failed (${response.status}).`
}

export function getDashboardData(): Promise<DashboardData> {
  return request<DashboardData>('/dashboard')
}

export function getDataset(page = 1, pageSize = 25): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/dataset?page=${page}&page_size=${pageSize}`)
}

export function getAnalytics(): Promise<Analytics> {
  return request<Analytics>('/dataset/analytics')
}

export function getLogs(): Promise<{ logs: LogEntry[] }> {
  return request<{ logs: LogEntry[] }>('/logs')
}

export function getDeviceStatus(): Promise<Record<string, Device>> {
  return request<Record<string, Device>>('/devices/status')
}

export function startMonitoring(): Promise<{ status: string; message: string }> {
  return request('/monitoring/start', { method: 'POST' })
}

export function stopMonitoring(): Promise<{ status: string; message: string }> {
  return request('/monitoring/stop', { method: 'POST' })
}

export function uploadDataset(
  file: File,
  onProgress: (percentage: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${API_BASE}/dataset/upload`)
    request.timeout = REQUEST_TIMEOUT_MS
    request.responseType = 'json'

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    request.onload = () => {
      const payload = request.response as UploadResponse | { detail?: string } | null
      if (request.status >= 200 && request.status < 300 && payload) {
        resolve(payload as UploadResponse)
        return
      }
      reject(
        new Error(
          payload && 'detail' in payload && typeof payload.detail === 'string'
            ? payload.detail
            : `Dataset upload failed (${request.status || 'unknown error'}).`,
        ),
      )
    }

    request.onerror = () => reject(new Error('Unable to connect to the Python backend.'))
    request.ontimeout = () => reject(new Error('The dataset upload timed out. Please try again.'))
    request.onabort = () => reject(new Error('The dataset upload was cancelled.'))

    const formData = new FormData()
    formData.append('file', file)
    request.send(formData)
  })
}

export async function exportDataset(): Promise<{ blob: Blob; filename: string }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE}/dataset/export`, { signal: controller.signal })
    if (!response.ok) throw new Error(await responseError(response))

    const disposition = response.headers.get('Content-Disposition') ?? ''
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'monitoring-dataset.xlsx'
    return { blob: await response.blob(), filename }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The export timed out. Please try again.')
    }
    if (error instanceof TypeError) {
      throw new Error('Unable to connect to the Python backend.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}

export function getCloudConfig(): Promise<{ firebase_url: string; configured: boolean }> {
  return request<{ firebase_url: string; configured: boolean }>('/cloud/config')
}

export function saveCloudConfig(firebase_url: string): Promise<{ message: string; firebase_url: string }> {
  return request<{ message: string; firebase_url: string }>('/cloud/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firebase_url }),
  })
}

export function syncLatestToCloud(): Promise<{ message: string; payload: Record<string, unknown> }> {
  return request<{ message: string; payload: Record<string, unknown> }>('/cloud/sync', {
    method: 'POST',
  })
}

export function syncAllToCloud(): Promise<{ message: string; count: number }> {
  return request<{ message: string; count: number }>('/cloud/sync/all', {
    method: 'POST',
  })
}

