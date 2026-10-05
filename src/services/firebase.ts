// src/services/firebase.ts
// Real-time Firebase Cloud Data Listener & Synchronization Service

import type { Reading } from './api'

export interface FirebaseConfig {
  apiKey?: string
  authDomain?: string
  databaseURL?: string
  projectId?: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
}

// Default Firebase configuration loaded from environment variables or local storage
export function getFirebaseConfig(): FirebaseConfig {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localStorage.getItem('soil_firebase_api_key') || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localStorage.getItem('soil_firebase_auth_domain') || '',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || localStorage.getItem('soil_firebase_database_url') || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localStorage.getItem('soil_firebase_project_id') || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  }
}

export function saveFirebaseConfig(config: FirebaseConfig) {
  if (config.apiKey) localStorage.setItem('soil_firebase_api_key', config.apiKey)
  if (config.databaseURL) localStorage.setItem('soil_firebase_database_url', config.databaseURL)
  if (config.projectId) localStorage.setItem('soil_firebase_project_id', config.projectId)
}

/**
 * Listen to real-time ESP8266 data pushed to Firebase Realtime Database
 * via Firebase REST Streaming (EventSource / Server-Sent Events)
 * No heavy external libraries required - fast, native browser WebSocket/SSE stream!
 */
export class FirebaseRealtimeService {
  private eventSource: EventSource | null = null
  private databaseURL: string
  private isConnected: boolean = false
  private onDataCallback: ((reading: Reading) => void) | null = null
  private onStatusCallback: ((connected: boolean, message: string) => void) | null = null

  constructor(databaseURL?: string) {
    const config = getFirebaseConfig()
    this.databaseURL = databaseURL || config.databaseURL || ''
  }

  public setConfig(databaseURL: string) {
    this.databaseURL = databaseURL
    this.stopListening()
  }

  public listenToTelemetry(
    onData: (reading: Reading) => void,
    onStatus: (connected: boolean, message: string) => void
  ) {
    this.onDataCallback = onData
    this.onStatusCallback = onStatus

    if (!this.databaseURL) {
      this.onStatusCallback?.(false, 'Firebase Database URL not configured')
      return
    }

    // Sanitize database URL
    let cleanUrl = this.databaseURL.trim().replace(/\/$/, '')
    if (!cleanUrl.endsWith('.json')) {
      cleanUrl = `${cleanUrl}/telemetry/latest.json`
    }

    try {
      this.stopListening()
      this.eventSource = new EventSource(cleanUrl)

      this.eventSource.onopen = () => {
        this.isConnected = true
        this.onStatusCallback?.(true, 'Connected to Firebase Realtime Cloud')
      }

      this.eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          // EventSource format from Firebase Realtime DB returns { path: '/', data: {...} }
          const rawData = payload?.data || payload
          if (rawData && typeof rawData === 'object' && rawData.moisture !== undefined) {
            const reading: Reading = {
              timestamp: rawData.timestamp || new Date().toISOString(),
              moisture: Number(rawData.moisture),
              temperature: Number(rawData.temperature ?? 0),
              humidity: Number(rawData.humidity ?? 0),
              target_moisture: rawData.target_moisture ? Number(rawData.target_moisture) : null,
              moisture_status: rawData.moisture_status || (rawData.moisture >= 60 ? 'Optimal' : 'Low Moisture'),
              pump_decision: rawData.pump_decision || (rawData.moisture < 40 ? 'ON' : 'OFF'),
              pump_status: rawData.pump_status || 'UNKNOWN',
              source: 'sensor',
              row_number: null,
            }
            this.onDataCallback?.(reading)
          }
        } catch (err) {
          console.warn('Error parsing Firebase real-time packet:', err)
        }
      }

      this.eventSource.onerror = () => {
        this.isConnected = false
        this.onStatusCallback?.(false, 'Reconnecting to Firebase Cloud...')
      }
    } catch (err) {
      this.isConnected = false
      this.onStatusCallback?.(false, `Firebase Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  public stopListening() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.isConnected = false
    this.onStatusCallback?.(false, 'Firebase Listener Stopped')
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      databaseURL: this.databaseURL,
    }
  }
}

export const firebaseCloudService = new FirebaseRealtimeService()
