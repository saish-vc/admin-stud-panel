import { expect, type Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  async expectPath(pattern: RegExp): Promise<void> {
    await expect(this.page).toHaveURL(pattern);
  }

  async expectToast(text: string): Promise<void> {
    await expect(this.page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
  }

  async expectHeading(name: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('heading', { name, level: 1 })).toBeVisible();
  }

  async expectText(text: string | RegExp): Promise<void> {
    await expect(this.page.getByText(text).first()).toBeVisible();
  }

  async signOut(): Promise<void> {
    await this.page.getByRole('button', { name: 'Sign out' }).click();
    await expect(this.page).toHaveURL(/\/login$/);
  }
}
