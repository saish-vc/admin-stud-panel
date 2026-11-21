import { expect, test } from '@playwright/test';
import { AdminLoginPage, StudentLoginPage } from './pages/LoginPages';
import { LandingPage } from './pages/PublicPages';
import { CLERK, FORCED_PASSWORD_STUDENT, HOD, STUDENT } from './support/fixtures';

test.describe('Authentication and access control', () => {
  test('anonymous visitors are redirected to the student sign-in', async ({ page }) => {
    await page.goto('/student');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();

    await page.goto('/student/requests');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/admin/requests');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('student can sign in, see their record, and sign out', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.open();
    await landing.openStudentSignIn();

    const login = new StudentLoginPage(page);
    await login.loginExpectingDashboard(STUDENT.rollNumber, STUDENT.password);
    await expect(page.getByText(STUDENT.fullName).first()).toBeVisible();
    await expect(page.getByText(STUDENT.rollNumber).first()).toBeVisible();

    const profileLink = page.getByRole('link', { name: 'My profile' }).first();
    await profileLink.click();
    await expect(page).toHaveURL(/\/student\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Student record' })).toBeVisible();
    await expect(page.getByText(STUDENT.programme).first()).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  });

  test('invalid student credentials produce a generic error', async ({ page }) => {
    const login = new StudentLoginPage(page);
    await login.open();
    await login.login(STUDENT.rollNumber, 'DefinitelyNotThePassword1!');
    await login.expectSignInError('The roll number or password is incorrect.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a temporary password forces the student to choose a new one', async ({ page }) => {
    const login = new StudentLoginPage(page);
    await login.open();
    await login.login(FORCED_PASSWORD_STUDENT.rollNumber, FORCED_PASSWORD_STUDENT.password);

    await expect(page).toHaveURL(/\/change-password$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your password' }),
    ).toBeVisible();

    await page
      .getByLabel('Current password', { exact: true })
      .fill(FORCED_PASSWORD_STUDENT.password);
    await page.getByLabel('New password', { exact: true }).fill('Nttf@Portal2026');
    await page.getByLabel('Confirm new password', { exact: true }).fill('Nttf@Portal2027');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText('The passwords do not match.').first()).toBeVisible();
    await expect(page).toHaveURL(/\/change-password$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('clerk and HOD can sign in to the administration workspace', async ({ page }) => {
    const adminLogin = new AdminLoginPage(page);

    await adminLogin.open();
    await adminLogin.loginExpectingDashboard(CLERK.email, CLERK.password);
    await expect(page.getByText('Verification clerk').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request queue' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await adminLogin.open();
    await adminLogin.loginExpectingDashboard(HOD.email, HOD.password);
    await expect(page.getByText('Head of Department').first()).toBeVisible();
    await expect(page.getByText(/approves or rejects verified requests/i).first()).toBeVisible();
  });

  test('a student cannot open administration routes', async ({ page }) => {
    const login = new StudentLoginPage(page);
    await login.open();
    await login.loginExpectingDashboard(STUDENT.rollNumber, STUDENT.password);

    await page.goto('/admin/requests');
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible();
  });
});
