import './style.css'
import {
  exportDataset,
  getAnalytics,
  getCloudConfig,
  getDashboardData,
  getDataset,
  getDeviceStatus,
  getHealth,
  getLogs,
  saveCloudConfig,
  startMonitoring,
  stopMonitoring,
  syncAllToCloud,
  syncLatestToCloud,
  uploadDataset,
  type Analytics,
  type DashboardData,
  type Device,
  type LogEntry,
  type Reading,
} from './services/api'


const app = document.querySelector<HTMLDivElement>('#app')

if (app) {
  app.innerHTML = `
    <div class="dashboard-shell">
      <aside class="sidebar">
        <div class="brand-row">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M18.7 5.2C16.3 4 13.8 3.7 11.5 4.4c-1.5.4-2.9 1.2-4.1 2.3C5.9 8.5 4.9 10.1 4.5 12c-.4 1.9-.2 3.9.7 5.6 1.3 2.5 4 4.1 6.8 4.1 3.4 0 6.5-2 7.8-5.1.8-1.9 1-4 .1-5.9l-.4-.5zm-9.6 8.9c-1.5-1.5-1.9-3.9-.9-5.7.5-.9 1.4-1.7 2.5-2.1.8-.3 1.7-.4 2.5-.3-.7 1.7-.4 3.5.7 5.1.8 1.2 1.9 2.2 3.3 2.7-1.2 1.2-2.9 2-4.6 2.1-1.1.1-2.4-.1-3.5-.8z"/>
            </svg>
          </div>
          <div class="brand-name">Smart Soil Monitor</div>
        </div>
        <nav class="nav" aria-label="Sidebar navigation">
          <button class="nav-item active" type="button" data-target="dashboard"><span class="nav-icon">◈</span>Dashboard</button>
          <button class="nav-item" type="button" data-target="live-monitoring"><span class="nav-icon">◌</span>Live Monitoring</button>
          <button class="nav-item" type="button" data-target="dataset"><span class="nav-icon">▣</span>Dataset</button>
          <button class="nav-item" type="button" data-target="analytics"><span class="nav-icon">◍</span>Analytics</button>
          <button class="nav-item" type="button" data-target="moisture-control"><span class="nav-icon">⎈</span>Moisture Control</button>
          <button class="nav-item" type="button" data-target="system-logs"><span class="nav-icon">▤</span>System Logs</button>
          <button class="nav-item" type="button" data-target="settings"><span class="nav-icon">⚙</span>Settings</button>
        </nav>
        <div class="sidebar-card">
          <div class="sidebar-card-label">Pump Status</div>
          <div class="sidebar-card-value" id="sidebar-pump-status">Unknown</div>
          <div class="sidebar-card-meta" id="sidebar-moisture-status">Waiting for backend data</div>
        </div>
      </aside>

      <main class="main-panel" id="dashboard">
        <header class="topbar">
          <div>
            <div class="eyebrow">Smart agriculture overview</div>
            <h1>Smart Soil Monitoring</h1>
            <p class="subheading">Real-time monitoring and intelligent moisture control</p>
          </div>
          <div class="topbar-actions">
            <div class="online-chip" id="system-status"><span class="dot offline"></span><span>Connecting to backend</span></div>
            <div class="connection-pill">ESP8266 <span class="dot offline" id="esp8266-dot"></span><span id="esp8266-header-status">Disconnected</span></div>
            <div class="timestamp-block" id="time-display">—</div>
            <div class="user-chip" aria-label="Smart Soil Monitor">SM</div>
          </div>
        </header>

        <div class="operation-message" id="operation-message" role="status" aria-live="polite">Loading dashboard from the Python backend…</div>

        <section class="metrics-grid" id="live-monitoring" aria-label="Primary metrics">
          <article class="metric-card accent-card">
            <div class="metric-header">
              <div class="metric-icon soil"><svg viewBox="0 0 24 24"><path d="M12 3c4.2 4.6 7 7.7 7 11a7 7 0 1 1-14 0c0-3.3 2.8-6.4 7-11zm-5 12.5c1 .8 2.2 1.2 3.5 1.2 1.7 0 3.2-.7 4.5-2.1-.6 2.7-2.5 4.4-4.9 4.4-1.8 0-3.2-1.1-3.1-3.5z"/></svg></div>
              <div class="status-pill small muted" id="moisture-status-badge">Unknown</div>
            </div>
            <div class="metric-label">Soil Moisture</div>
            <div class="metric-value" id="soil-moisture-value">— <span>%</span></div>
            <div class="metric-foot"><span class="trend neutral" id="moisture-change">—</span><span>vs previous reading</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-header">
              <div class="metric-icon target"><svg viewBox="0 0 24 24"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 2.3a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4zm.9 2.1h-1.8v5.2L15.9 16l.9-1.5-3.9-2.5V7z"/></svg></div>
              <div class="status-pill small muted">Target</div>
            </div>
            <div class="metric-label">Target Moisture</div>
            <div class="metric-value" id="target-moisture-value">— <span>%</span></div>
            <div class="metric-foot"><span class="trend neutral" id="target-source">Backend calculation</span><span>ideal range</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-header">
              <div class="metric-icon temp"><svg viewBox="0 0 24 24"><path d="M14 2.5a2.5 2.5 0 1 0-5 0V12.1a4.5 4.5 0 1 0 5 0V2.5zm-2.5 1.1v8.3h1.8V3.6h-1.8zm.9 11.4a2.7 2.7 0 1 1-2.7 2.7 2.7 2.7 0 0 1 2.7-2.7z"/></svg></div>
              <div class="status-pill small muted">Ambient</div>
            </div>
            <div class="metric-label">Temperature</div>
            <div class="metric-value" id="temperature-value">— <span>°C</span></div>
            <div class="metric-foot"><span class="trend neutral" id="temperature-change">—</span><span>vs previous reading</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-header">
              <div class="metric-icon humidity"><svg viewBox="0 0 24 24"><path d="M12 2.5c3.9 4.6 6.5 7.5 6.5 10.7A6.5 6.5 0 0 1 5.5 13.2C5.5 9.8 8.1 7 12 2.5zm-2.4 12.4a3.4 3.4 0 1 0 4.8 0l-.9-.9a1.7 1.7 0 1 1-2.9 0l-.9.9z"/></svg></div>
              <div class="status-pill small muted">Humidity</div>
            </div>
            <div class="metric-label">Humidity</div>
            <div class="metric-value" id="humidity-value">— <span>%</span></div>
            <div class="metric-foot"><span class="trend neutral" id="humidity-change">—</span><span>vs previous reading</span></div>
          </article>
        </section>

        <section class="main-grid">
          <article class="card chart-card">
            <div class="section-heading-row">
              <div><h2>Moisture Monitoring</h2><p>Real-time soil moisture variation</p></div>
              <div class="legend"><span><i class="legend-dot moisture"></i>Soil Moisture</span><span><i class="legend-dot target-line"></i>Target Moisture</span></div>
            </div>
            <div class="chart-wrap" aria-label="Moisture chart">
              <svg viewBox="0 0 820 310" role="img" aria-label="No backend readings yet">
                <g class="grid-lines">
                  <line x1="40" x2="780" y1="30" y2="30"/><line x1="40" x2="780" y1="90" y2="90"/>
                  <line x1="40" x2="780" y1="150" y2="150"/><line x1="40" x2="780" y1="210" y2="210"/>
                  <line x1="40" x2="780" y1="270" y2="270"/>
                </g>
                <g class="y-labels">
                  <text x="8" y="274">0%</text><text x="8" y="214">25%</text><text x="8" y="154">50%</text>
                  <text x="8" y="94">75%</text><text x="8" y="34">100%</text>
                </g>
                <path id="chart-area" d="" fill="url(#soil-fill)" opacity="0.95"/>
                <path id="moisture-line" d="" fill="none" stroke="#1a8f4d" stroke-width="3" stroke-linecap="round"/>
                <path id="target-line" d="" fill="none" stroke="#86efac" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5 10"/>
                <g id="chart-x-labels" class="x-labels"></g>
                <g id="chart-current-point" class="current-point"></g>
                <text id="chart-empty-label" x="410" y="146" text-anchor="middle" fill="#647067">Waiting for backend readings</text>
                <defs><linearGradient id="soil-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(34,197,94,0.18)"/><stop offset="100%" stop-color="rgba(34,197,94,0.02)"/></linearGradient></defs>
              </svg>
            </div>
          </article>

          <article class="card control-card" id="moisture-control">
            <div class="control-header"><span class="badge-status optimal" id="control-status-badge">UNKNOWN</span></div>
            <div class="control-body">
              <div class="value-row"><span>Current Moisture</span><strong id="control-current-moisture">—</strong></div>
              <div class="value-row"><span>Target Moisture</span><strong id="control-target-moisture">—</strong></div>
              <div class="value-row highlight-row"><span>Difference</span><strong id="control-difference">—</strong></div>
            </div>
            <div class="system-action-box"><span class="label">Python System Decision</span><strong id="system-action">Waiting for data</strong></div>
            <div class="pump-status-note">Physical pump status: <strong id="physical-pump-status">Unknown</strong></div>
          </article>
        </section>

        <section class="secondary-grid">
          <article class="card env-card">
            <div class="section-heading-row compact"><h3>Environmental Data</h3></div>
            <div class="mini-metrics">
              <div class="mini-stat"><span class="mini-label">Temperature</span><strong id="environment-temperature">— <small>°C</small></strong></div>
              <div class="mini-stat"><span class="mini-label">Humidity</span><strong id="environment-humidity">— <small>%</small></strong></div>
              <div class="mini-stat"><span class="mini-label">Soil Condition</span><strong id="environment-condition">Unknown</strong></div>
              <div class="mini-stat"><span class="mini-label">Pump Status</span><strong id="environment-pump">Unknown</strong></div>
            </div>
          </article>
          <article class="card device-card">
            <div class="section-heading-row compact"><h3>Live Device Status</h3></div>
            <ul class="device-list">
              <li><span class="device-name">ESP8266</span><span class="live-indicator disconnected" id="device-esp8266"><i></i>Disconnected</span></li>
              <li><span class="device-name">LCD</span><span class="live-indicator disconnected" id="device-lcd"><i></i>Disconnected</span></li>
              <li><span class="device-name">Blynk</span><span class="live-indicator disconnected" id="device-blynk"><i></i>Disconnected</span></li>
              <li><span class="device-name">Python Controller</span><span class="live-indicator disconnected" id="device-python-controller"><i></i>Disconnected</span></li>
              <li><span class="device-name">Sensor</span><span class="live-indicator disconnected" id="device-sensor"><i></i>Disconnected</span></li>
            </ul>
          </article>
        </section>

        <section class="card dataset-card" id="dataset">
          <div class="dataset-header">
            <div><h3>Monitoring Dataset</h3><p id="dataset-source">Processed readings from Python backend</p></div>
            <div class="action-buttons">
              <button class="ghost-button" type="button" id="view-dataset-button">View Dataset</button>
              <button class="ghost-button" type="button" id="export-dataset-button">Export Excel</button>
              <button class="primary-button" type="button" data-action="refresh">Refresh Data</button>
            </div>
          </div>
          <div class="dataset-stats">
            <div><span>Total Records</span><strong id="dataset-record-count">—</strong></div>
            <div><span>Latest Reading</span><strong id="dataset-latest-reading">—</strong></div>
            <div><span>Average Moisture</span><strong id="dataset-average-moisture">—</strong></div>
            <div><span>Average Temperature</span><strong id="dataset-average-temperature">—</strong></div>
            <div><span>Average Humidity</span><strong id="dataset-average-humidity">—</strong></div>
          </div>

          <div class="upload-panel">
            <div class="upload-heading"><h4>Upload Dataset</h4><p>Process CSV or Excel readings through the Python backend</p></div>
            <div class="upload-dropzone" id="upload-dropzone" tabindex="0" role="button" aria-label="Choose or drop a CSV or XLSX dataset">
              <input id="dataset-file" type="file" accept=".csv,.xlsx" hidden>
              <div class="upload-symbol" aria-hidden="true">↑</div>
              <strong>Drag &amp; drop your dataset here</strong>
              <span>or</span>
              <button class="ghost-button" type="button" id="choose-dataset-button">Choose Dataset</button>
              <small>Supported: CSV, XLSX (maximum 25 MB)</small>
            </div>
            <div class="upload-file-row" id="upload-file-row" hidden>
              <div><strong id="upload-filename">—</strong><span id="upload-filesize">—</span></div>
              <button class="text-button" type="button" id="remove-dataset-button" aria-label="Remove selected dataset">Remove</button>
            </div>
            <div class="upload-progress" id="upload-progress" hidden>
              <div class="upload-progress-track"><span id="upload-progress-bar"></span></div>
              <span id="upload-status" role="status" aria-live="polite"></span>
            </div>
            <button class="primary-button upload-submit" type="button" id="upload-dataset-button" disabled>Upload Dataset</button>
          </div>

          <div class="table-wrap" id="dataset-table">
            <table>
              <thead><tr><th>Timestamp</th><th>Moisture</th><th>Temperature</th><th>Humidity</th><th>Target Moisture</th><th>System Status</th><th>Pump Status</th></tr></thead>
              <tbody id="dataset-table-body"><tr><td colspan="7" class="empty-table">No processed dataset loaded.</td></tr></tbody>
            </table>
          </div>
          <div class="dataset-pagination" id="dataset-pagination"></div>
        </section>

        <section class="card analytics-card" id="analytics">
          <div class="section-heading-row">
            <div>
              <h3>📊 Firebase &amp; Soil Moisture Visual Analytics Dashboard</h3>
              <p>Real-time analytics scorecards and Cloud storage indicators</p>
            </div>
            <a href="https://lookerstudio.google.com/" target="_blank" rel="noopener" class="ghost-button" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
              <span>🌐 Open Google Looker Studio</span>
            </a>
          </div>
          <div class="analytics-grid">
            <div class="mini-stat"><span class="mini-label">Average Moisture</span><strong id="analytics-average-moisture">—</strong></div>
            <div class="mini-stat"><span class="mini-label">Minimum Moisture</span><strong id="analytics-minimum-moisture">—</strong></div>
            <div class="mini-stat"><span class="mini-label">Maximum Moisture</span><strong id="analytics-maximum-moisture">—</strong></div>
            <div class="mini-stat"><span class="mini-label">Average Temperature</span><strong id="analytics-average-temperature">—</strong></div>
            <div class="mini-stat"><span class="mini-label">Average Humidity</span><strong id="analytics-average-humidity">—</strong></div>
            <div class="mini-stat"><span class="mini-label">Average Target Moisture</span><strong id="analytics-target-moisture">—</strong></div>
          </div>

          <div class="looker-dashboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 20px;">
            <div class="card" style="padding: 16px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;">
              <h4 style="font-size: 14px; margin-bottom: 12px; color: #86efac;">💧 Irrigation &amp; Water Metrics Formula</h4>
              <div style="font-size: 13px; opacity: 0.8; margin-bottom: 6px;">Water Required per % deficit: <strong>10 ml / kg</strong></div>
              <div style="font-size: 13px; opacity: 0.8; margin-bottom: 6px;">Water Volume in Liters: <strong>Water_Required_ml / 1000</strong></div>
              <div style="font-size: 13px; opacity: 0.8;">Pump Execution Runtime: <strong>Water_Required_ml / 5 sec</strong></div>
            </div>
            
            <div class="card" style="padding: 16px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;">
              <h4 style="font-size: 14px; margin-bottom: 12px; color: #60a5fa;">🔥 Live Firebase REST JSON Feed</h4>
              <div style="font-size: 12px; font-family: monospace; word-break: break-all; opacity: 0.9; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px;">
                https://smart-soil-monitor-9f9b0-default-rtdb.firebaseio.com/telemetry/history.json
              </div>
            </div>
          </div>
        </section>


        <section class="card logs-card" id="system-logs">
          <div class="section-heading-row"><div><h3>System Logs</h3><p>Events recorded by the Python service</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Timestamp</th><th>Event</th><th>Status</th></tr></thead><tbody id="logs-table-body"><tr><td colspan="3" class="empty-table">No backend events recorded.</td></tr></tbody></table></div>
        </section>

        <section class="card settings-card" id="settings">
          <div class="section-heading-row"><div><h3>Settings &amp; Firebase Cloud Sync</h3><p>Configure dashboard behavior and Cloud Firebase synchronization</p></div></div>
          <label class="setting-row" for="polling-interval"><span><strong>Live refresh interval</strong><small>Dashboard and device status polling</small></span><select id="polling-interval"><option value="2000">2 seconds</option><option value="3000">3 seconds</option><option value="5000">5 seconds</option></select></label>
          <div class="setting-row"><span><strong>Python API</strong><small id="api-health-text">Checking backend connection…</small></span><span class="live-indicator disconnected" id="settings-api-status"><i></i>Offline</span></div>
          
          <div class="cloud-sync-box" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="margin-bottom: 8px;">
              <strong>🔥 Firebase Realtime Database Sync</strong>
              <div style="font-size: 13px; opacity: 0.8; margin-top: 2px;">Automatically or manually sync live telemetry &amp; historical dataset records to your Firebase Realtime Database.</div>
            </div>
            <div style="display: flex; gap: 8px; width: 100%; margin-top: 8px;">
              <input type="text" id="firebase-url-input" placeholder="https://your-project-id-default-rtdb.firebaseio.com" style="flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: rgba(0,0,0,0.2); color: inherit; font-size: 13px;">
              <button class="primary-button" type="button" id="save-firebase-url-button">Save URL</button>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
              <button class="ghost-button" type="button" id="sync-latest-cloud-button">Sync Latest Reading</button>
              <button class="ghost-button" type="button" id="sync-all-cloud-button">Sync All History to Firebase</button>
            </div>
            <div id="firebase-sync-status" style="margin-top: 8px; font-size: 13px; font-weight: 500;"></div>
          </div>

          <p class="settings-note" style="margin-top: 16px;">Monitoring actions control the backend's telemetry collection. Physical pump operation requires a connected hardware adapter.</p>
        </section>


        <section class="control-strip" aria-label="System control actions">
          <button class="primary-button" type="button" id="start-monitoring-button">Start Monitoring</button>
          <button class="secondary-button" type="button" id="stop-monitoring-button">Stop Monitoring</button>
          <button class="secondary-button" type="button" data-action="refresh">Refresh Data</button>
          <span class="monitoring-state" id="monitoring-state">Monitoring state: Unknown</span>
        </section>
      </main>
    </div>
  `

  const byId = <T extends Element>(id: string): T | null =>
    document.getElementById(id) as T | null
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
  const emptyMark = '—'
  let currentDatasetPage = 1
  let pollTimer = 0
  let currentDashboard: DashboardData | null = null
  let selectedFile: File | null = null
  let refreshTask: Promise<void> | null = null

  function setText(id: string, text: string): void {
    const element = byId(id)
    if (element) element.textContent = text
  }

  function displayNumber(value: number | null | undefined, suffix = ''): string {
    return value === null || value === undefined || !Number.isFinite(value)
      ? emptyMark
      : `${numberFormat.format(value)}${suffix}`
  }

  function setMessage(message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
    const banner = byId<HTMLDivElement>('operation-message')
    if (!banner) return
    banner.textContent = message
    banner.className = `operation-message ${kind}`
    banner.hidden = !message
  }

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'The requested backend operation failed.'
  }

  function statusClass(status: string): string {
    const normalized = status.toLowerCase()
    if (normalized.includes('dry') || normalized.includes('warning')) return 'warn'
    if (normalized.includes('wet') || normalized.includes('critical')) return 'critical'
    if (normalized === 'optimal' || normalized === 'connected') return 'okay'
    return 'unknown'
  }

  function renderStatus(element: HTMLElement | null, status: string, badge = false): void {
    if (!element) return
    element.textContent = status
    element.classList.remove('okay', 'warn', 'critical', 'unknown', 'optimal', 'muted', 'green')
    const style = statusClass(status)
    element.classList.add(badge ? (style === 'okay' ? 'optimal' : style) : style)
  }

  function setConnectionStatus(online: boolean): void {
    const status = byId<HTMLDivElement>('system-status')
    if (!status) return
    status.innerHTML = `<span class="dot ${online ? '' : 'offline'}"></span><span>${online ? 'System Online' : 'Backend Offline'}</span>`
    const apiStatus = byId<HTMLSpanElement>('settings-api-status')
    if (apiStatus) {
      apiStatus.className = `live-indicator ${online ? 'online' : 'disconnected'}`
      apiStatus.innerHTML = `<i></i>${online ? 'Connected' : 'Offline'}`
    }
    setText('api-health-text', online ? 'Python service is responding' : 'Unable to connect to Python service')
  }

  function updateDevice(id: string, device: Device | undefined, activeLabel = 'Connected'): void {
    const element = byId<HTMLSpanElement>(id)
    if (!element) return
    const connected = device?.status === 'connected'
    element.className = `live-indicator ${connected ? 'online' : 'disconnected'}`
    element.innerHTML = `<i></i>${connected ? activeLabel : 'Disconnected'}`
  }

  function updateHeaderDeviceStatus(device: Device | undefined): void {
    const connected = device?.status === 'connected'
    const dot = byId<HTMLSpanElement>('esp8266-dot')
    if (dot) dot.className = `dot ${connected ? 'green' : 'offline'}`
    setText('esp8266-header-status', connected ? 'Connected' : 'Disconnected')
  }

  function renderDevices(devices: Record<string, Device>): void {
    updateDevice('device-esp8266', devices.esp8266)
    updateDevice('device-lcd', devices.lcd, 'Active')
    updateDevice('device-blynk', devices.blynk)
    updateDevice('device-python-controller', devices.python_controller, 'Running')
    updateDevice('device-sensor', devices.sensor, 'Active')
    updateHeaderDeviceStatus(devices.esp8266)
  }

  function setMetricValue(id: string, value: number | null | undefined, unit: string): void {
    const element = byId<HTMLDivElement>(id)
    if (element) element.innerHTML = `${displayNumber(value)} <span>${unit}</span>`
  }

  function renderDashboard(data: DashboardData): void {
    currentDashboard = data
    const latest = data.latest_reading
    setConnectionStatus(true)
    renderDevices(data.devices)
    setText('monitoring-state', `Monitoring state: ${data.monitoring_status === 'running' ? 'Running' : 'Stopped'}`)
    const startButton = byId<HTMLButtonElement>('start-monitoring-button')
    const stopButton = byId<HTMLButtonElement>('stop-monitoring-button')
    if (startButton) startButton.disabled = data.monitoring_status === 'running'
    if (stopButton) stopButton.disabled = data.monitoring_status !== 'running'

    const latestPump = latest?.pump_status ?? 'Unknown'
    setText('sidebar-pump-status', latestPump)
    setText('sidebar-moisture-status', latest?.moisture_status ?? 'Waiting for backend data')
    setText('dataset-record-count', numberFormat.format(data.record_count))
    setText(
      'dataset-latest-reading',
      latest?.timestamp ? formatTimestamp(latest.timestamp) : latest?.row_number ? `Record ${latest.row_number}` : emptyMark,
    )
    if (latest) {
      setMetricValue('soil-moisture-value', latest.moisture, '%')
      setMetricValue('target-moisture-value', latest.target_moisture, '%')
      setMetricValue('temperature-value', latest.temperature, '°C')
      setMetricValue('humidity-value', latest.humidity, '%')
      setText('control-current-moisture', displayNumber(latest.moisture, ' %'))
      setText('control-target-moisture', displayNumber(latest.target_moisture, ' %'))
      setText('control-difference', displayNumber(latest.difference, ' %'))
      setText('environment-temperature', `${displayNumber(latest.temperature)} °C`)
      setText('environment-humidity', `${displayNumber(latest.humidity)} %`)
      setText('environment-condition', latest.moisture_status)
      setText('environment-pump', latestPump)
      setText('physical-pump-status', latestPump)
      setText(
        'system-action',
        latest.pump_decision === 'UNKNOWN' ? 'Waiting for target model' : latest.pump_decision,
      )
      renderStatus(byId('moisture-status-badge'), latest.moisture_status)
      renderStatus(byId('control-status-badge'), latest.moisture_status, true)
    } else {
      setMetricValue('soil-moisture-value', null, '%')
      setMetricValue('target-moisture-value', null, '%')
      setMetricValue('temperature-value', null, '°C')
      setMetricValue('humidity-value', null, '%')
      setText('control-current-moisture', emptyMark)
      setText('control-target-moisture', emptyMark)
      setText('control-difference', emptyMark)
      setText('environment-temperature', `${emptyMark} °C`)
      setText('environment-humidity', `${emptyMark} %`)
      setText('environment-condition', 'Unknown')
      setText('environment-pump', 'Unknown')
      setText('physical-pump-status', 'Unknown')
      setText('system-action', 'Waiting for data')
      renderStatus(byId('moisture-status-badge'), 'Unknown')
      renderStatus(byId('control-status-badge'), 'Unknown', true)
    }
    setText('moisture-change', displayChange(data.changes.moisture_change, '%'))
    setText('temperature-change', displayChange(data.changes.temperature_change, '°'))
    setText('humidity-change', displayChange(data.changes.humidity_change, '%'))
    setText(
      'target-source',
      !latest || latest.target_moisture === null ? 'Target unavailable' : 'Python calculation',
    )
    setText('dataset-source', data.source ? `Processed ${data.source === 'sensor' ? 'device readings' : 'dataset'} from Python backend` : 'No processed dataset')
    renderChart(data.history)
    renderAnalytics(data.analytics)
  }

  function displayChange(value: number | null | undefined, suffix: string): string {
    if (value === null || value === undefined) return 'No previous reading'
    const sign = value > 0 ? '+' : ''
    return `${sign}${numberFormat.format(value)}${suffix}`
  }

  function formatTimestamp(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date)
  }

  function renderAnalytics(analytics: Analytics): void {
    setText('dataset-average-moisture', displayNumber(analytics.average_moisture, '%'))
    setText('dataset-average-temperature', displayNumber(analytics.average_temperature, '°C'))
    setText('dataset-average-humidity', displayNumber(analytics.average_humidity, '%'))
    setText('analytics-average-moisture', displayNumber(analytics.average_moisture, '%'))
    setText('analytics-minimum-moisture', displayNumber(analytics.minimum_moisture, '%'))
    setText('analytics-maximum-moisture', displayNumber(analytics.maximum_moisture, '%'))
    setText('analytics-average-temperature', displayNumber(analytics.average_temperature, '°C'))
    setText('analytics-average-humidity', displayNumber(analytics.average_humidity, '%'))
    setText('analytics-target-moisture', displayNumber(analytics.target_moisture, '%'))
  }

  function renderChart(readings: Reading[]): void {
    const area = byId<SVGPathElement>('chart-area')
    const moisturePath = byId<SVGPathElement>('moisture-line')
    const targetPath = byId<SVGPathElement>('target-line')
    const labels = byId<SVGGElement>('chart-x-labels')
    const point = byId<SVGGElement>('chart-current-point')
    const emptyLabel = byId<SVGTextElement>('chart-empty-label')
    const svg = moisturePath?.ownerSVGElement
    if (!area || !moisturePath || !targetPath || !labels || !point || !emptyLabel || !svg) return

    labels.replaceChildren()
    point.replaceChildren()
    if (!readings.length) {
      area.setAttribute('d', '')
      moisturePath.setAttribute('d', '')
      targetPath.setAttribute('d', '')
      emptyLabel.textContent = 'Waiting for backend readings'
      svg.setAttribute('aria-label', 'No backend readings yet')
      return
    }
    emptyLabel.textContent = ''
    svg.setAttribute('aria-label', `Chart of ${readings.length} backend readings`)

    const xAt = (index: number) => (readings.length === 1 ? 410 : 40 + (740 * index) / (readings.length - 1))
    const yAt = (value: number) => 270 - (value / 100) * 240
    const linePath = (values: Array<number | null>) => {
      const points = values.flatMap((value, index) =>
        value === null || !Number.isFinite(value) ? [] : [{ x: xAt(index), y: yAt(value) }],
      )
      if (!points.length) return ''
      if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
      let path = `M ${points[0].x} ${points[0].y}`
      for (let index = 1; index < points.length - 1; index += 1) {
        const middleX = (points[index].x + points[index + 1].x) / 2
        const middleY = (points[index].y + points[index + 1].y) / 2
        path += ` Q ${points[index].x} ${points[index].y} ${middleX} ${middleY}`
      }
      const last = points[points.length - 1]
      path += ` T ${last.x} ${last.y}`
      return path
    }

    const moistureValues = readings.map((reading) => reading.moisture)
    const targetValues = readings.map((reading) => reading.target_moisture)
    const moistureLine = linePath(moistureValues)
    moisturePath.setAttribute('d', moistureLine)
    targetPath.setAttribute('d', linePath(targetValues))
    const lastPoint = { x: xAt(readings.length - 1), y: yAt(readings[readings.length - 1].moisture) }
    area.setAttribute('d', `${moistureLine} L ${lastPoint.x} 270 L ${xAt(0)} 270 Z`)
    const currentCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    currentCircle.setAttribute('cx', String(lastPoint.x))
    currentCircle.setAttribute('cy', String(lastPoint.y))
    currentCircle.setAttribute('r', '7')
    const pulseCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    pulseCircle.setAttribute('cx', String(lastPoint.x))
    pulseCircle.setAttribute('cy', String(lastPoint.y))
    pulseCircle.setAttribute('r', '15')
    pulseCircle.setAttribute('class', 'pulse')
    point.append(currentCircle, pulseCircle)

    const labelCount = Math.min(readings.length, 7)
    for (let index = 0; index < labelCount; index += 1) {
      const readingIndex = labelCount === 1
        ? readings.length - 1
        : Math.round((index * (readings.length - 1)) / (labelCount - 1))
      const reading = readings[readingIndex]
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(xAt(readingIndex)))
      text.setAttribute('y', '292')
      text.textContent = reading.timestamp
        ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(reading.timestamp))
        : `#${reading.row_number ?? readingIndex + 1}`
      labels.append(text)
    }
  }

  function renderDatasetTable(records: Reading[]): void {
    const body = byId<HTMLTableSectionElement>('dataset-table-body')
    if (!body) return
    body.replaceChildren()
    if (!records.length) {
      const row = body.insertRow()
      const cell = row.insertCell()
      cell.colSpan = 7
      cell.className = 'empty-table'
      cell.textContent = 'No processed dataset loaded.'
      return
    }
    for (const reading of records) {
      const row = body.insertRow()
      const values = [
        reading.timestamp ? formatTimestamp(reading.timestamp) : reading.row_number ? `Record ${reading.row_number}` : emptyMark,
        displayNumber(reading.moisture, '%'),
        displayNumber(reading.temperature, '°C'),
        displayNumber(reading.humidity, '%'),
        displayNumber(reading.target_moisture, '%'),
      ]
      for (const value of values) row.insertCell().textContent = value
      const statusCell = row.insertCell()
      const badge = document.createElement('span')
      badge.className = `status-badge ${statusClass(reading.moisture_status)}`
      badge.textContent = reading.moisture_status
      statusCell.append(badge)
      row.insertCell().textContent = reading.pump_status ?? 'Unknown'
    }
  }

  function renderLogs(logs: LogEntry[]): void {
    const body = byId<HTMLTableSectionElement>('logs-table-body')
    if (!body) return
    body.replaceChildren()
    if (!logs.length) {
      const row = body.insertRow()
      const cell = row.insertCell()
      cell.colSpan = 3
      cell.className = 'empty-table'
      cell.textContent = 'No backend events recorded.'
      return
    }
    for (const entry of logs) {
      const row = body.insertRow()
      row.insertCell().textContent = formatTimestamp(entry.timestamp)
      row.insertCell().textContent = entry.event
      const status = row.insertCell()
      const badge = document.createElement('span')
      badge.className = `status-badge ${entry.status === 'success' ? 'okay' : 'warn'}`
      badge.textContent = entry.status
      status.append(badge)
    }
  }

  function renderPagination(page: number, pageSize: number, recordCount: number): void {
    const pagination = byId<HTMLDivElement>('dataset-pagination')
    if (!pagination) return
    pagination.replaceChildren()
    if (recordCount <= pageSize) return
    const previous = document.createElement('button')
    previous.type = 'button'
    previous.className = 'secondary-button'
    previous.textContent = 'Previous'
    previous.disabled = page <= 1
    previous.addEventListener('click', () => void loadDatasetPage(page - 1))
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'secondary-button'
    next.textContent = 'Next'
    next.disabled = page * pageSize >= recordCount
    next.addEventListener('click', () => void loadDatasetPage(page + 1))
    const summary = document.createElement('span')
    summary.textContent = `Page ${page} · ${numberFormat.format(recordCount)} records`
    pagination.append(previous, summary, next)
  }

  async function loadDatasetPage(page = 1): Promise<void> {
    currentDatasetPage = page
    try {
      const result = await getDataset(page, 25)
      renderDatasetTable(result.records)
      renderPagination(result.page, result.page_size, result.record_count)
      setText('dataset-source', result.filename
        ? `Processed dataset: ${result.filename}`
        : 'Processed readings from Python backend')
    } catch (error) {
      setMessage(getErrorMessage(error), 'error')
    }
  }

  function refreshAll(silent = false): Promise<void> {
    if (refreshTask) return refreshTask
    const task = (async () => {
      const results = await Promise.allSettled([
        getDashboardData(),
        getDataset(currentDatasetPage, 25),
        getAnalytics(),
        getLogs(),
        getDeviceStatus(),
        getHealth(),
      ])
      const [dashboardResult, datasetResult, analyticsResult, logsResult, devicesResult, healthResult] = results
      let failure: unknown = null
      if (dashboardResult.status === 'fulfilled') renderDashboard(dashboardResult.value)
      else failure = dashboardResult.reason

      if (datasetResult.status === 'fulfilled') {
        renderDatasetTable(datasetResult.value.records)
        renderPagination(datasetResult.value.page, datasetResult.value.page_size, datasetResult.value.record_count)
        setText('dataset-source', datasetResult.value.filename
          ? `Processed dataset: ${datasetResult.value.filename}`
          : 'Processed readings from Python backend')
      } else if (!failure) failure = datasetResult.reason

      if (analyticsResult.status === 'fulfilled') renderAnalytics(analyticsResult.value)
      else if (!failure) failure = analyticsResult.reason

      if (logsResult.status === 'fulfilled') renderLogs(logsResult.value.logs)
      else if (!failure) failure = logsResult.reason

      if (devicesResult.status === 'fulfilled') renderDevices(devicesResult.value)
      else if (!failure) failure = devicesResult.reason

      if (healthResult.status === 'fulfilled') setConnectionStatus(true)
      else {
        setConnectionStatus(false)
        if (!failure) failure = healthResult.reason
      }

      if (failure && !silent) setMessage(getErrorMessage(failure), 'error')
      else if (!failure && !silent) setMessage('Dashboard refreshed from the Python backend.', 'success')
      else if (!failure && silent && byId('operation-message')?.classList.contains('error')) setMessage('')
    })()
    let tracked: Promise<void>
    tracked = task.finally(() => {
      if (refreshTask === tracked) refreshTask = null
    })
    refreshTask = tracked
    return tracked
  }

  async function refreshLiveStatus(): Promise<void> {
    try {
      const data = await getDashboardData()
      renderDashboard(data)
      setConnectionStatus(true)
      if (byId('operation-message')?.classList.contains('error')) setMessage('')
    } catch (error) {
      setConnectionStatus(false)
      if (!byId('operation-message')?.classList.contains('error')) {
        setMessage(getErrorMessage(error), 'error')
      }
    }
  }

  async function runButtonAction<T>(
    button: HTMLButtonElement | null,
    busyLabel: string,
    action: () => Promise<T>,
    successMessage: (result: T) => string,
  ): Promise<void> {
    if (!button || button.disabled) return
    const original = button.textContent ?? ''
    button.disabled = true
    button.textContent = busyLabel
    setMessage('')
    try {
      const result = await action()
      await refreshAll(true)
      setMessage(successMessage(result), 'success')
    } catch (error) {
      setMessage(getErrorMessage(error), 'error')
    } finally {
      button.textContent = original
      if (currentDashboard) {
        button.disabled = button.id === 'start-monitoring-button'
          ? currentDashboard.monitoring_status === 'running'
          : button.id === 'stop-monitoring-button'
            ? currentDashboard.monitoring_status !== 'running'
            : false
      } else {
        button.disabled = false
      }
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function selectFile(file: File | null): void {
    selectedFile = null
    const fileInput = byId<HTMLInputElement>('dataset-file')
    const uploadButton = byId<HTMLButtonElement>('upload-dataset-button')
    const fileRow = byId<HTMLDivElement>('upload-file-row')
    const progress = byId<HTMLDivElement>('upload-progress')
    if (fileInput) fileInput.value = ''
    if (progress) progress.hidden = true
    if (!file || !fileRow || !uploadButton) {
      if (fileRow) fileRow.hidden = true
      if (uploadButton) uploadButton.disabled = true
      return
    }
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx'].includes(extension ?? '')) {
      setMessage('Choose a .csv or .xlsx dataset.', 'error')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setMessage('Dataset exceeds the 25 MB upload limit.', 'error')
      return
    }
    selectedFile = file
    fileRow.hidden = false
    setText('upload-filename', file.name)
    setText('upload-filesize', formatFileSize(file.size))
    uploadButton.disabled = false
    setMessage('')
  }

  async function handleUpload(): Promise<void> {
    const button = byId<HTMLButtonElement>('upload-dataset-button')
    const progress = byId<HTMLDivElement>('upload-progress')
    const progressBar = byId<HTMLSpanElement>('upload-progress-bar')
    const status = byId<HTMLSpanElement>('upload-status')
    const file = selectedFile
    if (!button || !file || !progress || !progressBar || !status || button.disabled) return

    button.disabled = true
    button.textContent = 'Uploading Dataset…'
    progress.hidden = false
    status.textContent = 'Uploading dataset…'
    progressBar.style.width = '0%'
    setMessage('')
    try {
      const result = await uploadDataset(file, (percentage) => {
        progressBar.style.width = `${percentage}%`
        status.textContent = percentage >= 100 ? 'Processing dataset…' : `Uploading dataset… ${percentage}%`
      })
      progressBar.style.width = '100%'
      status.textContent = `Processed ${numberFormat.format(result.dataset.record_count)} records.`
      renderDashboard(result.dashboard)
      currentDatasetPage = 1
      await refreshAll(true)
      setMessage(`${result.dataset.filename} uploaded and processed successfully.`, 'success')
      selectFile(null)
    } catch (error) {
      status.textContent = 'Upload failed.'
      setMessage(getErrorMessage(error), 'error')
    } finally {
      button.textContent = 'Upload Dataset'
      button.disabled = selectedFile === null
    }
  }

  async function handleExport(): Promise<void> {
    const button = byId<HTMLButtonElement>('export-dataset-button')
    if (!button || button.disabled) return
    const original = button.textContent ?? 'Export Excel'
    button.disabled = true
    button.textContent = 'Exporting Excel…'
    setMessage('')
    try {
      const { blob, filename } = await exportDataset()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      const logs = await getLogs()
      renderLogs(logs.logs)
      setMessage('Processed Excel dataset downloaded.', 'success')
    } catch (error) {
      setMessage(getErrorMessage(error), 'error')
    } finally {
      button.disabled = false
      button.textContent = original
    }
  }

  async function handleRefresh(button: HTMLButtonElement): Promise<void> {
    if (button.disabled) return
    const original = button.textContent ?? 'Refresh Data'
    button.disabled = true
    button.textContent = 'Refreshing Data…'
    try {
      await refreshAll(false)
    } catch (error) {
      setMessage(getErrorMessage(error), 'error')
    } finally {
      button.textContent = original
      button.disabled = false
    }
  }

  function navigateTo(target: string, activeButton: HTMLButtonElement): void {
    const section = byId(target)
    if (!section) return
    document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
      button.classList.toggle('active', button === activeButton)
      button.setAttribute('aria-current', button === activeButton ? 'location' : 'false')
    })
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function updateClock(): void {
    setText('time-display', new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date()))
  }

  const navButtons = [...document.querySelectorAll<HTMLButtonElement>('.nav-item[data-target]')]
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target
      if (target) navigateTo(target, button)
    })
  })

  byId<HTMLButtonElement>('start-monitoring-button')?.addEventListener('click', (event) => {
    void runButtonAction(
      event.currentTarget as HTMLButtonElement,
      'Starting Monitoring…',
      startMonitoring,
      (result) => result.message,
    )
  })
  byId<HTMLButtonElement>('stop-monitoring-button')?.addEventListener('click', (event) => {
    void runButtonAction(
      event.currentTarget as HTMLButtonElement,
      'Stopping Monitoring…',
      stopMonitoring,
      (result) => result.message,
    )
  })
  document.querySelectorAll<HTMLButtonElement>('[data-action="refresh"]').forEach((button) => {
    button.addEventListener('click', () => void handleRefresh(button))
  })
  byId<HTMLButtonElement>('view-dataset-button')?.addEventListener('click', async () => {
    const button = byId<HTMLButtonElement>('view-dataset-button')
    if (!button || button.disabled) return
    button.disabled = true
    button.textContent = 'Loading Dataset…'
    try {
      currentDatasetPage = 1
      await loadDatasetPage(1)
      byId('dataset-table')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (!byId('operation-message')?.classList.contains('error')) setMessage('Processed dataset loaded from the backend.', 'success')
    } finally {
      button.disabled = false
      button.textContent = 'View Dataset'
    }
  })
  byId<HTMLButtonElement>('export-dataset-button')?.addEventListener('click', () => void handleExport())

  const datasetInput = byId<HTMLInputElement>('dataset-file')
  const dropzone = byId<HTMLDivElement>('upload-dropzone')
  const chooseButton = byId<HTMLButtonElement>('choose-dataset-button')
  chooseButton?.addEventListener('click', () => datasetInput?.click())
  dropzone?.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button')) return
    datasetInput?.click()
  })
  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      datasetInput?.click()
    }
  })
  datasetInput?.addEventListener('change', () => selectFile(datasetInput.files?.[0] ?? null))
  byId<HTMLButtonElement>('remove-dataset-button')?.addEventListener('click', () => selectFile(null))
  byId<HTMLButtonElement>('upload-dataset-button')?.addEventListener('click', () => void handleUpload())
  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault()
    dropzone.classList.add('dragging')
  })
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragging'))
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault()
    dropzone.classList.remove('dragging')
    const file = event.dataTransfer?.files[0]
    if (file) selectFile(file)
  })

  const pollSelect = byId<HTMLSelectElement>('polling-interval')
  const savedInterval = window.localStorage.getItem('soil-monitor-poll-interval')
  if (pollSelect && savedInterval && ['2000', '3000', '5000'].includes(savedInterval)) {
    pollSelect.value = savedInterval
  }
  function schedulePolling(): void {
    window.clearInterval(pollTimer)
    const interval = Number(pollSelect?.value ?? 3000)
    window.localStorage.setItem('soil-monitor-poll-interval', String(interval))
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshLiveStatus()
    }, interval)
  }
  pollSelect?.addEventListener('change', schedulePolling)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshLiveStatus()
  })

  // Firebase Cloud Sync Logic
  async function loadCloudConfig(): Promise<void> {
    try {
      const config = await getCloudConfig()
      const urlInput = byId<HTMLInputElement>('firebase-url-input')
      if (urlInput && config.firebase_url) {
        urlInput.value = config.firebase_url
      }
      const syncStatus = byId<HTMLElement>('firebase-sync-status')
      if (syncStatus) {
        syncStatus.textContent = config.configured
          ? '✓ Firebase Cloud URL configured & ready'
          : '⚠️ Firebase Cloud URL not configured'
        syncStatus.style.color = config.configured ? '#22c55e' : '#f59e0b'
      }
    } catch {
      // Ignore if backend isn't ready yet
    }
  }

  byId<HTMLButtonElement>('save-firebase-url-button')?.addEventListener('click', async () => {
    const input = byId<HTMLInputElement>('firebase-url-input')
    const syncStatus = byId<HTMLElement>('firebase-sync-status')
    if (!input || !input.value.trim()) {
      if (syncStatus) {
        syncStatus.textContent = 'Please enter a valid Firebase Realtime Database URL.'
        syncStatus.style.color = '#ef4444'
      }
      return
    }
    try {
      const res = await saveCloudConfig(input.value.trim())
      if (syncStatus) {
        syncStatus.textContent = `✓ ${res.message}`
        syncStatus.style.color = '#22c55e'
      }
    } catch (err) {
      if (syncStatus) {
        syncStatus.textContent = `Error: ${getErrorMessage(err)}`
        syncStatus.style.color = '#ef4444'
      }
    }
  })

  byId<HTMLButtonElement>('sync-latest-cloud-button')?.addEventListener('click', async () => {
    const syncStatus = byId<HTMLElement>('firebase-sync-status')
    if (syncStatus) {
      syncStatus.textContent = 'Syncing latest reading to Firebase Cloud…'
      syncStatus.style.color = '#3b82f6'
    }
    try {
      const res = await syncLatestToCloud()
      if (syncStatus) {
        syncStatus.textContent = `✓ ${res.message}`
        syncStatus.style.color = '#22c55e'
      }
    } catch (err) {
      if (syncStatus) {
        syncStatus.textContent = `Sync failed: ${getErrorMessage(err)}`
        syncStatus.style.color = '#ef4444'
      }
    }
  })

  byId<HTMLButtonElement>('sync-all-cloud-button')?.addEventListener('click', async () => {
    const syncStatus = byId<HTMLElement>('firebase-sync-status')
    if (syncStatus) {
      syncStatus.textContent = 'Syncing all historical records to Firebase Cloud…'
      syncStatus.style.color = '#3b82f6'
    }
    try {
      const res = await syncAllToCloud()
      if (syncStatus) {
        syncStatus.textContent = `✓ ${res.message}`
        syncStatus.style.color = '#22c55e'
      }
    } catch (err) {
      if (syncStatus) {
        syncStatus.textContent = `Sync failed: ${getErrorMessage(err)}`
        syncStatus.style.color = '#ef4444'
      }
    }
  })


  updateClock()
  window.setInterval(updateClock, 30_000)
  schedulePolling()
  void loadCloudConfig()
  void refreshAll()
}

