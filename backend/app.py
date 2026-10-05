from __future__ import annotations

import json
import logging
import math
import os
import sqlite3
import urllib.request
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sklearn.linear_model import LinearRegression


logger = logging.getLogger("soil-monitor")
APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("SOIL_DATA_DIR", APP_DIR / "data"))
DATABASE_PATH = Path(os.environ.get("SOIL_DATABASE_PATH", DATA_DIR / "dashboard.sqlite3"))
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
HIGH_THRESHOLD = 60.0
DEVICE_TIMEOUT_SECONDS = 30
REQUIRED_COLUMNS = ("Moisture", "Temperature", "Humidity")
TRAINING_DATASET = Path(
    os.environ.get(
        "SOIL_MODEL_DATASET",
        APP_DIR.parent.parent
        / "moisture"
        / "grade 1"
        / "biodegradable_compost_20000_temperature_humidity_moisture.csv",
    )
)

app = FastAPI(title="Smart Soil Monitor API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get("SOIL_CORS_ORIGINS", "").split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_moisture_model: LinearRegression | None = None


class SensorReading(BaseModel):
    moisture: float = Field(ge=0, le=100, allow_inf_nan=False)
    temperature: float = Field(allow_inf_nan=False)
    humidity: float = Field(ge=0, le=100, allow_inf_nan=False)
    timestamp: datetime | None = None
    target_moisture: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    pump_status: str | None = None
    sensor_status: str = Field(default="connected", pattern="^(connected|disconnected)$")


class DeviceHeartbeat(BaseModel):
    status: str = Field(default="connected", pattern="^(connected|disconnected)$")


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type: Any, exc_value: Any, traceback: Any) -> bool | None:
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10, factory=ClosingConnection)
    connection.row_factory = sqlite3.Row
    return connection


