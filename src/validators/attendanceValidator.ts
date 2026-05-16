import { AttendanceRecord, SystemRecord, ValidationResult, RecordStatus } from '../models/types'

function toMinutes(time: string | null): number | null {
  if (!time) return null
  const s = time.trim()
  // System datetime format: "2026-05-13 08:00:00 (GMT 2.0)" — extract HH:MM
  const dtMatch = s.match(/\d{4}-\d{2}-\d{2}\s+(\d{2}):(\d{2})/)
  if (dtMatch) return parseInt(dtMatch[1]) * 60 + parseInt(dtMatch[2])
  // Plain time with optional AM/PM: "08:00 AM" → "08:00"
  const clean = s.replace(/\s*(AM|PM)\s*$/i, '').trim()
  const [h, m] = clean.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function timesMatch(csv: string | null, system: string | null, tolerance: number): boolean {
  if (csv === null && system === null) return true
  if (csv === null || system === null) return false
  const csvMin = toMinutes(csv)
  const sysMin = toMinutes(system)
  if (csvMin === null || sysMin === null) return false
  return Math.abs(csvMin - sysMin) <= tolerance
}

export function validateRecord(
  csvRecord: AttendanceRecord,
  systemRecord: SystemRecord | null,
  toleranceMinutes: number
): ValidationResult {
  if (!systemRecord) {
    return {
      employeeId: csvRecord.employeeId,
      date: csvRecord.date,
      csvPunchIn: csvRecord.punchIn,
      csvPunchOut: csvRecord.punchOut,
      systemPunchIn: null,
      systemPunchOut: null,
      status: 'MISSING_IN_SYSTEM',
      notes: ['Record not found in system'],
    }
  }

  const notes: string[] = []

  const inMatch = timesMatch(csvRecord.punchIn, systemRecord.punchIn, toleranceMinutes)
  const outMatch = timesMatch(csvRecord.punchOut, systemRecord.punchOut, toleranceMinutes)

  if (!inMatch) {
    notes.push(`Punch In mismatch — CSV: ${csvRecord.punchIn ?? 'null'}, System: ${systemRecord.punchIn ?? 'null'}`)
  }
  if (!outMatch) {
    notes.push(`Punch Out mismatch — CSV: ${csvRecord.punchOut ?? 'null'}, System: ${systemRecord.punchOut ?? 'null'}`)
  }

  const status: RecordStatus = inMatch && outMatch ? 'PASS' : 'FAIL'

  return {
    employeeId: csvRecord.employeeId,
    date: csvRecord.date,
    csvPunchIn: csvRecord.punchIn,
    csvPunchOut: csvRecord.punchOut,
    systemPunchIn: systemRecord.punchIn,
    systemPunchOut: systemRecord.punchOut,
    status,
    notes,
  }
}
