import { AttendanceRecord, ClientConfig } from '../../models/types'

// Format: each row has both punch_in and punch_out columns
export function parseSameLine(
  rows: Record<string, string>[],
  config: ClientConfig
): AttendanceRecord[] {
  const { columnMap } = config
  return rows
    .map(row => ({
      employeeId: row[columnMap.employeeId]?.trim(),
      employeeName: columnMap.employeeName ? row[columnMap.employeeName]?.trim() : undefined,
      date: row[columnMap.date]?.trim(),
      punchIn: row[columnMap.punchIn!]?.trim() || null,
      punchOut: row[columnMap.punchOut!]?.trim() || null,
      source: 'same_line' as const,
    }))
    .filter(r => r.employeeId && r.date)
}
