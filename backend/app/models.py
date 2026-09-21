from typing import Any

from pydantic import BaseModel


class Point(BaseModel):
    timestamp: int
    value: float | None


class SeriesStats(BaseModel):
    latest: float | None
    average: float | None
    minimum: float | None
    maximum: float | None
    p95: float | None
    points: int


class TimeSeries(BaseModel):
    monitor_id: str
    monitor_name: str
    points: list[Point]
    stats: SeriesStats


class TimeSeriesResponse(BaseModel):
    metric: str
    unit: str
    interval: str
    start: str
    end: str
    total_points: int
    series: list[TimeSeries]


class MeasurementMapping(BaseModel):
    column: str
    label: str
    unit: str = ""


class ImportConfig(BaseModel):
    upload_id: str
    dataset_name: str
    source_filename: str | None = None
    sheet: str | None = None
    date_column: str | None = None
    time_column: str | None = None
    day_first: bool = True
    measurements: list[MeasurementMapping]


class StatisticalTestRequest(BaseModel):
    dataset_id: str
    test: str
    columns: list[str]
    group_column: str | None = None
    groups: list[str] | None = None
    hypothesized_mean: float = 0
    alpha: float = 0.05


class CollocationMember(BaseModel):
    upload_id: str
    filename: str
    sheet: str | None = None
    sensor_name: str
    date_column: str
    time_column: str | None = None
    measurement_column: str
    source_unit: str = ""
    temperature_column: str | None = None
    humidity_column: str | None = None
    day_first: bool = True


class CollocationQualityGates(BaseModel):
    completeness: float = 80.0
    ccc: float = 0.9
    nrmse: float = 20.0
    relative_bias: float = 10.0
    slope_min: float = 0.85
    slope_max: float = 1.15


class CollocationAnalysisRequest(BaseModel):
    study_name: str = "Untitled collocation"
    parameter_name: str
    unit: str = ""
    resolution: str = "1min"
    minimum_bin_coverage: float = 75.0
    max_lag_minutes: int = 10
    apply_suggested_lag: bool = False
    members: list[CollocationMember]
    quality_gates: CollocationQualityGates = CollocationQualityGates()


class CollocationSessionCreate(BaseModel):
    label: str
    role: str = "baseline"
    environment: str = "unspecified"
    result: dict[str, Any]
