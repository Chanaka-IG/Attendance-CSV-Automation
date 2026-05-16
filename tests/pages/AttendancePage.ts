import { Page, Locator } from '@playwright/test'
import { SystemRecord } from '../../src/models/types'

const ATTENDANCE_LINK_PATTERN = /Attendance_Employee_Records_Report/

// Column indices (0-based) when "Show Actual Punch Times" is enabled
const COL = {
  EMPLOYEE_ID:      0,
  EMPLOYEE_NAME:    1,
  PUNCH_IN:         2,
  PUNCH_IN_ACTUAL:  3,
  PUNCH_IN_NOTE:    4,
  PUNCH_OUT:        5,
  PUNCH_OUT_ACTUAL: 6,
  PUNCH_OUT_NOTE:   7,
  DURATION:         8,
  DURATION_ACTUAL:  9,
}

export class AttendancePage {
  // ── Filter locators ───────────────────────────────────────────────────────
  private readonly dateFromField     = this.page.getByRole('textbox', { name: 'From' })
  private readonly dateToField       = this.page.getByRole('textbox', { name: 'To' })
  private readonly showActualCheckbox = this.page.locator('input[name="show_actual_punch_time"]')
  private readonly showActualLabel    = this.page.getByText('Show Actual Punch Times')

  private readonly employeeFilterContainer: Locator
  private readonly employeeFilterInput:     Locator

  // ── Table / loader locators ───────────────────────────────────────────────
  private readonly resultsTable = this.page.locator('#pim_report_table')
  private readonly loader       = this.page.locator('.oxd-circle-loader-container')

  constructor(private readonly page: Page) {
    this.employeeFilterContainer = page.locator('#report_multiselect_empfilter_employee_name')
    this.employeeFilterInput     = this.employeeFilterContainer.locator('input')
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    // Find the "Attendance > Employee Records" sidebar link (URL contains Attendance_Employee_Records_Report)
    // and click it — avoids relying on a hardcoded hash URL that changes between app versions.
    const attendanceLink = this.page.locator(`a[href*="Attendance_Employee_Records_Report"]`).first()

    // If already on the page, the link might not be visible — fall back to clicking the
    // top-level "Attendance" nav item to surface the sub-links.
    const linkVisible = await attendanceLink.isVisible().catch(() => false)
    if (!linkVisible) {
      const attendanceNavItem = this.page.locator('a').filter({ hasText: /^Attendance$/ }).first()
      const navVisible = await attendanceNavItem.isVisible().catch(() => false)
      if (navVisible) await attendanceNavItem.click()
    }

    await attendanceLink.waitFor({ state: 'visible', timeout: 30000 })
    await attendanceLink.click()

    await this.dateFromField.waitFor({ state: 'visible', timeout: 60000 })
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  async enableActualPunchTimes(): Promise<void> {
    const isChecked = await this.showActualCheckbox.isChecked()
    if (!isChecked) await this.showActualLabel.click()
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  async setDateRange(date: string): Promise<void> {
    await this.dateFromField.click({ clickCount: 3 })
    await this.dateFromField.fill(date)
    await this.dateFromField.press('Tab')

    await this.dateToField.click({ clickCount: 3 })
    await this.dateToField.fill(date)
    await this.dateToField.press('Tab')
  }

  async filterByEmployeeId(employeeId: string): Promise<void> {
    await this.clearEmployeeFilter()

    // Click first to trigger AngularJS ng-click (initialises the suggestion list)
    await this.employeeFilterInput.click()

    // Type the ID character-by-character so ng-change fires on each keystroke
    await this.employeeFilterInput.pressSequentially(employeeId, { delay: 80 })

    // Click again to make the filtered dropdown visible
    await this.employeeFilterInput.click()

    // Select the first suggestion
    const firstOption = this.employeeFilterContainer.locator('ul li').first()
    await firstOption.waitFor({ state: 'visible', timeout: 5000 })
    await firstOption.click()

    // Wait for the loader to appear then disappear — signals the AJAX is done and data is rendered
    await this.waitForLoader()
  }

  private async clearEmployeeFilter(): Promise<void> {
    // The remove button for each chip is: button.btn-remove-item (aria-label="Remove")
    const removeButtons = this.employeeFilterContainer.locator('button.btn-remove-item')
    let count = await removeButtons.count()
    while (count > 0) {
      const btn = removeButtons.first()
      await btn.click()
      // Wait for the clicked button to leave the DOM (chip removed) before checking again
      await btn.waitFor({ state: 'detached', timeout: 5000 })
      count = await removeButtons.count()
    }
  }

  private async waitForLoader(): Promise<void> {
    // Allow a short window for AngularJS to inject the loader into the DOM
    await this.loader.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    // Then wait until it's gone — at that point data is fully rendered
    await this.loader.waitFor({ state: 'hidden', timeout: 30000 })
  }

  // ── Table reading ─────────────────────────────────────────────────────────

  async waitForTableReady(): Promise<void> {
    await this.waitForLoader()
  }

  async getSystemRecord(employeeId: string, expectedPunchIn?: string | null): Promise<SystemRecord | null> {
    // Wait for a row containing this specific employee ID to appear in the table.
    // Using a targeted wait avoids the race where stale rows from a previous filter satisfy a generic wait.
    await this.page.locator(`#pim_report_table tbody tr td a:text-is("${employeeId}")`)
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => { /* employee has no records for this date — proceed to return null */ })

    const rows  = this.resultsTable.locator('tbody tr')
    const count = await rows.count()
    if (count === 0) return null

    const candidates: SystemRecord[] = []

    for (let i = 0; i < count; i++) {
      const row      = rows.nth(i)
      const cells    = row.locator('td')
      const cellCount = await cells.count()

      // Skip ghost/structural rows that the AngularJS table renders without data cells
      if (cellCount < COL.PUNCH_OUT + 1) continue

      // Use a short per-cell timeout — if the cell genuinely has no value, move on fast
      const idText = (await cells.nth(COL.EMPLOYEE_ID).textContent({ timeout: 3000 }))?.trim()
      if (!idText) continue

      if (idText === employeeId || count === 1) {
        const punchIn  = (await cells.nth(COL.PUNCH_IN).textContent({ timeout: 3000 }))?.trim()  || null
        const punchOut = (await cells.nth(COL.PUNCH_OUT).textContent({ timeout: 3000 }))?.trim() || null
        candidates.push({ punchIn: punchIn || null, punchOut: punchOut || null })
      }
    }

    if (candidates.length === 0) return null
    if (candidates.length === 1 || !expectedPunchIn) return candidates[0]

    // Multiple rows for the same employee — pick the one whose punch-in is closest to the CSV value
    const expectedMins = toMinutes(expectedPunchIn)
    if (expectedMins === null) return candidates[0]

    let best = candidates[0]
    let bestDiff = Infinity
    for (const c of candidates) {
      if (!c.punchIn) continue
      const sysMins = toMinutes(c.punchIn)
      if (sysMins === null) continue
      const diff = Math.abs(sysMins - expectedMins)
      if (diff < bestDiff) { bestDiff = diff; best = c }
    }
    return best
  }
}

function toMinutes(timeStr: string): number | null {
  const m = timeStr.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}
