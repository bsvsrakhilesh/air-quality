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
