import path from 'node:path';
import { expect, test } from '@playwright/test';
import { AdminDashboardPage, AdminQueuePage } from './pages/AdminPages';
import { StudentDashboardPage, StudentRequestDetailPage } from './pages/StudentPages';
import { CLERK, HOD, STUDENT } from './support/fixtures';
import {
  downloadedBytes,
  openAdminSession,
  openStudentSession,
  pdfLooksValid,
} from './support/sessions';

const SUPPORTING_DOCUMENT = path.resolve(process.cwd(), 'e2e/fixtures/supporting-document.pdf');

test.describe.configure({ mode: 'serial' });

test.describe('Certificate request lifecycle', () => {
  test('request, clerk verification, HOD approval, PDF download, and public verification', async ({
    browser,
  }) => {
    const keyword = `E2E-LIFECYCLE-${Date.now()}`;
    const purpose = `${keyword}: education loan application for higher studies.`;

    const student = await openStudentSession(browser);
    const studentDashboard = new StudentDashboardPage(student.page);
    await studentDashboard.expectLoaded();

    const newRequest = await studentDashboard.openNewRequest();
    await newRequest.fillPurpose(purpose);
    await newRequest.attachDocument(SUPPORTING_DOCUMENT);
    const requestId = await newRequest.submit();

    const studentDetail = new StudentRequestDetailPage(student.page);
    await studentDetail.expectStatus('Submitted');
    await studentDetail.expectGuidance('Waiting for document verification');
    await expect(
      student.page.getByRole('list', { name: 'Request history' }).getByText('Request submitted'),
    ).toBeVisible();
    await student.context.close();

    const clerk = await openAdminSession(browser, CLERK);
    const clerkDashboard = new AdminDashboardPage(clerk.page);
    const clerkQueue = await clerkDashboard.openQueue();
    await clerkQueue.search(STUDENT.rollNumber);
    const clerkDetail = await clerkQueue.openRequestForRoll(STUDENT.rollNumber);
    await clerkDetail.expectStatus('Submitted');
    await clerkDetail.expectActionAvailable('admin-verify');
    await clerkDetail.expectActionUnavailable('admin-approve');
    await clerkDetail.verify('Master record and supporting document checked during E2E.');
    await clerkDetail.expectStatus('Under verification');
    await clerkDetail.expectActionUnavailable('admin-verify');
    await clerk.context.close();

    const hod = await openAdminSession(browser, HOD);
    await hod.page.goto(
      `/admin/requests?status=UNDER_VERIFICATION&q=${encodeURIComponent(STUDENT.rollNumber)}`,
    );
    const hodQueue = new AdminQueuePage(hod.page);
    const hodDetail = await hodQueue.openRequestForRoll(STUDENT.rollNumber);
    await hodDetail.expectStatus('Under verification');
    await hodDetail.expectActionAvailable('admin-approve');
    await hodDetail.expectActionUnavailable('admin-verify');
    await hodDetail.approve('Approved after document verification during E2E.');

    const certificateNumber = await hodDetail.expectCertificateIssued();
    expect(certificateNumber).toMatch(/^NTTF\//);
    await hodDetail.expectStatus('Ready to download');

    const adminDownload = await hodDetail.downloadCertificate();
    const adminBytes = await downloadedBytes(adminDownload);
    expect(pdfLooksValid(adminBytes)).toBe(true);
    expect(adminBytes.length).toBeGreaterThan(1_000);

    const verificationCode = await hodDetail.getVerificationCode();
    expect(verificationCode.length).toBeGreaterThanOrEqual(16);
    await hod.context.close();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/verify/${verificationCode}`);
    await expect(
      publicPage.getByRole('heading', { name: 'This certificate is valid' }),
    ).toBeVisible();
    await expect(publicPage.getByText(STUDENT.fullName).first()).toBeVisible();
    await expect(publicPage.getByText('Bonafide Certificate').first()).toBeVisible();
    await publicContext.close();

    const returningStudent = await openStudentSession(browser);
    await returningStudent.page.goto(`/student/requests/${requestId}`);
    const readyDetail = new StudentRequestDetailPage(returningStudent.page);
    await readyDetail.expectStatus('Ready to download');
    await expect(
      returningStudent.page.getByRole('heading', { name: 'Ready to download' }),
    ).toBeVisible();

    const studentDownload = await readyDetail.downloadCertificate();
    const studentBytes = await downloadedBytes(studentDownload);
    expect(pdfLooksValid(studentBytes)).toBe(true);
    expect(studentDownload.suggestedFilename()).toMatch(/certificate\.pdf$/);
    await expect(
      returningStudent.page
        .getByRole('list', { name: 'Request history' })
        .getByText('Certificate generated'),
    ).toBeVisible();
    await returningStudent.context.close();
  });

  test('a rejected request keeps its history and can be resubmitted', async ({ browser }) => {
    const keyword = `E2E-RESUBMIT-${Date.now()}`;
    const initialPurpose = `${keyword}: original purpose text for the rejected request.`;
    const correctedPurpose = `${keyword}: corrected purpose with the organisation and requirement.`;

    const student = await openStudentSession(browser);
    const studentDashboard = new StudentDashboardPage(student.page);
    await studentDashboard.expectLoaded();

    const newRequest = await studentDashboard.openNewRequest();
    await newRequest.chooseType('Leaving');
    await newRequest.fillPurpose(initialPurpose);
    const requestId = await newRequest.submit();

    const detail = new StudentRequestDetailPage(student.page);
    await detail.expectStatus('Submitted');
    await student.context.close();

    const hod = await openAdminSession(browser, HOD);
    await hod.page.goto(
      `/admin/requests?status=SUBMITTED&q=${encodeURIComponent(STUDENT.rollNumber)}`,
    );
    const queue = new AdminQueuePage(hod.page);
    const adminDetail = await queue.openRequestContaining(keyword);
    await adminDetail.expectStatus('Submitted');
    await adminDetail.reject(
      'The purpose is unclear. Name the organisation and explain why the certificate is required.',
    );
    await adminDetail.expectStatus('Rejected');
    await expect(hod.page.getByText(/The purpose is unclear/).first()).toBeVisible();
    await hod.context.close();

    const returningStudent = await openStudentSession(browser);
    await returningStudent.page.goto(`/student/requests/${requestId}`);
    const studentDetail = new StudentRequestDetailPage(returningStudent.page);
    await studentDetail.expectStatus('Rejected');
    await expect(
      returningStudent.page.getByText(/This request was rejected/).first(),
    ).toBeVisible();
    await expect(returningStudent.page.getByText(/The purpose is unclear/).first()).toBeVisible();

    await studentDetail.resubmit(correctedPurpose);
    await studentDetail.expectStatus('Submitted');
    await expect(returningStudent.page.getByText(correctedPurpose).first()).toBeVisible();

    const history = returningStudent.page.getByRole('list', { name: 'Request history' });
    await expect(history.getByText('Request submitted')).toHaveCount(2);
    await expect(history.getByText('Request rejected')).toHaveCount(1);
    await returningStudent.context.close();
  });
});
