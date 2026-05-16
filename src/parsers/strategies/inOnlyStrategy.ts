import { AttendanceRecord, ClientConfig } from '../../models/types'

// Format: CSV contains only punch_in; no punch_out data
export function parseInOnly(
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
      punchOut: null,
      source: 'in_only' as const,
    }))
    .filter(r => r.employeeId && r.date)
}
