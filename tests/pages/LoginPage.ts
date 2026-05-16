import { Page } from '@playwright/test'

const USERNAME = process.env.SYS_USER ?? '_ohrmSysAdmin_'
const PASSWORD = process.env.SYS_PASS ?? 'admin@OHRM123'

export class LoginPage {
  private readonly usernameInput = this.page.getByRole('textbox', { name: 'Username' })
  private readonly passwordInput = this.page.getByRole('textbox', { name: 'Password' })
  private readonly loginButton   = this.page.getByRole('button',  { name: 'Login' })

  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  }

  async login(username = USERNAME, password = PASSWORD): Promise<void> {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.loginButton.click()
    // Wait until the browser leaves the login page — reliable for this server-side SPA
    await this.page.waitForFunction(
      /* executed in browser context */ '!location.href.includes("/auth/login")',
      { timeout: 60000 }
    )
  }

  async loginAndGo(username = USERNAME, password = PASSWORD): Promise<void> {
    await this.navigate()
    await this.login(username, password)
  }
}
