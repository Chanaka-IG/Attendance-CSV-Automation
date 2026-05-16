import { AttendanceRecord, ClientConfig } from '../../models/types'

// Format: multiple IN/OUT rows per employee per day in any order
// Normalizes to: first IN of the day as punchIn, last OUT of the day as punchOut
export function parseMultiEvent(
  rows: Record<string, string>[],
  config: ClientConfig
): AttendanceRecord[] {
  const { columnMap } = config
  const inValue = (columnMap.inValue ?? 'IN').toUpperCase()
  const outValue = (columnMap.outValue ?? 'OUT').toUpperCase()

  const grouped = new Map<string, Array<{ time: string; type: string }>>()
  const nameMap = new Map<string, string>()

  for (const row of rows) {
    const employeeId = row[columnMap.employeeId]?.trim()
    const date = row[columnMap.date]?.trim()
    const time = row[columnMap.timestamp!]?.trim()
    const eventType = row[columnMap.eventType!]?.trim().toUpperCase()

    if (!employeeId || !date || !time) continue

    if (columnMap.employeeName && row[columnMap.employeeName]) {
      nameMap.set(employeeId, row[columnMap.employeeName].trim())
    }

    const key = `${employeeId}__${date}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push({ time, type: eventType })
  }

  const results: AttendanceRecord[] = []

  for (const [key, events] of grouped.entries()) {
    const [employeeId, date] = key.split('__')

    // Sort chronologically regardless of CSV row order
    events.sort((a, b) => a.time.localeCompare(b.time))

    const ins = events.filter(e => e.type === inValue)
    const outs = events.filter(e => e.type === outValue)

    results.push({
      employeeId,
      employeeName: nameMap.get(employeeId),
      date,
      punchIn: ins[0]?.time ?? null,
      punchOut: outs[outs.length - 1]?.time ?? null,
      source: 'multi_event',
    })
  }

  return results
}
