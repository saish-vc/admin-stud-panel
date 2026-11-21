import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LandingPage extends BasePage {
  readonly requestLink = this.page.getByRole('link', { name: 'Request a certificate' }).first();

  async open(): Promise<void> {
    await this.goto('/');
    await this.expectHeading(/Your NTTF certificate/);
  }

  async openStudentSignIn(): Promise<void> {
    await this.page.getByRole('link', { name: 'Student sign in' }).first().click();
    await this.expectPath(/\/login$/);
  }

  async openAdminSignIn(): Promise<void> {
    await this.page.getByRole('link', { name: 'Staff sign in' }).first().click();
    await this.expectPath(/\/admin\/login$/);
  }
}

export class VerifyPage extends BasePage {
  readonly codeInput = this.page.getByTestId('verify-code-input');
  readonly submit = this.page.getByTestId('verify-submit');

  async open(): Promise<void> {
    await this.goto('/verify');
    await this.expectHeading('Verify an NTTF certificate');
  }

  async verify(code: string): Promise<void> {
    await this.codeInput.fill(code);
    await this.submit.click();
    await this.expectPath(new RegExp(`/verify/${code}$`));
  }

  async expectValidResult(holderName: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'This certificate is valid' }),
    ).toBeVisible();
    await expect(this.page.getByText(holderName).first()).toBeVisible();
  }

  async expectNotFound(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Certificate not found' })).toBeVisible();
  }
}
