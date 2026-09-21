export interface Metric {
  id: string
  label: string
  unit: string
  decimals: number
}

export interface Monitor {
  id: string
  name: string
  filename: string
  rows: number
  start: string | null
  end: string | null
  invalid_rows: number
  metrics: string[]
  imported?: boolean
}

export interface Catalog {
  monitors: Monitor[]
  metrics: Metric[]
  intervals: string[]
  range: { start: string | null; end: string | null }
  total_rows: number
  invalid_rows: number
  updated_at: string
}

export interface SeriesStats {
  latest: number | null
  average: number | null
  minimum: number | null
  maximum: number | null
  p95: number | null
  points: number
}

export interface TimeSeries {
  monitor_id: string
  monitor_name: string
  points: Array<{ timestamp: number; value: number | null }>
  stats: SeriesStats
}

export interface TimeSeriesResponse {
  metric: string
  unit: string
  interval: string
  start: string
  end: string
  total_points: number
  series: TimeSeries[]
}

export interface ColumnProfile {
  name: string
  type: 'number' | 'date/time' | 'text' | 'empty'
  sample: string[]
  nulls_in_sample: number
}

export interface ImportInspection {
  upload_id: string
  filename: string
  size: number
  sheets: string[]
  selected_sheet: string | null
  columns: ColumnProfile[]
  sample_rows: number
  suggestions: {
    date_column: string | null
    time_column: string | null
    measurements: string[]
  }
}

export interface ImportedDataset {
  id: string
  name: string
  rows: number
  invalid_rows: number
  start: string | null
  end: string | null
  has_time?: boolean
  columns?: Array<{ name: string; type: string }>
  metrics: Array<{
    id: string
    label: string
    unit: string
    source_column: string
  }>
}

export interface StatColumnProfile {
  name: string
  type: 'numeric' | 'datetime' | 'categorical' | 'boolean' | 'text'
  count: number
  missing: number
  missing_percent: number
  unique: number
  mean?: number | null
  median?: number | null
  mode?: Array<number | null>
  std?: number | null
  variance?: number | null
  minimum?: number | string | null
  q1?: number | null
  q3?: number | null
  maximum?: number | string | null
  range?: number | null
  iqr?: number | null
  mad?: number | null
  cv?: number | null
  skewness?: number | null
  kurtosis?: number | null
  sem?: number | null
  ci95_low?: number | null
  ci95_high?: number | null
  top_values?: Array<{ value: string; count: number; percent: number }>
}

export interface StatisticalProfile {
  dataset: { id: string; name: string }
  rows: number
  columns: number
  duplicate_rows: number
  missing_cells: number
  completeness: number
  memory_bytes: number
  type_counts: { numeric: number; categorical: number; datetime: number }
  column_profiles: StatColumnProfile[]
}

export interface DistributionResult {
  column: string
  count: number
  histogram: { counts: number[]; edges: Array<number | null> }
  boxplot: {
    minimum: number
    q1: number
    median: number
    q3: number
    maximum: number
    lower_fence: number
    upper_fence: number
    outliers: number
  }
  qq_plot: Array<[number, number]>
  normality_tests: Array<{ name: string; statistic: number; p_value: number }>
  likely_normal: boolean
}

export interface CorrelationResult {
  method: string
  columns: string[]
  values: Array<Array<number | null>>
  p_values: Array<Array<number | null>>
  sample_sizes: number[][]
}

export interface StatisticalTestResult {
  name: string
  statistic_label: string
  statistic: number | null
  p_value: number | null
  df: number | null
  effect_size: number | null
  effect_name: string | null
  null_hypothesis: string
  alpha: number
  significant: boolean
  interpretation: string
  caution: string
  [key: string]: unknown
}

export interface TimeDiagnosticsResult {
  count: number
  start: string
  end: string
  median_interval_seconds: number
  trend_per_day: number
  trend_p_value: number
  r_squared: number
  lags: number[]
  autocorrelation: Array<number | null>
}
