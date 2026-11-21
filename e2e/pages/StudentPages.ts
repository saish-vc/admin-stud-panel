import { expect, type Download, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class StudentDashboardPage extends BasePage {
  async expectLoaded(): Promise<void> {
    await this.expectPath(/\/student$/);
    await expect(this.page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Recent requests' })).toBeVisible();
  }

  async openNewRequest(): Promise<NewRequestPage> {
    await this.page.getByRole('link', { name: 'New request' }).first().click();
    await this.expectPath(/\/student\/new$/);
    return new NewRequestPage(this.page);
  }

  async openRequests(): Promise<StudentRequestsPage> {
    await this.page.getByRole('link', { name: 'My requests' }).first().click();
    await this.expectPath(/\/student\/requests$/);
    return new StudentRequestsPage(this.page);
  }

  async openProfile(): Promise<void> {
    await this.page.getByRole('link', { name: 'My profile' }).first().click();
    await this.expectPath(/\/student\/profile$/);
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Student record' }),
    ).toBeVisible();
  }
}

export class StudentRequestsPage extends BasePage {
  async openRequest(requestId: string): Promise<StudentRequestDetailPage> {
    await this.page
      .getByRole('link', { name: /View/ })
      .first()
      .or(this.page.locator(`a[href="/student/requests/${requestId}"]`).first())
      .click();
    await this.expectPath(new RegExp(`/student/requests/${requestId}$`));
    return new StudentRequestDetailPage(this.page);
  }

  async openRequestByPurpose(purpose: string): Promise<StudentRequestDetailPage> {
    const row = this.page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: /View/ }).click();
    await this.expectPath(/\/student\/requests\/[0-9a-f-]{36}$/);
    return new StudentRequestDetailPage(this.page);
  }
}

export class NewRequestPage extends BasePage {
  async chooseType(type: 'Bonafide' | 'Leaving' | 'Diploma'): Promise<void> {
    await this.page
      .locator('label')
      .filter({ hasText: `${type} Certificate` })
      .click();
    await expect(this.page.getByRole('radio', { name: new RegExp(type) })).toBeChecked();
  }

  async fillPurpose(purpose: string): Promise<void> {
    await this.page.getByTestId('request-purpose').fill(purpose);
  }

  async attachDocument(filePath: string): Promise<void> {
    await this.page.getByTestId('request-document').setInputFiles(filePath);
  }

  async submit(): Promise<string> {
    await this.page.getByTestId('request-submit').click();
    await this.expectPath(/\/student\/requests\/[0-9a-f-]{36}$/);
    const requestId = new URL(this.page.url()).pathname.split('/').pop();
    if (!requestId) throw new Error('Request ID missing from URL');
    return requestId;
  }
}

export class StudentRequestDetailPage extends BasePage {
  async expectStatus(status: string): Promise<void> {
    await expect(this.page.getByTestId('request-status').first()).toHaveText(status);
  }

  async expectGuidance(heading: string | RegExp): Promise<void> {
    await expect(this.page.getByText(heading).first()).toBeVisible();
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

  async openPublicVerification(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');
    await this.page.getByRole('link', { name: 'Open public verification' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    return popup;
  }

  async resubmit(purpose: string): Promise<void> {
    const trigger = this.page.getByRole('button', { name: /Resubmit/ }).first();
    await trigger.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Resubmit this request' })).toBeVisible();
    await dialog.getByLabel('Purpose').fill(purpose);
    await dialog.getByRole('button', { name: 'Resubmit request' }).click();
    await expect(dialog).toBeHidden();
  }
}
