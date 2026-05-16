import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'csv-parse/sync'
import { ClientConfig, ColumnMap, FormatType } from '../models/types'

// ── Pattern helpers ───────────────────────────────────────────────────────────

const RE_DATE_YMD  = /^\d{4}[-\/]\d{2}[-\/]\d{2}$/
const RE_DATE_DMY  = /^\d{2}[-\/]\d{2}[-\/]\d{4}$/
const RE_TIME      = /^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?\s*$/i
const RE_EVENT     = /^(IN|OUT|PUNCH.?IN|PUNCH.?OUT|P|A)$/i
const RE_EMP_ID    = /^\d{4,10}$|^[A-Z0-9]{4,12}$/i
const LABEL_WORDS  = /^(id|name|date|time|punch|in|out|event|type|note|duration|employee|staff|shift)$/i

function isDate(v: string)     { return RE_DATE_YMD.test(v) || RE_DATE_DMY.test(v) }
function isTime(v: string)     { return RE_TIME.test(v.trim()) }
function isEvent(v: string)    { return RE_EVENT.test(v.trim()) }
function isEmpId(v: string)    { return RE_EMP_ID.test(v.trim()) }
function isLabel(v: string)    { return v.trim().split(/[_\s]+/).some(part => LABEL_WORDS.test(part)) }

// ── Header detection ──────────────────────────────────────────────────────────

function rowLooksLikeHeader(row: string[]): boolean {
  const labelCount = row.filter(v => isLabel(v) || /\s/.test(v.trim())).length
  const numericCount = row.filter(v => /^\d+$/.test(v.trim())).length
  // Header if most values are word-like labels and none are pure numbers
  return labelCount >= row.length / 2 && numericCount === 0
}

// ── Column type detection ─────────────────────────────────────────────────────

type ColType = 'employeeId' | 'date' | 'time' | 'event' | 'name' | 'unknown'

function scoreColumn(values: string[]): ColType {
  const total = values.filter(Boolean).length
  if (total === 0) return 'unknown'

  const scores: Record<ColType, number> = {
    date:       values.filter(isDate).length  / total,
    time:       values.filter(isTime).length  / total,
    event:      values.filter(isEvent).length / total,
    employeeId: values.filter(isEmpId).length / total,
    name:       0,
    unknown:    0,
  }

  const best = (Object.entries(scores) as [ColType, number][])
    .filter(([, score]) => score > 0.6)
    .sort(([, a], [, b]) => b - a)[0]

  return best ? best[0] : 'unknown'
}

// ── Date format detection ─────────────────────────────────────────────────────

function detectDateFormat(sample: string): string {
  const v = sample.trim()
  const parts = v.split(/[-\/]/)
  if (parts.length !== 3) return 'YYYY-MM-DD'
  const [a, , c] = parts.map(Number)
  if (a > 31)  return 'YYYY-MM-DD'   // year first
  if (a > 12)  return 'DD-MM-YYYY'   // day first (unambiguous)
  if (c > 31)  return 'DD-MM-YYYY'   // year last, assume DD-MM-YYYY
  return 'DD-MM-YYYY'                 // default for ambiguous cases
}

// ── Format type detection ─────────────────────────────────────────────────────

function detectFormatType(
  colTypes: ColType[],
  dataRows: string[][]
): FormatType {
  const timeCount  = colTypes.filter(t => t === 'time').length
  const eventCount = colTypes.filter(t => t === 'event').length

  // Two time columns → both punch in and out on same line
  if (timeCount >= 2) return 'same_line'

  // Event column present → paired or multi_event
  if (eventCount >= 1) {
    const empIdx  = colTypes.indexOf('employeeId')
    const dateIdx = colTypes.indexOf('date')
    if (empIdx < 0 || dateIdx < 0) return 'paired_rows'

    // Check if any employee+date combination appears more than twice → multi_event
    const keyCounts = new Map<string, number>()
    for (const row of dataRows) {
      const key = `${row[empIdx]}__${row[dateIdx]}`
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
    }
    const hasMultiple = [...keyCounts.values()].some(c => c > 2)
    return hasMultiple ? 'multi_event' : 'paired_rows'
  }

  // One time column, no event column → in_only
  if (timeCount === 1) return 'in_only'

  return 'same_line'
}

