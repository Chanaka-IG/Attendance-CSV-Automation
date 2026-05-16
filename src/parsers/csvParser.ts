import * as fs from 'fs'
import { parse } from 'csv-parse/sync'
import { AttendanceRecord, AttendanceLookup, ClientConfig, FormatType } from '../models/types'
import { parseSameLine } from './strategies/sameLineStrategy'
import { parsePairedRows } from './strategies/pairedRowsStrategy'
import { parseInOnly } from './strategies/inOnlyStrategy'
import { parseMultiEvent } from './strategies/multiEventStrategy'

const strategyMap: Record<FormatType, (rows: Record<string, string>[], config: ClientConfig) => AttendanceRecord[]> = {
  same_line: parseSameLine,
  paired_rows: parsePairedRows,
  in_only: parseInOnly,
  multi_event: parseMultiEvent,
}

export function loadConfig(configPath: string): ClientConfig {
  const raw = fs.readFileSync(configPath, 'utf-8')
  return JSON.parse(raw) as ClientConfig
}

// Converts DD-MM-YYYY or MM-DD-YYYY → YYYY-MM-DD for the system's date fields
function normalizeDate(value: string, format?: string): string {
  const v = value.trim()
  if (!format || format === 'YYYY-MM-DD') return v
  const parts = v.split('-')
  if (parts.length !== 3) return v
  if (format === 'DD-MM-YYYY') return `${parts[2]}-${parts[1]}-${parts[0]}`
  if (format === 'MM-DD-YYYY') return `${parts[2]}-${parts[0]}-${parts[1]}`
  return v
}

// Strips AM/PM suffix and returns HH:MM in 24-hour format
function normalizeTime(value: string): string {
  if (!value) return value
  return value.trim().replace(/\s*(AM|PM)\s*$/i, '').trim()
}

function normalizeRows(
  rows: Record<string, string>[],
  config: ClientConfig
): Record<string, string>[] {
  const { columnMap, dateFormat } = config
  const timeKeys = [columnMap.punchIn, columnMap.punchOut, columnMap.timestamp].filter(Boolean) as string[]

  return rows.map(row => {
    const normalized = { ...row }
    if (columnMap.date && normalized[columnMap.date] !== undefined) {
      normalized[columnMap.date] = normalizeDate(normalized[columnMap.date], dateFormat)
    }
    for (const key of timeKeys) {
      if (normalized[key] !== undefined) {
        normalized[key] = normalizeTime(normalized[key])
      }
    }
    return normalized
  })
}

export function parseCSV(csvPath: string, config: ClientConfig): AttendanceRecord[] {
  const raw = fs.readFileSync(csvPath, 'utf-8')

  let rows: Record<string, string>[]

  if (config.hasHeaders === false) {
    // No header row — parse as arrays and key each column by its 0-based index string
    const arrayRows = parse(raw, {
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as string[][]
    rows = arrayRows.map(cols =>
      Object.fromEntries(cols.map((val, i) => [String(i), val]))
    )
  } else {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[]
  }

  rows = normalizeRows(rows, config)

  const strategy = strategyMap[config.format]
  if (!strategy) throw new Error(`Unknown format type: "${config.format}"`)

  const records = strategy(rows, config)

  // Sort by employeeId then date so records are grouped and chronological regardless of CSV order
  records.sort((a, b) =>
    a.employeeId.localeCompare(b.employeeId) || a.date.localeCompare(b.date)
  )

  return records
}

export function buildLookup(records: AttendanceRecord[]): AttendanceLookup {
  const map: AttendanceLookup = new Map()
  for (const record of records) {
    map.set(lookupKey(record.employeeId, record.date), record)
  }
  return map
}

export function lookupKey(employeeId: string, date: string): string {
  return `${employeeId}__${date}`
}
