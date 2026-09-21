from datetime import datetime, timedelta

import pandas as pd
import pytest
from app.collocation_service import _convert_unit
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def _sensor_csv(offset: float, scale: float = 1.0) -> bytes:
    start = datetime(2026, 1, 1, 0, 0)
    rows = ["observed_at,response,temp_c"]
    for index in range(180):
        timestamp = start + timedelta(minutes=index)
        shared_signal = 40 + (index % 45) * 0.4 + (index // 45) * 2
        value = offset + scale * shared_signal
        rows.append(f"{timestamp.isoformat()},{value:.3f},{20 + (index % 12) * 0.1:.1f}")
    return "\n".join(rows).encode()


def test_generic_collocation_reads_selected_columns_and_returns_corrections() -> None:
    uploads = []
    for index, (offset, scale) in enumerate(((0, 1), (2, 1.05), (-1, 0.96)), start=1):
        response = client.post(
            "/api/import/inspect",
            files={"file": (f"device-{index}.csv", _sensor_csv(offset, scale), "text/csv")},
        )
        assert response.status_code == 200
        inspection = response.json()
        assert {column["name"] for column in inspection["columns"]} == {
            "observed_at",
            "response",
            "temp_c",
        }
        uploads.append(inspection)

    response = client.post(
        "/api/collocation/analyze",
        json={
            "study_name": "Generic response study",
            "parameter_name": "Custom gas response",
            "unit": "ppb",
            "resolution": "1min",
            "members": [
                {
                    "upload_id": inspection["upload_id"],
                    "filename": f"anything-{index}.csv",
                    "sensor_name": f"Sensor {index}",
                    "date_column": "observed_at",
                    "measurement_column": "response",
                    "temperature_column": "temp_c",
                }
                for index, inspection in enumerate(uploads, start=1)
            ],
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["study"]["parameter"] == "Custom gas response"
    assert result["summary"]["sensor_count"] == 3
    assert result["summary"]["paired_bins"] == 180
    assert len(result["sensors"]) == 3
    assert len(result["corrections"]) == 3
    assert all(item["ccc"] > 0.6 for item in result["sensors"])
    assert all(item["temperature_residual_correlation"] is not None for item in result["sensors"])
    assert all(item["validation_folds"] == 5 for item in result["corrections"])
    assert result["summary"]["icc_single"] is not None


def test_ensemble_collocation_requires_three_sensors() -> None:
    response = client.post(
        "/api/collocation/analyze",
        json={"parameter_name": "Any response", "members": []},
    )
    assert response.status_code == 400
    assert "at least three" in response.json()["detail"]


def test_safe_unit_conversion_is_generic_and_rejects_ambiguous_gas_mass_conversion() -> None:
    values = pd.Series([1.0, 2.0])
    assert _convert_unit(values, "ppm", "ppb").tolist() == [1000.0, 2000.0]
    assert _convert_unit(values, "mg/m³", "µg/m³").tolist() == [1000.0, 2000.0]
    assert _convert_unit(pd.Series([32.0]), "°F", "°C").iloc[0] == pytest.approx(0.0)
    with pytest.raises(ValueError, match="Cannot safely convert"):
        _convert_unit(values, "ppm", "µg/m³")
