import { test, expect } from '../fixtures/attendanceFixture'
import { LoginPage }     from '../pages/LoginPage'
import { AttendancePage } from '../pages/AttendancePage'
import { validateRecord } from '../../src/validators/attendanceValidator'
import { generateHTMLReport, generateJSONReport } from '../../src/reports/reportGenerator'
import { ValidationResult } from '../../src/models/types'
import * as path from 'path'

const results: ValidationResult[] = []

test.describe('Attendance CSV vs System Validation', () => {

  test.beforeEach(async ({ page }) => {
    await new LoginPage(page).loginAndGo()
    const attendancePage = new AttendancePage(page)
    await attendancePage.navigate()
    await attendancePage.enableActualPunchTimes()
  })

  test('validate all CSV records against OrangeHRM attendance', async ({
    page, csvRecords, clientConfig,
  }) => {
    const attendancePage = new AttendancePage(page)

    for (const record of csvRecords) {
      await attendancePage.setDateRange(record.date)
      await attendancePage.filterByEmployeeId(record.employeeId)

      let systemRecord = null
      try {
        systemRecord = await attendancePage.getSystemRecord(record.employeeId, record.punchIn)
      } catch (err) {
        console.warn(`[WARN] Failed to read system record — ${record.employeeId} | ${record.date}: ${err}`)
      }

      const result = validateRecord(record, systemRecord, clientConfig.toleranceMinutes)
      results.push(result)

      if (result.status === 'PASS') {
        console.log(`[PASS] ${record.employeeId} | ${record.date}`)
      } else {
        console.warn(`[${result.status}] ${record.employeeId} | ${record.date} | ${result.notes.join(' | ')}`)
      }
    }

    // Collect all failures and report them together rather than stopping at first
    const failures = results.filter(r => r.status !== 'PASS')
    expect(
      failures,
      `${failures.length} record(s) failed validation:\n` +
      failures.map(f => `  ${f.employeeId} | ${f.date} | ${f.notes.join(', ')}`).join('\n')
    ).toHaveLength(0)
  })

  test.afterAll(async () => {
    if (results.length === 0) return

    const reportDir = path.resolve(__dirname, '../../reports')
    const htmlPath  = generateHTMLReport(results, reportDir)
    const jsonPath  = generateJSONReport(results, reportDir)

    const pass    = results.filter(r => r.status === 'PASS').length
    const fail    = results.filter(r => r.status === 'FAIL').length
    const missing = results.filter(r => r.status === 'MISSING_IN_SYSTEM').length

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`Validation complete — ${results.length} record(s) checked`)
    console.log(`  PASS: ${pass}  FAIL: ${fail}  MISSING: ${missing}`)
    console.log(`  HTML Report : ${htmlPath}`)
    console.log(`  JSON Report : ${jsonPath}`)
    console.log(`${'─'.repeat(60)}`)
  })
})