def _initialize_database() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS datasets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                record_count INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_id INTEGER REFERENCES datasets(id),
                source TEXT NOT NULL,
                row_number INTEGER,
                timestamp TEXT,
                moisture REAL NOT NULL,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                target_moisture REAL,
                moisture_status TEXT NOT NULL,
                pump_decision TEXT NOT NULL,
                pump_status TEXT,
                raw_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_readings_dataset
                ON readings(dataset_id, row_number);
            CREATE INDEX IF NOT EXISTS idx_readings_source
                ON readings(source, id);
            CREATE TABLE IF NOT EXISTS devices (
                name TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                last_seen TEXT
            );
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                event TEXT NOT NULL,
                status TEXT NOT NULL
            );
            """
        )
        for device in ("esp8266", "lcd", "blynk", "sensor"):
            connection.execute(
                "INSERT OR IGNORE INTO devices(name, status) VALUES (?, 'disconnected')",
                (device,),
            )
        connection.execute(
            "INSERT OR IGNORE INTO settings(key, value) VALUES ('monitoring', 'stopped')"
        )
        connection.execute(
            "INSERT OR REPLACE INTO settings(key, value) VALUES ('firebase_url', 'https://smart-soil-monitor-9f9b0-default-rtdb.firebaseio.com')"
        )



def _log(event: str, status: str = "success") -> None:
    with _connect() as connection:
        connection.execute(
            "INSERT INTO logs(timestamp, event, status) VALUES (?, ?, ?)",
            (_utc_now(), event, status),
        )


def _get_model() -> LinearRegression:
    global _moisture_model
    if _moisture_model is not None:
        return _moisture_model
    if not TRAINING_DATASET.is_file():
        raise HTTPException(
            status_code=503,
            detail=(
                "Target moisture model data is unavailable. Configure "
                "SOIL_MODEL_DATASET with the training CSV path."
            ),
        )
    try:
        training = pd.read_csv(TRAINING_DATASET)
        missing = [column for column in REQUIRED_COLUMNS if column not in training]
        if missing:
            raise ValueError(f"Training dataset is missing the {missing[0]} column.")
        training = training.loc[:, ["Temperature", "Humidity", "Moisture"]].apply(
            pd.to_numeric, errors="raise"
        ).dropna()
        if training.empty:
            raise ValueError("Training dataset has no valid readings.")
        model = LinearRegression()
        model.fit(training[["Temperature", "Humidity"]], training["Moisture"])
        _moisture_model = model
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Could not load the target-moisture model")
        raise HTTPException(
            status_code=503,
            detail="Target moisture model could not be loaded from its training dataset.",
        ) from error
    return _moisture_model


def _decision(moisture: float, target: float | None) -> tuple[str, str]:
    if target is None:
        return "UNKNOWN", "UNKNOWN"
    if moisture < target:
        return "TOO DRY", "PUMP ON"
    if target <= moisture <= HIGH_THRESHOLD:
        return "OPTIMAL", "PUMP OFF"
    return "TOO WET", "PUMP OFF"


def _json_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _read_timestamp(record: dict[str, Any]) -> str | None:
    timestamp_names = {"timestamp", "datetime", "date time", "recorded at", "date"}
    for name, value in record.items():
        if str(name).strip().casefold() in timestamp_names and value is not None:
            parsed = pd.to_datetime(value, errors="coerce")
            if pd.notna(parsed):
                return parsed.isoformat()
    return None


def _load_upload(filename: str, content: bytes) -> pd.DataFrame:
    extension = Path(filename).suffix.casefold()
    if extension not in {".csv", ".xlsx"}:
        raise HTTPException(status_code=415, detail="Choose a .csv or .xlsx dataset.")
    if not content:
        raise HTTPException(status_code=422, detail="The selected dataset is empty.")
    try:
        frame = (
            pd.read_csv(BytesIO(content))
            if extension == ".csv"
            else pd.read_excel(BytesIO(content), engine="openpyxl")
        )
    except Exception as error:
        logger.info("Dataset parsing failed for %s: %s", filename, error)
        raise HTTPException(
            status_code=422,
            detail="The dataset could not be read. Check that the file is a valid CSV or XLSX.",
        ) from error

    if frame.empty:
        raise HTTPException(status_code=422, detail="The dataset contains no records.")

    canonical_names = {str(column).strip().casefold(): column for column in frame.columns}
    missing = [name for name in REQUIRED_COLUMNS if name.casefold() not in canonical_names]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Dataset upload failed: {missing[0]} column is missing.",
        )

    for column in REQUIRED_COLUMNS:
        original = canonical_names[column.casefold()]
        frame = frame.rename(columns={original: column})
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    if frame.empty:
        raise HTTPException(
            status_code=422,
            detail="The dataset contains no records.",
        )
    for column in REQUIRED_COLUMNS:
        if frame[column].isna().any():
            raise HTTPException(
                status_code=422,
                detail=f"Dataset contains missing or non-numeric values in the {column} column.",
            )
    if not all(
        math.isfinite(float(value))
        for column in REQUIRED_COLUMNS
        for value in frame[column]
    ):
        raise HTTPException(
            status_code=422,
            detail="Moisture, Temperature and Humidity values must be finite numbers.",
        )
    if ((frame["Moisture"] < 0) | (frame["Moisture"] > 100)).any():
        raise HTTPException(
            status_code=422,
            detail="Moisture values must be between 0 and 100.",
        )
    if ((frame["Humidity"] < 0) | (frame["Humidity"] > 100)).any():
        raise HTTPException(
            status_code=422,
            detail="Humidity values must be between 0 and 100.",
        )
    return frame


def _reading(row: sqlite3.Row) -> dict[str, Any]:
    raw_fields = json.loads(row["raw_json"])
    normalized = {
        "id": row["id"],
        "timestamp": row["timestamp"],
        "moisture": row["moisture"],
        "temperature": row["temperature"],
        "humidity": row["humidity"],
        "target_moisture": row["target_moisture"],
        "moisture_status": row["moisture_status"],
        "pump_decision": row["pump_decision"],
        "pump_status": row["pump_status"],
        "source": row["source"],
        "row_number": row["row_number"],
    }
    reserved = {name.casefold() for name in normalized}
    result = {
        name: value
        for name, value in raw_fields.items()
        if name.casefold() not in reserved
    }
    result.update(normalized)
    result["raw_fields"] = raw_fields
    return result


def _active_dataset_id(connection: sqlite3.Connection) -> int | None:
    row = connection.execute(
        "SELECT value FROM settings WHERE key = 'active_dataset_id'"
    ).fetchone()
    return int(row["value"]) if row else None


def _dataset_rows(
    connection: sqlite3.Connection, dataset_id: int, limit: int | None = None
) -> list[sqlite3.Row]:
    query = """
        SELECT * FROM readings
        WHERE dataset_id = ?
        ORDER BY row_number DESC
    """
    parameters: tuple[Any, ...] = (dataset_id,)
    if limit is not None:
        query += " LIMIT ?"
        parameters += (limit,)
    rows = connection.execute(query, parameters).fetchall()
    return list(reversed(rows))


def _analytics(readings: list[sqlite3.Row]) -> dict[str, Any]:
    if not readings:
        return {
            "record_count": 0,
            "average_moisture": None,
            "minimum_moisture": None,
            "maximum_moisture": None,
            "average_temperature": None,
            "average_humidity": None,
            "target_moisture": None,
        }
    moisture = [row["moisture"] for row in readings]
    temperatures = [row["temperature"] for row in readings]
    humidities = [row["humidity"] for row in readings]
    targets = [row["target_moisture"] for row in readings if row["target_moisture"] is not None]
    return {
        "record_count": len(readings),
        "average_moisture": round(sum(moisture) / len(moisture), 2),
        "minimum_moisture": round(min(moisture), 2),
        "maximum_moisture": round(max(moisture), 2),
        "average_temperature": round(sum(temperatures) / len(temperatures), 2),
        "average_humidity": round(sum(humidities) / len(humidities), 2),
        "target_moisture": round(sum(targets) / len(targets), 2) if targets else None,
    }


def _device_status(connection: sqlite3.Connection) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    devices: dict[str, Any] = {}
    rows = connection.execute("SELECT name, status, last_seen FROM devices").fetchall()
    for row in rows:
        last_seen = row["last_seen"]
        connected = False
        if last_seen:
            try:
                age = now - datetime.fromisoformat(last_seen)
                connected = age.total_seconds() <= DEVICE_TIMEOUT_SECONDS
            except (TypeError, ValueError):
                connected = False
        devices[row["name"]] = {
            "status": "connected" if connected and row["status"] == "connected" else "disconnected",
            "last_seen": last_seen,
        }
    devices["python_controller"] = {"status": "connected", "last_seen": _utc_now()}
    return devices


def _monitoring_status(connection: sqlite3.Connection) -> str:
    row = connection.execute(
        "SELECT value FROM settings WHERE key = 'monitoring'"
    ).fetchone()
    return row["value"] if row else "stopped"


def _latest_live(connection: sqlite3.Connection) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM readings WHERE source = 'sensor' ORDER BY id DESC LIMIT 1"
    ).fetchone()


@app.on_event("startup")
def startup() -> None:
    _initialize_database()

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    with _connect() as connection:
        active_id = _active_dataset_id(connection)
        dataset_readings = _dataset_rows(connection, active_id) if active_id else []
        latest_live = _latest_live(connection)
        dataset_metadata = (
            connection.execute(
                "SELECT uploaded_at FROM datasets WHERE id = ?", (active_id,)
            ).fetchone()
            if active_id
            else None
        )
        latest = (
            latest_live
            if latest_live
            and (
                not dataset_metadata
                or latest_live["created_at"] > dataset_metadata["uploaded_at"]
            )
            else None
        )
        source = "sensor" if latest else "dataset" if dataset_readings else None
        if latest is None and dataset_readings:
            latest = dataset_readings[-1]

        history_rows = (
            connection.execute(
                "SELECT * FROM readings WHERE source = 'sensor' ORDER BY id DESC LIMIT 48"
            ).fetchall()
            if source == "sensor"
            else dataset_readings[-48:]
        )
        history = [_reading(row) for row in reversed(history_rows)] if source == "sensor" else [
            _reading(row) for row in history_rows
        ]
        latest_value = _reading(latest) if latest else None
        if latest_value:
            latest_value["difference"] = (
                round(latest_value["moisture"] - latest_value["target_moisture"], 2)
                if latest_value["target_moisture"] is not None
                else None
            )
        comparison: dict[str, float | None] = {}
        if len(history) > 1:
            previous, current = history[-2], history[-1]
            for key in ("moisture", "temperature", "humidity"):
                comparison[f"{key}_change"] = round(current[key] - previous[key], 2)
        else:
            comparison = {
                "moisture_change": None,
                "temperature_change": None,
                "humidity_change": None,
            }
        return {
            "monitoring_status": _monitoring_status(connection),
            "record_count": len(dataset_readings),
            "sensor_record_count": connection.execute(
                "SELECT COUNT(*) FROM readings WHERE source = 'sensor'"
            ).fetchone()[0],
            "source": source,
            "latest_reading": latest_value,
            "history": history,
            "analytics": _analytics(dataset_readings),
            "devices": _device_status(connection),
            "changes": comparison,
            "last_updated": _utc_now(),
        }


@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = Path(file.filename or "").name
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Dataset exceeds the 25 MB upload limit.")
    try:
        frame = _load_upload(filename, content)
    except HTTPException as error:
        _log(f"Dataset upload failed: {error.detail}", "error")
        raise

    canonical_names = {str(column).strip().casefold(): column for column in frame.columns}
    target_column = next(
        (
            canonical_names[name]
            for name in ("target moisture", "dynamic threshold (%)", "dynamic threshold")
            if name in canonical_names
        ),
        None,
    )
    target_values = (
        pd.to_numeric(frame[target_column], errors="coerce")
        if target_column
        else pd.Series(index=frame.index, dtype="float64")
    )
    missing_targets = target_values.isna()
    if target_column is None or missing_targets.any():
        predictions = _get_model().predict(frame[["Temperature", "Humidity"]])
        if target_column is None:
            target_values = pd.Series(predictions, index=frame.index)
        else:
            target_values.loc[missing_targets] = predictions[missing_targets.to_numpy()]
    if not all(math.isfinite(float(value)) for value in target_values):
        raise HTTPException(
            status_code=422,
            detail="Target Moisture must contain finite numeric values.",
        )
    if ((target_values < 0) | (target_values > 100)).any():
        raise HTTPException(
            status_code=422,
            detail="Calculated target moisture must be between 0 and 100.",
        )

    records: list[tuple[Any, ...]] = []
    for row_number, ((_, row), target_value) in enumerate(
        zip(frame.iterrows(), target_values), start=1
    ):
        raw = {str(key): _json_value(value) for key, value in row.items()}
        moisture = float(row["Moisture"])
        temperature = float(row["Temperature"])
        humidity = float(row["Humidity"])
        target = float(target_value)
        status, decision = _decision(moisture, target)
        records.append(
            (
                row_number,
                _read_timestamp(raw),
                moisture,
                temperature,
                humidity,
                target,
                status,
                decision,
                json.dumps(raw, ensure_ascii=False, allow_nan=False),
                _utc_now(),
            )
        )

    with _connect() as connection:
        uploaded_at = _utc_now()
        cursor = connection.execute(
            "INSERT INTO datasets(filename, record_count, uploaded_at) VALUES (?, ?, ?)",
            (filename, len(records), uploaded_at),
        )
        dataset_id = cursor.lastrowid
        connection.executemany(
            """
            INSERT INTO readings(
                dataset_id, source, row_number, timestamp, moisture, temperature,
                humidity, target_moisture, moisture_status, pump_decision,
                pump_status, raw_json, created_at
            ) VALUES (?, 'dataset', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            [(dataset_id, *record) for record in records],
        )
        connection.execute(
            """
            INSERT INTO settings(key, value) VALUES ('active_dataset_id', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (str(dataset_id),),
        )
        connection.execute(
            "INSERT INTO logs(timestamp, event, status) VALUES (?, ?, 'success')",
            (uploaded_at, f"Dataset uploaded: {filename} ({len(records)} records)"),
        )
    
    # Auto-sync uploaded dataset records to Firebase Cloud if configured
    cloud_records = []
    for r in records:
        cloud_records.append({
            "row_number": r[0],
            "timestamp": r[1] or uploaded_at,
            "moisture": r[2],
            "temperature": r[3],
            "humidity": r[4],
            "target_moisture": r[5],
            "moisture_status": r[6],
            "pump_decision": r[7],
            "source": "dataset",
        })
    _sync_bulk_to_firebase(cloud_records)

    return {
        "message": "Dataset processed and synced successfully.",
        "dataset": {"id": dataset_id, "filename": filename, "record_count": len(records)},
        "dashboard": dashboard(),
    }


@app.get("/api/dataset")
def get_dataset(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=500),
) -> dict[str, Any]:
    with _connect() as connection:
        dataset_id = _active_dataset_id(connection)
        if dataset_id is None:
            return {"filename": None, "record_count": 0, "page": page, "page_size": page_size, "records": []}
        metadata = connection.execute(
            "SELECT filename, record_count FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        offset = (page - 1) * page_size
        rows = connection.execute(
            """
            SELECT * FROM readings
            WHERE dataset_id = ?
            ORDER BY row_number DESC
            LIMIT ? OFFSET ?
            """,
            (dataset_id, page_size, offset),
        ).fetchall()
        return {
            "filename": metadata["filename"],
            "record_count": metadata["record_count"],
            "page": page,
            "page_size": page_size,
            "records": [_reading(row) for row in reversed(rows)],
        }


@app.get("/api/dataset/analytics")
def get_analytics() -> dict[str, Any]:
    with _connect() as connection:
        dataset_id = _active_dataset_id(connection)
        if dataset_id is None:
            return _analytics([])
        rows = _dataset_rows(connection, dataset_id)
        return _analytics(rows)


@app.get("/api/dataset/export")
def export_dataset() -> StreamingResponse:
    with _connect() as connection:
        dataset_id = _active_dataset_id(connection)
        if dataset_id is None:
            raise HTTPException(status_code=404, detail="There is no processed dataset to export.")
        metadata = connection.execute(
            "SELECT filename FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        rows = _dataset_rows(connection, dataset_id)
        data = []
        for row in rows:
            reading = _reading(row)
            export_row = reading["raw_fields"].copy()
            export_row.update(
                {
                    "Target Moisture": reading["target_moisture"],
                    "System Status": reading["moisture_status"],
                    "Pump Status": reading["pump_status"] or "Unknown",
                    "Pump Decision": reading["pump_decision"],
                }
            )
            data.append(export_row)
    output = BytesIO()
    pd.DataFrame(data).to_excel(output, index=False, engine="openpyxl")
    output.seek(0)
    safe_name = Path(metadata["filename"]).stem or "monitoring-dataset"
    _log(f"Dataset exported: {metadata['filename']}")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-processed.xlsx"'},
    )


@app.post("/api/monitoring/start")
def start_monitoring() -> dict[str, str]:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO settings(key, value) VALUES ('monitoring', 'running')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """
        )
        connection.execute(
            "INSERT INTO logs(timestamp, event, status) VALUES (?, 'Monitoring started; waiting for device telemetry', 'success')",
            (_utc_now(),),
        )
    return {
        "status": "running",
        "message": "Monitoring is running and waiting for device telemetry.",
    }


