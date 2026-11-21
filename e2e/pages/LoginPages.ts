import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class StudentLoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/login');
    await this.expectHeading('Welcome back');
  }

  async login(rollNumber: string, password: string): Promise<void> {
    await this.page.getByTestId('student-roll-number').fill(rollNumber);
    await this.page.getByTestId('student-password').fill(password);
    await this.page.getByTestId('student-login-submit').click();
  }

  async loginExpectingDashboard(rollNumber: string, password: string): Promise<void> {
    await this.login(rollNumber, password);
    await this.expectPath(/\/student$/);
    await expect(this.page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible();
  }

  async expectSignInError(message: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('alert').filter({ hasText: message })).toBeVisible();
  }
}

export class AdminLoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/admin/login');
    await this.expectHeading('Administration sign in');
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.getByTestId('admin-email').fill(email);
    await this.page.getByTestId('admin-password').fill(password);
    await this.page.getByTestId('admin-login-submit').click();
  }

  async loginExpectingDashboard(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.expectPath(/\/admin$/);
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Certificate operations' }),
    ).toBeVisible();
  }
}

export class ChangePasswordPage extends BasePage {
  async expectForcedChange(): Promise<void> {
    await this.expectPath(/\/change-password$/);
    await this.expectHeading('Create your password');
  }

  async fill(
    currentPassword: string,
    newPassword: string,
    confirmPassword = newPassword,
  ): Promise<void> {
    await this.page.getByLabel('Current password', { exact: true }).fill(currentPassword);
    await this.page.getByLabel('New password', { exact: true }).fill(newPassword);
    await this.page.getByLabel('Confirm new password', { exact: true }).fill(confirmPassword);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: 'Update password' }).click();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.fill(currentPassword, newPassword);
    await this.submit();
  }
}
