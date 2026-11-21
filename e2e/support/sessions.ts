import { readFile } from 'node:fs/promises';
import {
  expect,
  type Browser,
  type BrowserContext,
  type Download,
  type Page,
} from '@playwright/test';
import { AdminLoginPage, StudentLoginPage } from '../pages/LoginPages';
import { STUDENT, type StaffFixture, type StudentFixture } from './fixtures';

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
}

export async function openStudentSession(
  browser: Browser,
  credentials: StudentFixture = STUDENT,
): Promise<BrowserSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const login = new StudentLoginPage(page);
  await login.open();
  await login.login(credentials.rollNumber, credentials.password);
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible();
  return { context, page };
}

export async function openAdminSession(
  browser: Browser,
  staff: StaffFixture,
): Promise<BrowserSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const login = new AdminLoginPage(page);
  await login.open();
  await login.login(staff.email, staff.password);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Certificate operations' }),
  ).toBeVisible();
  return { context, page };
}

export async function downloadedBytes(download: Download): Promise<Buffer> {
  const filePath = await download.path();
  if (!filePath) throw new Error('The browser did not provide a path for the download.');
  return readFile(filePath);
}

export function pdfLooksValid(bytes: Buffer): boolean {
  return bytes.subarray(0, 4).toString('latin1') === '%PDF';
}