@app.post("/api/monitoring/stop")
def stop_monitoring() -> dict[str, str]:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO settings(key, value) VALUES ('monitoring', 'stopped')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """
        )
        connection.execute(
            "INSERT INTO logs(timestamp, event, status) VALUES (?, 'Monitoring stopped', 'success')",
            (_utc_now(),),
        )
    return {"status": "stopped", "message": "Monitoring has stopped."}


@app.get("/api/monitoring/status")
def monitoring_status() -> dict[str, str]:
    with _connect() as connection:
        return {"status": _monitoring_status(connection)}


@app.post("/api/sensor/readings")
def receive_sensor_reading(reading: SensorReading) -> dict[str, Any]:
    with _connect() as connection:
        if _monitoring_status(connection) != "running":
            raise HTTPException(status_code=409, detail="Start monitoring before sending sensor readings.")
    target = reading.target_moisture
    if target is None:
        prediction = _get_model().predict(
            pd.DataFrame(
                [[reading.temperature, reading.humidity]],
                columns=["Temperature", "Humidity"],
            )
        )
        target = float(prediction[0])
    if not math.isfinite(target) or not 0 <= target <= 100:
        raise HTTPException(
            status_code=422,
            detail="Calculated target moisture must be between 0 and 100.",
        )
    status, decision = _decision(reading.moisture, target)
    received_at = _utc_now()
    timestamp = (reading.timestamp or datetime.now(timezone.utc)).isoformat()
    raw = {
        "Moisture": reading.moisture,
        "Temperature": reading.temperature,
        "Humidity": reading.humidity,
        "Target Moisture": target,
    }
    with _connect() as connection:
        previous = connection.execute(
            "SELECT pump_status FROM readings WHERE source = 'sensor' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        connection.execute(
            """
            INSERT INTO readings(
                dataset_id, source, timestamp, moisture, temperature, humidity,
                target_moisture, moisture_status, pump_decision, pump_status,
                raw_json, created_at
            ) VALUES (NULL, 'sensor', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                reading.moisture,
                reading.temperature,
                reading.humidity,
                target,
                status,
                decision,
                reading.pump_status,
                json.dumps(raw, allow_nan=False),
                _utc_now(),
            ),
        )
        connection.execute(
            "UPDATE devices SET status = ?, last_seen = ? WHERE name IN ('esp8266', 'sensor')",
            (reading.sensor_status, received_at),
        )
        connection.execute(
            "INSERT INTO logs(timestamp, event, status) VALUES (?, 'Sensor reading received', 'success')",
            (timestamp,),
        )
        if previous and previous["pump_status"] != reading.pump_status and reading.pump_status:
            connection.execute(
                "INSERT INTO logs(timestamp, event, status) VALUES (?, ?, 'success')",
                (timestamp, f"Pump state changed: {reading.pump_status}"),
            )
    
    # Sync to Cloud (Firebase Realtime DB)
    cloud_payload = {
        "moisture": reading.moisture,
        "temperature": reading.temperature,
        "humidity": reading.humidity,
        "target_moisture": target,
        "moisture_status": status,
        "pump_decision": decision,
        "pump_status": reading.pump_status or "UNKNOWN",
        "sensor_status": reading.sensor_status,
        "timestamp": timestamp,
        "last_updated": received_at,
    }
    _sync_to_firebase(cloud_payload)

    return {"message": "Sensor reading stored.", "dashboard": dashboard()}


