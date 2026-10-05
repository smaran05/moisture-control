# Smart Soil Monitor

The dashboard is a TypeScript/Vite frontend backed by a Python API. Sensor,
dataset, analytics, and device values are not generated in the browser.

## Run locally

Install frontend dependencies once with `npm install`. Install the Python API
dependencies using `python -m pip install -r requirements.txt`.

Start the API from the project root:

```powershell
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start the dashboard:

```powershell
npm run dev
```

Vite forwards `/api` requests to the Python API on port 8000. For deployment,
set `VITE_API_BASE_URL` to the API base path (default `/api`) and configure the
web server to proxy that path to the Python service.

The API trains the target-moisture regression model used by the existing
`green_sense.py` calculation. By default it looks for
`../moisture/grade 1/biodegradable_compost_20000_temperature_humidity_moisture.csv`
relative to this project. Set `SOIL_MODEL_DATASET` to the training CSV path
when using another directory. Uploaded workbooks with a `Target Moisture` or
`Dynamic Threshold (%)` column can use those supplied targets directly.

The API stores processed datasets, telemetry, monitoring state, and logs in
`backend/data/dashboard.sqlite3`. Override the data directory with
`SOIL_DATA_DIR` or set `SOIL_DATABASE_PATH` to a specific SQLite file.

## API and device integration

- `GET /api/dashboard` — latest reading, historical chart points, device and monitoring state
- `POST /api/dataset/upload` — multipart CSV/XLSX upload and processing
- `GET /api/dataset` and `/api/dataset/analytics` — processed records and summaries
- `GET /api/dataset/export` — processed workbook download
- `POST /api/monitoring/start` and `/api/monitoring/stop` — toggle backend telemetry collection
- `POST /api/sensor/readings` — accept ESP8266 readings while monitoring is running
- `POST /api/devices/{esp8266|lcd|blynk|sensor}/heartbeat` — update a device status
- `GET /api/logs`, `/api/devices/status`, `/api/monitoring/status` — operational status

Monitoring start/stop controls the API's telemetry-collection state. This
workspace does not include a serial, MQTT, Blynk, or pump hardware adapter, so
the API does not claim that a physical pump is being actuated. Device states
remain disconnected until actual readings or heartbeats arrive. A processed
dataset reports the Python decision as `Pump Decision`; actual `Pump Status`
remains unknown unless received from a device.
