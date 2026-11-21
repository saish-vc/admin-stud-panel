import { expect, type Download, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class AdminDashboardPage extends BasePage {
  async expectLoaded(): Promise<void> {
    await this.expectPath(/\/admin$/);
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Certificate operations' }),
    ).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Action queue' })).toBeVisible();
  }

  async openQueue(): Promise<AdminQueuePage> {
    await this.page.getByRole('link', { name: 'Open request queue' }).click();
    await this.expectPath(/\/admin\/requests$/);
    return new AdminQueuePage(this.page);
  }
}

export class AdminQueuePage extends BasePage {
  async search(term: string): Promise<void> {
    await this.page.getByLabel('Search student').fill(term);
    await this.page.getByRole('button', { name: 'Apply' }).click();
    await expect(this.page).toHaveURL(new RegExp(`q=${encodeURIComponent(term)}`));
  }

  async openRequestForRoll(rollNumber: string): Promise<AdminRequestDetailPage> {
    const row = this.page.getByRole('row', { name: new RegExp(rollNumber) });
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: 'Review' }).click();
    await this.expectPath(/\/admin\/requests\/[0-9a-f-]{36}$/);
    return new AdminRequestDetailPage(this.page);
  }

  async openRequestContaining(text: string): Promise<AdminRequestDetailPage> {
    const row = this.page.getByRole('row').filter({ hasText: text });
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: 'Review' }).click();
    await this.expectPath(/\/admin\/requests\/[0-9a-f-]{36}$/);
    return new AdminRequestDetailPage(this.page);
  }
}

export class AdminRequestDetailPage extends BasePage {
  async expectStatus(status: string): Promise<void> {
    await expect(this.page.getByTestId('request-status').first()).toHaveText(status);
  }

  async expectActionAvailable(
    testId: 'admin-verify' | 'admin-approve' | 'admin-reject' | 'admin-generate',
  ): Promise<void> {
    await expect(this.page.getByTestId(testId)).toBeVisible();
  }

  async expectActionUnavailable(
    testId: 'admin-verify' | 'admin-approve' | 'admin-reject' | 'admin-generate',
  ): Promise<void> {
    await expect(this.page.getByTestId(testId)).toHaveCount(0);
  }

  private async act(
    triggerTestId: 'admin-verify' | 'admin-approve' | 'admin-reject',
    dialogTitle: string,
    confirmLabel: string,
    remarks?: string,
  ): Promise<void> {
    await this.page.getByTestId(triggerTestId).click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: dialogTitle })).toBeVisible();
    if (remarks) await dialog.getByRole('textbox').fill(remarks);
    await dialog.getByRole('button', { name: confirmLabel }).click();
    await expect(dialog).toBeHidden();
  }

  async verify(remarks?: string): Promise<void> {
    await this.act('admin-verify', 'Verify supporting documents', 'Verify documents', remarks);
  }

  async approve(remarks?: string): Promise<void> {
    await this.act('admin-approve', 'Approve and issue certificate', 'Approve request', remarks);
  }

  async reject(remarks: string): Promise<void> {
    await this.act('admin-reject', 'Reject this request', 'Reject request', remarks);
  }

  async retryGeneration(): Promise<void> {
    await this.page.getByTestId('admin-generate').click();
  }

  async downloadCertificate(): Promise<Download> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByRole('button', { name: 'Download certificate PDF' }).click();
    return downloadPromise;
  }

  async getVerificationCode(): Promise<string> {
    const code = await this.page
      .locator('section[aria-labelledby="certificate-heading"] code')
      .first()
      .innerText();
    return code.trim();
  }

  async expectCertificateIssued(): Promise<string> {
    await expect(this.page.getByRole('heading', { name: 'Ready to download' })).toBeVisible();
    const number = await this.page
      .locator('section[aria-labelledby="certificate-heading"] dd')
      .first()
      .innerText();
    return number.trim();
  }

  async openPublicVerification(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');
    await this.page.getByRole('link', { name: 'Open public verification' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    return popup;
  }
}