// ── Column map builder ────────────────────────────────────────────────────────

function buildColumnMap(
  colNames: string[],
  colTypes: ColType[],
  format: FormatType
): ColumnMap {
  const pick = (type: ColType, skip = 0) => {
    let found = 0
    for (let i = 0; i < colTypes.length; i++) {
      if (colTypes[i] === type) {
        if (found === skip) return colNames[i]
        found++
      }
    }
    return undefined
  }

  const map: ColumnMap = {
    employeeId: pick('employeeId') ?? colNames[0],
    date:       pick('date')       ?? colNames[1],
  }

  if (format === 'same_line') {
    map.punchIn  = pick('time', 0)
    map.punchOut = pick('time', 1)
  } else if (format === 'in_only') {
    map.punchIn = pick('time', 0)
  } else {
    // paired_rows / multi_event
    map.timestamp = pick('time', 0)
    map.eventType = pick('event', 0)
    const eventCol = map.eventType ? colNames.indexOf(map.eventType) : -1
    if (eventCol >= 0) {
      const uniqueEvents = [...new Set(
        // sampled from colTypes index — actual values need to be passed in separately
        // defaults are set here; refined after calling this function
      )]
      map.inValue  = 'IN'
      map.outValue = 'OUT'
    }
  }

  return map
}

// ── Detect event values (IN / OUT labels used in this specific CSV) ───────────

function detectEventValues(
  dataRows: string[][],
  eventColIdx: number
): { inValue: string; outValue: string } {
  const values = [...new Set(dataRows.map(r => r[eventColIdx]?.trim().toUpperCase()).filter(Boolean))]
  // Try to match known in/out patterns
  const inVal  = values.find(v => /^(IN|PUNCH.?IN|P\.?IN|ENTRY)$/i.test(v))  ?? 'IN'
  const outVal = values.find(v => /^(OUT|PUNCH.?OUT|P\.?OUT|EXIT)$/i.test(v)) ?? 'OUT'
  return { inValue: inVal, outValue: outVal }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function detectConfig(csvPath: string): ClientConfig {
  const raw  = fs.readFileSync(csvPath, 'utf-8')
  const name = path.basename(csvPath, '.csv')

  // Parse as raw arrays first (no column assumption)
  const allRows = parse(raw, {
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as string[][]

  if (allRows.length === 0) throw new Error(`CSV file is empty: ${csvPath}`)

  const hasHeaders = rowLooksLikeHeader(allRows[0])
  const headerRow  = hasHeaders ? allRows[0] : null
  const dataRows   = hasHeaders ? allRows.slice(1) : allRows

  if (dataRows.length === 0) throw new Error(`CSV has no data rows: ${csvPath}`)

  // Column names: use header text or positional index strings
  const colNames: string[] = headerRow
    ? headerRow.map(h => h.toLowerCase().replace(/\s+/g, '_'))
    : dataRows[0].map((_, i) => String(i))

  // Score each column using sample rows (up to 10)
  const sample = dataRows.slice(0, 10)
  const colTypes: ColType[] = colNames.map((_, idx) =>
    scoreColumn(sample.map(row => row[idx] ?? ''))
  )

  const format     = detectFormatType(colTypes, dataRows)
  const columnMap  = buildColumnMap(colNames, colTypes, format)

  // Refine event in/out values for event-based formats
  if ((format === 'paired_rows' || format === 'multi_event') && columnMap.eventType) {
    const eventIdx = colNames.indexOf(columnMap.eventType)
    if (eventIdx >= 0) {
      const { inValue, outValue } = detectEventValues(dataRows, eventIdx)
      columnMap.inValue  = inValue
      columnMap.outValue = outValue
    }
  }

  // Detect date format from first data row
  const dateColIdx = colNames.indexOf(columnMap.date)
  const sampleDate = dateColIdx >= 0 ? (dataRows[0][dateColIdx] ?? '') : ''
  const dateFormat = sampleDate ? detectDateFormat(sampleDate) : 'YYYY-MM-DD'

  return {
    name,
    format,
    toleranceMinutes: 2,
    hasHeaders,
    dateFormat,
    columnMap,
  }
}

export function saveConfig(config: ClientConfig, configPath: string): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}