@app.post("/api/devices/{device_name}/heartbeat")
def device_heartbeat(device_name: str, heartbeat: DeviceHeartbeat) -> dict[str, str]:
    device = device_name.casefold()
    if device not in {"esp8266", "lcd", "blynk", "sensor"}:
        raise HTTPException(status_code=404, detail="Unknown device.")
    last_seen = _utc_now()
    with _connect() as connection:
        connection.execute(
            "UPDATE devices SET status = ?, last_seen = ? WHERE name = ?",
            (heartbeat.status, last_seen, device),
        )
    return {"device": device, "status": heartbeat.status, "last_seen": last_seen}


@app.get("/api/devices/status")
def devices_status() -> dict[str, Any]:
    with _connect() as connection:
        return _device_status(connection)


@app.get("/api/logs")
def get_logs(limit: int = Query(default=100, ge=1, le=500)) -> dict[str, Any]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT timestamp, event, status FROM logs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return {"logs": [dict(row) for row in rows]}


class CloudConfig(BaseModel):
    firebase_url: str


def _sync_bulk_to_firebase(readings_list: list[dict[str, Any]]) -> bool:
    if not readings_list:
        return True
    firebase_url = os.environ.get("FIREBASE_DATABASE_URL", "").strip()
    if not firebase_url:
        with _connect() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key = 'firebase_url'").fetchone()
            if row and row["value"]:
                firebase_url = row["value"]
    if not firebase_url:
        return False

    history_url = firebase_url.rstrip("/") + "/telemetry/history.json"
    latest_url = firebase_url.rstrip("/") + "/telemetry/latest.json"
    try:
        history_map = {}
        now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
        for idx, item in enumerate(readings_list):
            key = f"record_{now_ts}_{idx:04d}"
            history_map[key] = item

        req_hist = urllib.request.Request(
            history_url,
            data=json.dumps(history_map).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )
        urllib.request.urlopen(req_hist, timeout=15)

        if readings_list:
            req_latest = urllib.request.Request(
                latest_url,
                data=json.dumps(readings_list[-1]).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            urllib.request.urlopen(req_latest, timeout=5)
        return True
    except Exception as exc:
        logger.warning("Firebase bulk sync failed: %s", exc)
        return False


def _sync_to_firebase(reading_dict: dict[str, Any]) -> bool:
    firebase_url = os.environ.get("FIREBASE_DATABASE_URL", "").strip()
    if not firebase_url:
        with _connect() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key = 'firebase_url'").fetchone()
            if row and row["value"]:
                firebase_url = row["value"]
    if not firebase_url:
        return False

    url = firebase_url.rstrip("/") + "/telemetry/latest.json"
    history_url = firebase_url.rstrip("/") + "/telemetry/history.json"
    try:
        # Update latest state
        req_latest = urllib.request.Request(
            url,
            data=json.dumps(reading_dict).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        urllib.request.urlopen(req_latest, timeout=5)

        # Append to history
        req_hist = urllib.request.Request(
            history_url,
            data=json.dumps(reading_dict).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req_hist, timeout=5)
        return True
    except Exception as exc:
        logger.warning("Firebase cloud sync failed: %s", exc)
        return False


@app.get("/api/cloud/config")
def get_cloud_config() -> dict[str, Any]:
    with _connect() as connection:
        row = connection.execute("SELECT value FROM settings WHERE key = 'firebase_url'").fetchone()
        url = row["value"] if row else os.environ.get("FIREBASE_DATABASE_URL", "")
    return {"firebase_url": url, "configured": bool(url)}


@app.post("/api/cloud/config")
def save_cloud_config(config: CloudConfig) -> dict[str, Any]:
    clean_url = config.firebase_url.strip().rstrip("/")
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO settings(key, value) VALUES ('firebase_url', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (clean_url,),
        )
        connection.execute(
            "INSERT INTO logs(timestamp, event, status) VALUES (?, 'Cloud Firebase URL updated', 'success')",
            (_utc_now(),),
        )
    return {"message": "Cloud Firebase URL saved.", "firebase_url": clean_url}


@app.post("/api/cloud/sync")
def sync_latest_to_cloud() -> dict[str, Any]:
    dash = dashboard()
    if not dash.get("latest_reading"):
        raise HTTPException(status_code=404, detail="No sensor telemetry available to sync to cloud.")
    
    reading = dash["latest_reading"]
    payload = {
        "moisture": reading["moisture"],
        "temperature": reading["temperature"],
        "humidity": reading["humidity"],
        "target_moisture": reading["target_moisture"],
        "moisture_status": reading["moisture_status"],
        "pump_decision": reading["pump_decision"],
        "pump_status": reading.get("pump_status") or "UNKNOWN",
        "timestamp": reading["timestamp"],
        "last_updated": _utc_now(),
    }
    success = _sync_to_firebase(payload)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to sync to Firebase Cloud. Please check your Database URL.")
    return {"message": "Successfully synced latest reading to Firebase Cloud!", "payload": payload}


@app.post("/api/cloud/sync/all")
def sync_all_to_cloud() -> dict[str, Any]:
    with _connect() as connection:
        rows = connection.execute("SELECT * FROM readings ORDER BY id ASC").fetchall()
    
    if not rows:
        raise HTTPException(status_code=404, detail="No historical readings found in database to sync.")

    records = []
    for r in rows:
        reading_dict = _reading(r)
        records.append({
            "id": reading_dict["id"],
            "timestamp": reading_dict["timestamp"] or reading_dict.get("created_at"),
            "moisture": reading_dict["moisture"],
            "temperature": reading_dict["temperature"],
            "humidity": reading_dict["humidity"],
            "target_moisture": reading_dict["target_moisture"],
            "moisture_status": reading_dict["moisture_status"],
            "pump_decision": reading_dict["pump_decision"],
            "pump_status": reading_dict.get("pump_status") or "UNKNOWN",
            "source": reading_dict["source"],
        })
    
    success = _sync_bulk_to_firebase(records)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to sync records to Firebase Cloud. Verify your Firebase Database URL.")
    
    return {"message": f"Successfully synced all {len(records)} historical records to Firebase Cloud!", "count": len(records)}


_initialize_database()


