import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CLERK } from './support/fixtures';
import { openAdminSession, openStudentSession } from './support/sessions';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? 'unknown'}) at ${node.target.join(' ')} :: ${
          node.failureSummary?.replace(/\s+/g, ' ') ?? violation.help
        }`,
    ),
  );
  expect(summary, `Accessibility violations on ${page.url()}:\n${summary.join('\n')}`).toEqual([]);
}

test.describe('WCAG 2.2 AA accessibility', () => {
  test('public pages have no automated violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.goto('/verify');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('student workspace has no automated violations', async ({ browser }) => {
    const student = await openStudentSession(browser);
    await expectNoAccessibilityViolations(student.page);

    await student.page.goto('/student/new');
    await expect(student.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(student.page);

    await student.page.goto('/student/profile');
    await expect(student.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(student.page);

    await student.context.close();
  });

  test('administration workspace has no automated violations', async ({ browser }) => {
    const clerk = await openAdminSession(browser, CLERK);
    await expectNoAccessibilityViolations(clerk.page);

    await clerk.page.goto('/admin/requests');
    await expect(clerk.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(clerk.page);

    await clerk.context.close();
  });
});
