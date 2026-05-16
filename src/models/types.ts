export type FormatType = 'same_line' | 'paired_rows' | 'in_only' | 'multi_event'
export type RecordStatus = 'PASS' | 'FAIL' | 'MISSING_IN_SYSTEM' | 'MISSING_IN_CSV'

export interface AttendanceRecord {
  employeeId: string
  employeeName?: string
  date: string
  punchIn: string | null
  punchOut: string | null
  source: FormatType
}

export interface ColumnMap {
  employeeId: string
  employeeName?: string
  date: string
  punchIn?: string
  punchOut?: string
  timestamp?: string
  eventType?: string
  inValue?: string
  outValue?: string
}

export interface ClientConfig {
  name: string
  format: FormatType
  toleranceMinutes: number
  hasHeaders?: boolean    // default true; set false when CSV has no header row
  dateFormat?: string     // default 'YYYY-MM-DD'; also supports 'DD-MM-YYYY', 'MM-DD-YYYY'
  columnMap: ColumnMap
}

export interface SystemRecord {
  punchIn: string | null
  punchOut: string | null
}

export interface ValidationResult {
  employeeId: string
  date: string
  csvPunchIn: string | null
  csvPunchOut: string | null
  systemPunchIn: string | null
  systemPunchOut: string | null
  status: RecordStatus
  notes: string[]
}

export type AttendanceLookup = Map<string, AttendanceRecord>
