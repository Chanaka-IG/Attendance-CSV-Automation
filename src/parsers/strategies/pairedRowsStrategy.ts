import { AttendanceRecord, ClientConfig } from '../../models/types'

// Format: IN row followed by OUT row for the same employee+date
export function parsePairedRows(
  rows: Record<string, string>[],
  config: ClientConfig
): AttendanceRecord[] {
  const { columnMap } = config
  const inValue = (columnMap.inValue ?? 'IN').toUpperCase()
  const outValue = (columnMap.outValue ?? 'OUT').toUpperCase()

  const pending = new Map<string, Partial<AttendanceRecord>>()
  const results: AttendanceRecord[] = []

  for (const row of rows) {
    const employeeId = row[columnMap.employeeId]?.trim()
    const date = row[columnMap.date]?.trim()
    const time = row[columnMap.timestamp!]?.trim()
    const eventType = row[columnMap.eventType!]?.trim().toUpperCase()

    if (!employeeId || !date) continue

    const key = `${employeeId}__${date}`

    const employeeName = columnMap.employeeName ? row[columnMap.employeeName]?.trim() : undefined

    if (eventType === inValue) {
      pending.set(key, { employeeId, employeeName, date, punchIn: time, source: 'paired_rows' })
    } else if (eventType === outValue) {
      const existing = pending.get(key)
      if (existing) {
        results.push({ ...existing, punchOut: time } as AttendanceRecord)
        pending.delete(key)
      } else {
        // OUT with no preceding IN
        results.push({ employeeId, date, punchIn: null, punchOut: time, source: 'paired_rows' })
      }
    }
  }

  // Flush IN-only records (no matching OUT found)
  for (const record of pending.values()) {
    results.push({ ...record, punchOut: null } as AttendanceRecord)
  }

  return results
}
