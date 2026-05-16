import { chromium } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'https://sudan12n-temp14-kord.orangehrm.com'
const USERNAME = process.env.SYS_USER ?? '_ohrmSysAdmin_'
const PASSWORD = process.env.SYS_PASS ?? 'admin@OHRM123'
const AUTH_FILE = 'playwright/.auth/user.json'

export default async function globalSetup() {
  const browser = await chromium.launch()
  const page    = await browser.newPage()

  console.log('[Global Setup] Logging in...')
  await page.goto(`${BASE_URL}/auth/login`)
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME)
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
  await page.getByRole('button',  { name: 'Login' }).click()

  // Wait for any post-login page to load
  await page.waitForURL(/\/client\/#\//, { timeout: 60000 })
  console.log('[Global Setup] Login successful, saving auth state...')

  await page.context().storageState({ path: AUTH_FILE })
  await browser.close()
  console.log(`[Global Setup] Auth state saved → ${AUTH_FILE}`)
}
