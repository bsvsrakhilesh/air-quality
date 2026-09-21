import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  analyzeCollocation,
  getCollocationSessions,
  getDriftComparison,
  inspectSheet,
  inspectUpload,
  saveCollocationSession,
} from '../api'
import type {
  CollocationQualityGates,
  CollocationResult,
  DriftComparison,
  ImportInspection,
  SavedCollocationSession,
} from '../types'
import { CollocationChart } from './CollocationChart'

interface SensorFile {
  key: string
  inspection: ImportInspection
  sensorName: string
  dateColumn: string
  timeColumn: string
  measurementColumn: string
  sourceUnit: string
  temperatureColumn: string
  humidityColumn: string
  dayFirst: boolean
}

const DEFAULT_GATES: CollocationQualityGates = {
  completeness: 80,
  ccc: 0.9,
  nrmse: 20,
  relative_bias: 10,
  slope_min: 0.85,
  slope_max: 1.15,
}

function cleanName(filename: string) {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase())
}

function recommendedColumn(inspection: ImportInspection) {
  return inspection.suggestions.measurements[0] ?? inspection.columns.find((column) => column.type === 'number')?.name ?? ''
}

function resultCsv(result: CollocationResult) {
  const sensors = result.pairwise.sensors
  const rows = [`timestamp,consensus,${sensors.map((name) => `"${name.replaceAll('"', '""')}"`).join(',')}`]
  result.series.forEach((point) => rows.push([
    new Date(point.timestamp).toISOString(),
    point.consensus ?? '',
    ...sensors.map((sensor) => point.values[sensor] ?? ''),
  ].join(',')))
  return rows.join('\n')
}

function correctedCsv(result: CollocationResult, approved: Set<string>) {
  const sensors = result.pairwise.sensors.filter((sensor) => approved.has(sensor))
  const headers = sensors.flatMap((sensor) => [`${sensor} raw`, `${sensor} corrected`])
  const rows = [`timestamp,consensus,${headers.map((name) => `"${name.replaceAll('"', '""')}"`).join(',')}`]
  result.series.forEach((point) => rows.push([
    new Date(point.timestamp).toISOString(),
    point.consensus ?? '',
    ...sensors.flatMap((sensor) => [point.values[sensor] ?? '', point.corrected[sensor] ?? '']),
  ].join(',')))
  return rows.join('\n')
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="collocation-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

export function CollocationWorkspace() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<SensorFile[]>([])
  const [studyName, setStudyName] = useState('New collocation study')
  const [parameter, setParameter] = useState('')
  const [unit, setUnit] = useState('')
  const [resolution, setResolution] = useState('1min')
  const [sessionRole, setSessionRole] = useState<'baseline' | 'follow_up' | 'post_deployment'>('baseline')
  const [sessionLabel, setSessionLabel] = useState('Baseline')
  const [environment, setEnvironment] = useState('Indoor')
  const [baselineId, setBaselineId] = useState('')
  const [savedSessions, setSavedSessions] = useState<SavedCollocationSession[]>([])
  const [gates, setGates] = useState(DEFAULT_GATES)
  const [advanced, setAdvanced] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(0)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CollocationResult | null>(null)
  const [alignmentReview, setAlignmentReview] = useState<CollocationResult | null>(null)
  const [resultTab, setResultTab] = useState<'overview' | 'agreement' | 'corrections' | 'drift'>('overview')
  const [drift, setDrift] = useState<DriftComparison | null>(null)
  const [approvedCorrections, setApprovedCorrections] = useState<Set<string>>(new Set())

  const completeFiles = files.filter((file) => file.dateColumn && file.measurementColumn && file.sensorName.trim())
  const ready = completeFiles.length >= 3 && Boolean(parameter.trim()) && !running
  const mappedMeasurementNames = useMemo(() => new Set(files.map((file) => file.measurementColumn).filter(Boolean)).size, [files])
  const compatibleBaselines = savedSessions.filter((session) => session.role === 'baseline' && (!parameter || session.parameter === parameter))

  useEffect(() => {
    const controller = new AbortController()
    getCollocationSessions(controller.signal).then(setSavedSessions).catch(() => undefined)
    return () => controller.abort()
  }, [])

  const addFiles = async (incoming: FileList | File[]) => {
    const selected = Array.from(incoming)
    if (!selected.length) return
    setError(null)
    setLoadingFiles((count) => count + selected.length)
    const settled = await Promise.allSettled(selected.map(async (file, index) => {
      const inspection = await inspectUpload(file)
      return {
        key: `${inspection.upload_id}-${index}`,
        inspection,
        sensorName: cleanName(file.name),
        dateColumn: inspection.suggestions.date_column ?? '',
        timeColumn: inspection.suggestions.time_column ?? '',
        measurementColumn: recommendedColumn(inspection),
        sourceUnit: '',
        temperatureColumn: '',
        humidityColumn: '',
        dayFirst: true,
      } satisfies SensorFile
    }))
    const added = settled.flatMap((item) => item.status === 'fulfilled' ? [item.value] : [])
    const failures = settled.flatMap((item) => item.status === 'rejected' ? [item.reason] : [])
    setFiles((current) => [...current, ...added])
    if (!parameter && added[0]?.measurementColumn) setParameter(added[0].measurementColumn)
    if (failures.length) setError(failures[0] instanceof Error ? failures[0].message : 'One or more files could not be inspected')
    setLoadingFiles((count) => count - selected.length)
  }

  const updateFile = (key: string, change: Partial<SensorFile>) => {
    setFiles((current) => current.map((file) => file.key === key ? { ...file, ...change } : file))
  }

  const changeSheet = async (file: SensorFile, sheet: string) => {
    setLoadingFiles((count) => count + 1)
    setError(null)
    try {
      const inspection = await inspectSheet(file.inspection.upload_id, sheet)
      updateFile(file.key, {
        inspection: { ...inspection, filename: file.inspection.filename, size: file.inspection.size },
        dateColumn: inspection.suggestions.date_column ?? '',
        timeColumn: inspection.suggestions.time_column ?? '',
        measurementColumn: recommendedColumn(inspection),
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The worksheet could not be read')
    } finally {
      setLoadingFiles((count) => count - 1)
    }
  }

  const acceptResult = (response: CollocationResult) => {
    setResult(response)
    setAlignmentReview(null)
    setApprovedCorrections(new Set())
    setSavedId(null)
    setDrift(null)
    setResultTab('overview')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const run = async (applySuggestedLag = false) => {
    if (!ready) return
    setRunning(true)
    setError(null)
    try {
      const response = await analyzeCollocation({
        study_name: studyName.trim(),
        parameter_name: parameter.trim(),
        unit: unit.trim(),
        resolution,
        minimum_bin_coverage: 75,
        max_lag_minutes: 10,
        apply_suggested_lag: applySuggestedLag,
        members: completeFiles.map((file) => ({
          upload_id: file.inspection.upload_id,
          filename: file.inspection.filename,
          sheet: file.inspection.selected_sheet,
          sensor_name: file.sensorName.trim(),
          date_column: file.dateColumn,
          time_column: file.timeColumn || null,
          measurement_column: file.measurementColumn,
          source_unit: file.sourceUnit,
          temperature_column: file.temperatureColumn || null,
          humidity_column: file.humidityColumn || null,
          day_first: file.dayFirst,
        })),
        quality_gates: gates,
      })
      const hasSuggestedShift = response.alignments.some((item) => item.suggested_lag_minutes !== 0)
      if (!applySuggestedLag && hasSuggestedShift) setAlignmentReview(response)
      else acceptResult(response)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The collocation analysis could not be completed')
    } finally {
      setRunning(false)
    }
  }

  const saveResult = async () => {
    if (!result || savedId) return
    setSaving(true)
    setError(null)
    try {
      const saved = await saveCollocationSession({
        label: sessionLabel.trim() || 'Collocation session',
        role: sessionRole,
        environment,
        result,
      })
      setSavedId(saved.id)
      setSavedSessions((current) => [saved, ...current])
      if (sessionRole !== 'baseline' && baselineId) {
        const comparison = await getDriftComparison(baselineId, saved.id)
        setDrift(comparison)
        setResultTab('drift')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The collocation session could not be saved')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    const statusReady = result.summary.status === 'Ready'
    return (
      <div className="collocation-workspace result-mode">
        <section className="collocation-result-head">
          <div>
            <button className="text-action" type="button" onClick={() => setResult(null)}><RotateCcw size={13} /> Edit setup</button>
            <div className="eyebrow"><FlaskConical size={14} /> Collocation report</div>
            <h1>{result.study.name}</h1>
            <p>{result.study.parameter}{result.study.unit ? ` · ${result.study.unit}` : ''} · {new Date(result.summary.start).toLocaleDateString()} – {new Date(result.summary.end).toLocaleDateString()}</p>
          </div>
          <div className="heading-actions">
            <button className="button secondary" type="button" onClick={() => downloadFile('collocation-aligned.csv', resultCsv(result), 'text/csv')}><Download size={15} /> Export data</button>
            <button className="button secondary" type="button" onClick={() => window.print()}><FileSpreadsheet size={15} /> PDF report</button>
            <button className="button primary" type="button" onClick={saveResult} disabled={saving || Boolean(savedId)}>{saving ? <LoaderCircle className="spin" size={15} /> : savedId ? <Check size={15} /> : <ShieldCheck size={15} />} {savedId ? 'Session saved' : `Save ${sessionRole === 'baseline' ? 'baseline' : 'session'}`}</button>
          </div>
        </section>

        <section className={`readiness-banner ${statusReady ? 'ready' : 'review'}`}>
          <span className="readiness-icon">{statusReady ? <BadgeCheck size={22} /> : <AlertCircle size={22} />}</span>
          <div><strong>{statusReady ? 'Fleet is ready for deployment' : 'Review recommended before deployment'}</strong><p>{result.summary.ready_sensors} of {result.summary.sensor_count} sensors meet every configured quality gate.</p></div>
          <span className="readiness-score">{result.summary.ready_sensors}/{result.summary.sensor_count}</span>
        </section>

        <div className="result-nav" role="tablist">
          {(['overview', 'agreement', 'corrections'] as const).map((tab) => <button key={tab} className={resultTab === tab ? 'active' : ''} onClick={() => setResultTab(tab)} type="button">{tab === 'overview' ? 'Executive overview' : tab[0].toUpperCase() + tab.slice(1)}</button>)}
          {drift && <button className={resultTab === 'drift' ? 'active' : ''} onClick={() => setResultTab('drift')} type="button">Drift since baseline</button>}
        </div>

        {resultTab === 'overview' && <>
          <section className="collocation-metric-grid">
            <Metric label="Fleet concordance" value={result.summary.fleet_ccc?.toFixed(3) ?? '—'} note="Median Lin’s CCC" />
            <Metric label="Absolute reliability" value={result.summary.icc_single?.toFixed(3) ?? '—'} note="ICC(A,1), single sensor" />
            <Metric label="Completeness" value={`${result.summary.median_completeness.toFixed(1)}%`} note="Median paired availability" />
            <Metric label="Overlap" value={`${result.summary.duration_hours.toFixed(1)} h`} note={`${result.summary.paired_bins.toLocaleString()} aligned bins`} />
            <Metric label="Fleet variability" value={result.summary.median_fleet_cv == null ? '—' : `${result.summary.median_fleet_cv.toFixed(1)}%`} note={`Median CV · ${result.summary.resolution.replace('min', ' min')}`} />
          </section>
          <section className="collocation-panel chart-panel">
            <div className="panel-heading"><div><span>Aligned response</span><h2>Sensors against fleet consensus</h2><p>The dark line is the median fleet signal; hover to inspect synchronized values.</p></div><span className="method-pill">Leave-one-out consensus</span></div>
            <CollocationChart result={result} />
          </section>
          <section className="collocation-panel">
            <div className="panel-heading"><div><span>Decision summary</span><h2>Sensor readiness</h2><p>Every outcome is evaluated against your configured acceptance criteria.</p></div></div>
            <SensorTable result={result} />
          </section>
          <section className="science-note"><Info size={16} /><div><strong>Interpret these results as relative agreement</strong><p>{result.warnings.join(' ')}</p></div></section>
        </>}

        {resultTab === 'agreement' && <div className="agreement-layout">
          <section className="collocation-panel">
            <div className="panel-heading"><div><span>Pairwise Pearson r</span><h2>Agreement matrix</h2><p>Quickly locate sensor pairs that move differently.</p></div></div>
            <div className="pairwise-wrap"><table className="pairwise-table"><thead><tr><th></th>{result.pairwise.sensors.map((sensor) => <th key={sensor}>{sensor}</th>)}</tr></thead><tbody>{result.pairwise.sensors.map((sensor, row) => <tr key={sensor}><th>{sensor}</th>{result.pairwise.values[row].map((value, column) => <td key={column} style={{ background: value == null ? '#f3f4f3' : `rgba(23,107,82,${Math.max(.06, value * .88)})`, color: value != null && value > .62 ? 'white' : '#34403a' }}>{value?.toFixed(2) ?? '—'}</td>)}</tr>)}</tbody></table></div>
          </section>
          <section className="collocation-panel">
            <div className="panel-heading"><div><span>Clock diagnostics</span><h2>Alignment suggestions</h2><p>Estimated from changes in the shared fleet signal.</p></div></div>
            <div className="alignment-list">{result.alignments.map((item) => <div key={item.sensor}><span className={item.status === 'Aligned' ? 'ok-dot' : 'review-dot'} /><strong>{item.sensor}</strong><span>{item.suggested_lag_minutes === 0 ? 'No shift suggested' : `${item.suggested_lag_minutes > 0 ? '+' : ''}${item.suggested_lag_minutes} min`}</span><small>r {item.correlation?.toFixed(3) ?? '—'}</small></div>)}</div>
          </section>
          <section className="collocation-panel full-span"><SensorTable result={result} detailed /></section>
        </div>}

        {resultTab === 'corrections' && <section className="collocation-panel">
          <div className="panel-heading"><div><span>Correction candidates</span><h2>Validated harmonization profiles</h2><p>The simplest adequate model is chosen with contiguous time-block validation. Review each profile before export.</p></div>{approvedCorrections.size > 0 ? <button className="button primary compact-button" type="button" onClick={() => downloadFile('collocation-corrected.csv', correctedCsv(result, approvedCorrections), 'text/csv')}><Download size={13} /> Export {approvedCorrections.size} approved</button> : <span className="method-pill">Proposed · approval required</span>}</div>
          <div className="correction-list">{result.corrections.map((item) => { const approved = approvedCorrections.has(item.sensor); return <article className={approved ? 'approved' : ''} key={item.sensor}><div className="correction-title"><span>{approved ? <Check size={15} /> : <Sparkles size={15} />}</span><div><strong>{item.sensor}</strong><small>{item.model} · {item.validation_folds}-fold blocked validation</small></div><b>{item.improvement_percent.toFixed(1)}% <em>RMSE reduction</em></b></div><code>{item.formula}</code><div className="correction-stats"><span>Raw RMSE <strong>{item.raw_rmse}</strong></span><ArrowRight size={13} /><span>Corrected RMSE <strong>{item.corrected_rmse}</strong></span></div><button type="button" onClick={() => setApprovedCorrections((current) => { const next = new Set(current); if (approved) next.delete(item.sensor); else next.add(item.sensor); return next })}>{approved ? 'Approved · click to withdraw' : 'Review and approve profile'}</button></article> })}</div>
          <div className="science-note compact"><ShieldCheck size={16} /><div><strong>Raw observations remain immutable</strong><p>Corrections are represented as versioned derived values; exporting this report does not overwrite source data.</p></div></div>
        </section>}
        {resultTab === 'drift' && drift && <section className="collocation-panel drift-panel">
          <div className="panel-heading"><div><span>Longitudinal comparison</span><h2>{drift.baseline.label} → {drift.follow_up.label}</h2><p>{drift.parameter}{drift.unit ? ` · ${drift.unit}` : ''} · matched by sensor name and evaluated against fixed drift thresholds.</p></div><span className={`drift-overall ${drift.status.toLowerCase().replace(' ', '-')}`}>{drift.status}</span></div>
          <div className="drift-session-strip"><div><span>Baseline</span><strong>{new Date(drift.baseline.created_at).toLocaleDateString()}</strong><small>{drift.baseline.environment}</small></div><ArrowRight size={16} /><div><span>Follow-up</span><strong>{new Date(drift.follow_up.created_at).toLocaleDateString()}</strong><small>{drift.follow_up.environment}</small></div></div>
          <div className="table-wrap"><table className="drift-table"><thead><tr><th>Sensor</th><th>Assessment</th><th>Relative-bias change</th><th>Slope change</th><th>NRMSE change</th><th>CCC change</th></tr></thead><tbody>{drift.sensors.map((sensor) => <tr key={sensor.sensor}><td><strong>{sensor.sensor}</strong></td><td><span className={`drift-chip ${sensor.status.toLowerCase().replace(' ', '-')}`}>{sensor.status}</span></td><td>{sensor.relative_bias_change == null ? '—' : `${sensor.relative_bias_change > 0 ? '+' : ''}${sensor.relative_bias_change.toFixed(1)} pp`}</td><td>{sensor.slope_change_percent == null ? '—' : `${sensor.slope_change_percent > 0 ? '+' : ''}${sensor.slope_change_percent.toFixed(1)}%`}</td><td>{sensor.nrmse_change == null ? '—' : `${sensor.nrmse_change > 0 ? '+' : ''}${sensor.nrmse_change.toFixed(1)} pp`}</td><td>{sensor.ccc_change == null ? '—' : `${sensor.ccc_change > 0 ? '+' : ''}${sensor.ccc_change.toFixed(3)}`}</td></tr>)}</tbody></table></div>
          <div className="science-note compact"><Info size={16} /><div><strong>Drift decisions use change from the saved baseline</strong><p>Signal if relative bias changes by at least 10 percentage points, slope changes by at least 15%, or follow-up NRMSE exceeds 20%. Review common-mode changes against an independent reference when available.</p></div></div>
        </section>}
      </div>
    )
  }

  return (
    <div className="collocation-workspace">
      <section className="collocation-hero">
        <div>
          <div className="eyebrow"><FlaskConical size={14} /> Sensor quality</div>
          <h1>Collocation & drift</h1>
          <p>Align any sensor fleet, quantify agreement, and build defensible correction profiles—without reshaping your source files.</p>
        </div>
        <div className="protocol-badge"><ShieldCheck size={16} /><span><strong>Consensus mode</strong><small>Reference-free · 3+ sensors</small></span></div>
      </section>

      <ol className="workflow-steps" aria-label="Analysis progress">
        <li className="active"><span>1</span><div><strong>Upload & map</strong><small>Current step</small></div></li>
        <li className={files.length >= 3 ? 'available' : ''}><span>2</span><div><strong>Alignment & QC</strong><small>Automatic diagnostics</small></div></li>
        <li><span>3</span><div><strong>Agreement</strong><small>Evidence & gates</small></div></li>
        <li><span>4</span><div><strong>Corrections</strong><small>Review & export</small></div></li>
      </ol>

      {error && <div className="error-banner" role="alert"><AlertCircle size={15} /> {error}</div>}

      <div className="collocation-setup-grid">
        <main className="setup-main">
          <section className="collocation-panel upload-panel">
            <div className="panel-heading"><div><span>Step 1</span><h2>Add sensor files</h2><p>Upload one file per sensor. Axiom reads headers and samples before anything is analyzed.</p></div><b>{files.length} files</b></div>
            <input ref={fileInput} hidden multiple type="file" accept=".csv,.tsv,.txt,.json,.xlsx,.xls" onChange={(event) => event.target.files && addFiles(event.target.files)} />
            {files.length === 0 ? <button className={`collocation-drop ${dragging ? 'dragging' : ''}`} type="button" onClick={() => fileInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}>
              <span><UploadCloud size={24} /></span><strong>{loadingFiles ? 'Reading column names…' : 'Drop all sensor files here'}</strong><p>or click to browse · CSV, text, JSON and Excel · 100 MB each</p><small>Files may use different column names and sampling intervals.</small>
            </button> : <>
              <div className="sensor-map-list">{files.map((file, index) => <SensorMapping key={file.key} file={file} index={index} onChange={(change) => updateFile(file.key, change)} onSheet={(sheet) => changeSheet(file, sheet)} onRemove={() => setFiles((current) => current.filter((item) => item.key !== file.key))} />)}</div>
              <button className="add-sensor-button" type="button" onClick={() => fileInput.current?.click()}><Plus size={15} /> Add more sensor files</button>
            </>}
            {loadingFiles > 0 && <div className="inline-loading"><LoaderCircle className="spin" size={15} /> Inspecting {loadingFiles} {loadingFiles === 1 ? 'file' : 'files'}…</div>}
          </section>
        </main>

        <aside className="study-sidebar">
          <section className="collocation-panel study-card">
            <div className="panel-heading"><div><span>Study setup</span><h2>Analysis definition</h2></div></div>
            <label className="field"><span>Study name</span><input className="control" value={studyName} onChange={(event) => setStudyName(event.target.value)} /></label>
            <div className="side-fields"><label className="field"><span>Parameter name</span><input className="control" value={parameter} onChange={(event) => setParameter(event.target.value)} placeholder="e.g. CO₂, NO₂, temperature" /></label><label className="field unit-field"><span>Unit</span><input className="control" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="ppm" /></label></div>
            <label className="field"><span>Analysis resolution</span><select className="control" value={resolution} onChange={(event) => setResolution(event.target.value)}><option value="1min">1-minute mean</option><option value="5min">5-minute mean</option><option value="15min">15-minute mean</option><option value="1h">1-hour mean</option></select></label>
            <div className="side-fields session-fields"><label className="field"><span>Session role</span><select className="control" value={sessionRole} onChange={(event) => { const role = event.target.value as typeof sessionRole; setSessionRole(role); setSessionLabel(role === 'baseline' ? 'Baseline' : role === 'follow_up' ? '60-day follow-up' : 'Post-deployment') }}><option value="baseline">Baseline</option><option value="follow_up">Follow-up</option><option value="post_deployment">Post-deployment</option></select></label><label className="field"><span>Environment</span><select className="control" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option>Indoor</option><option>Outdoor</option><option>Laboratory</option><option>Mixed</option></select></label></div>
            <label className="field"><span>Session label</span><input className="control" value={sessionLabel} onChange={(event) => setSessionLabel(event.target.value)} /></label>
            {sessionRole !== 'baseline' && <label className="field"><span>Compare with baseline</span><select className="control" value={baselineId} onChange={(event) => setBaselineId(event.target.value)}><option value="">Save without comparison</option>{compatibleBaselines.map((session) => <option value={session.id} key={session.id}>{session.label} · {session.parameter} · {new Date(session.created_at).toLocaleDateString()}</option>)}</select></label>}
            <button className="advanced-toggle" type="button" onClick={() => setAdvanced(!advanced)}><Settings2 size={14} /> Quality gates <ChevronDown className={advanced ? 'open' : ''} size={14} /></button>
            {advanced && <div className="gate-grid"><GateInput label="Completeness ≥" value={gates.completeness} suffix="%" onChange={(value) => setGates({ ...gates, completeness: value })} /><GateInput label="CCC ≥" value={gates.ccc} step="0.01" onChange={(value) => setGates({ ...gates, ccc: value })} /><GateInput label="NRMSE ≤" value={gates.nrmse} suffix="%" onChange={(value) => setGates({ ...gates, nrmse: value })} /><GateInput label="Abs. bias ≤" value={gates.relative_bias} suffix="%" onChange={(value) => setGates({ ...gates, relative_bias: value })} /><GateInput label="Slope min" value={gates.slope_min} step="0.01" onChange={(value) => setGates({ ...gates, slope_min: value })} /><GateInput label="Slope max" value={gates.slope_max} step="0.01" onChange={(value) => setGates({ ...gates, slope_max: value })} /></div>}
            <div className="readiness-checks">
              <div className={files.length >= 3 ? 'done' : ''}><span>{files.length >= 3 ? <Check size={11} /> : files.length}</span><p><strong>Three or more sensors</strong><small>Required for independent peer consensus</small></p></div>
              <div className={completeFiles.length === files.length && files.length > 0 ? 'done' : ''}><span>{completeFiles.length === files.length && files.length > 0 ? <Check size={11} /> : completeFiles.length}</span><p><strong>Mappings complete</strong><small>{files.length ? `${completeFiles.length} of ${files.length} ready` : 'Waiting for files'}</small></p></div>
              <div className={parameter.trim() ? 'done' : ''}><span>{parameter.trim() ? <Check size={11} /> : '–'}</span><p><strong>Parameter defined</strong><small>{mappedMeasurementNames > 1 ? 'Different source columns mapped' : 'One shared analysis parameter'}</small></p></div>
            </div>
            <button className="run-collocation" type="button" disabled={!ready} onClick={() => run(false)}>{running ? <><LoaderCircle className="spin" size={16} /> Running analysis…</> : <><CircleGauge size={16} /> Run collocation analysis <ArrowRight size={15} /></>}</button>
            {!ready && <p className="run-help">Add at least three sensors, complete their mappings, and name the parameter.</p>}
          </section>
          <section className="method-card"><Sparkles size={15} /><div><strong>Designed for any sensor</strong><p>PM, gases, CO₂, VOCs, meteorology, noise, radiation, or any shared numeric response.</p></div></section>
        </aside>
      </div>
      {alignmentReview && <div className="modal-backdrop alignment-backdrop" role="presentation"><section className="alignment-review" role="dialog" aria-modal="true" aria-labelledby="alignment-review-title"><header><span><Clock3 size={18} /></span><div><small>Review required</small><h2 id="alignment-review-title">Confirm clock alignment</h2><p>Axiom detected possible clock offsets from changes in the shared fleet signal. No timestamp has been altered.</p></div></header><div className="alignment-review-list">{alignmentReview.alignments.map((item) => <div key={item.sensor}><strong>{item.sensor}</strong><span className={item.suggested_lag_minutes ? 'shifted' : ''}>{item.suggested_lag_minutes === 0 ? 'No shift' : `${item.suggested_lag_minutes > 0 ? '+' : ''}${item.suggested_lag_minutes} min`}</span><small>evidence r = {item.correlation?.toFixed(3) ?? '—'}</small></div>)}</div><div className="alignment-explanation"><Info size={14} /><p>Approve only when the suggested offsets are plausible for the device clocks. Applied shifts are analytical metadata; raw timestamps remain unchanged.</p></div><footer><button className="button secondary" type="button" disabled={running} onClick={() => acceptResult(alignmentReview)}>Keep original timestamps</button><button className="button primary" type="button" disabled={running} onClick={() => run(true)}>{running ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Approve suggested shifts</button></footer></section></div>}
    </div>
  )
}

export default CollocationWorkspace

function GateInput({ label, value, suffix, step = '1', onChange }: { label: string; value: number; suffix?: string; step?: string; onChange: (value: number) => void }) {
  return <label><span>{label}</span><div><input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <em>{suffix}</em>}</div></label>
}

function SensorMapping({ file, index, onChange, onSheet, onRemove }: { file: SensorFile; index: number; onChange: (change: Partial<SensorFile>) => void; onSheet: (sheet: string) => void; onRemove: () => void }) {
  const columns = file.inspection.columns
  const numeric = columns.filter((column) => column.type === 'number')
  return <article className="sensor-map-card">
    <header><span className="sensor-index">{String(index + 1).padStart(2, '0')}</span><span className="file-icon"><FileSpreadsheet size={16} /></span><div><strong>{file.inspection.filename}</strong><small>{columns.length} columns · {file.inspection.sample_rows} rows sampled</small></div><span className={file.dateColumn && file.measurementColumn ? 'mapping-status ready' : 'mapping-status'}>{file.dateColumn && file.measurementColumn ? 'Mapped' : 'Needs mapping'}</span><button type="button" onClick={onRemove} aria-label={`Remove ${file.inspection.filename}`}><Trash2 size={14} /></button></header>
    <div className="mapping-fields">
      <label><span>Sensor name</span><input value={file.sensorName} onChange={(event) => onChange({ sensorName: event.target.value })} /></label>
      {file.inspection.sheets.length > 0 && <label><span>Worksheet</span><select value={file.inspection.selected_sheet ?? ''} onChange={(event) => onSheet(event.target.value)}>{file.inspection.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label>}
      <label><span>Timestamp column</span><select value={file.dateColumn} onChange={(event) => onChange({ dateColumn: event.target.value })}><option value="">Select column…</option>{columns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}</select></label>
      <label><span>Separate time <em>Optional</em></span><select value={file.timeColumn} onChange={(event) => onChange({ timeColumn: event.target.value })}><option value="">Already included / none</option>{columns.filter((column) => column.name !== file.dateColumn).map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
      <label className="measurement-select"><span>Measurement column · source unit</span><div className="measurement-control"><select value={file.measurementColumn} onChange={(event) => onChange({ measurementColumn: event.target.value })}><option value="">Select numeric column…</option>{numeric.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.sample.slice(0, 2).join(', ')}</option>)}</select><input value={file.sourceUnit} onChange={(event) => onChange({ sourceUnit: event.target.value })} placeholder="same" aria-label={`${file.sensorName} source unit`} /></div></label>
      <details><summary>Environmental covariates <ChevronDown size={12} /></summary><div><label><span>Temperature</span><select value={file.temperatureColumn} onChange={(event) => onChange({ temperatureColumn: event.target.value })}><option value="">Not mapped</option>{numeric.filter((column) => column.name !== file.measurementColumn).map((column) => <option key={column.name}>{column.name}</option>)}</select></label><label><span>Humidity</span><select value={file.humidityColumn} onChange={(event) => onChange({ humidityColumn: event.target.value })}><option value="">Not mapped</option>{numeric.filter((column) => column.name !== file.measurementColumn).map((column) => <option key={column.name}>{column.name}</option>)}</select></label></div></details>
    </div>
  </article>
}

function SensorTable({ result, detailed = false }: { result: CollocationResult; detailed?: boolean }) {
  return <div className="table-wrap"><table className="sensor-score-table"><thead><tr><th>Sensor</th><th>Status</th><th>Completeness</th><th>CCC</th><th>Bias</th><th>NRMSE</th><th>Slope</th>{detailed && <><th>Pearson r</th><th>Spearman ρ</th><th>R²</th><th>95% agreement limits</th><th>Residual trend/day</th><th>Residual vs temp</th><th>Residual vs RH</th><th>Paired bins</th></>}</tr></thead><tbody>{result.sensors.map((sensor) => <tr key={sensor.sensor}><td><strong>{sensor.sensor}</strong><small>{sensor.filename}</small></td><td><span className={`decision-chip ${sensor.status === 'Ready' ? 'ready' : 'review'}`}>{sensor.status}</span></td><td>{sensor.completeness.toFixed(1)}%</td><td>{sensor.ccc?.toFixed(3) ?? '—'}</td><td>{sensor.relative_bias == null ? '—' : `${sensor.relative_bias > 0 ? '+' : ''}${sensor.relative_bias.toFixed(1)}%`}</td><td>{sensor.nrmse == null ? '—' : `${sensor.nrmse.toFixed(1)}%`}</td><td>{sensor.slope?.toFixed(3) ?? '—'}</td>{detailed && <><td>{sensor.pearson?.toFixed(3) ?? '—'}</td><td>{sensor.spearman?.toFixed(3) ?? '—'}</td><td>{sensor.r_squared?.toFixed(3) ?? '—'}</td><td>{sensor.agreement_limit_low?.toFixed(2) ?? '—'} to {sensor.agreement_limit_high?.toFixed(2) ?? '—'}</td><td>{sensor.residual_trend_per_day?.toFixed(3) ?? '—'}{sensor.residual_trend_p_value != null && <small>p = {sensor.residual_trend_p_value.toFixed(3)}</small>}</td><td>{sensor.temperature_residual_correlation?.toFixed(3) ?? 'Not mapped'}</td><td>{sensor.humidity_residual_correlation?.toFixed(3) ?? 'Not mapped'}</td><td>{sensor.paired_bins.toLocaleString()}</td></>}</tr>)}</tbody></table></div>
}
