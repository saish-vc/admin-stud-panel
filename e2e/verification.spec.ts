import { expect, test } from '@playwright/test';
import { VerifyPage } from './pages/PublicPages';

const SEEDED_CODE = 'NTTF-VERIFY-E2E-2026-0001';

test.describe('Public certificate verification', () => {
  test('a valid certificate displays the official register details', async ({ page }) => {
    const verify = new VerifyPage(page);
    await verify.open();

    await page.getByTestId('verify-code-input').fill(SEEDED_CODE);
    await page.getByTestId('verify-submit').click();

    await expect(page).toHaveURL(new RegExp(`/verify/${SEEDED_CODE}$`));
    await expect(
      page.getByRole('heading', { level: 2, name: 'This certificate is valid' }),
    ).toBeVisible();
    await expect(page.getByText('Sara Thomas').first()).toBeVisible();
    await expect(page.getByText('NTTF2026003').first()).toBeVisible();
    await expect(page.getByText('Bonafide Certificate').first()).toBeVisible();
    await expect(page.getByText('NTTF/2026/E2E/0001').first()).toBeVisible();

    await page.getByRole('button', { name: 'Verify another certificate' }).click();
    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.getByTestId('verify-code-input')).toHaveValue('');
  });

  test('a malformed code is rejected before any request is sent', async ({ page }) => {
    const verify = new VerifyPage(page);
    await verify.open();

    await page.getByTestId('verify-code-input').fill('too-short');
    await page.getByTestId('verify-submit').click();

    await expect(page.getByRole('alert')).toContainText(
      'Enter the 16–64 character code printed on the certificate.',
    );
    await expect(page).toHaveURL(/\/verify$/);
  });

  test('an unknown code reports that no certificate matches', async ({ page }) => {
    const verify = new VerifyPage(page);
    await verify.open();

    await page.getByTestId('verify-code-input').fill('NTTF-DOES-NOT-EXIST-0001');
    await page.getByTestId('verify-submit').click();

    await expect(page.getByRole('heading', { name: 'Certificate not found' })).toBeVisible();
  });
});
