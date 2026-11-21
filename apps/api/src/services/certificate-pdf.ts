import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { CertificateType } from '../db/schema.js';

export interface CertificatePdfData {
  certificateNumber: string;
  certificateType: CertificateType;
  fullName: string;
  rollNumber: string;
  programme: string;
  batchYear: number;
  purpose: string;
  issueDate: Date;
  verificationUrl: string;
}

export interface GeneratedPdf {
  buffer: Buffer;
  sha256: string;
}

export function certificateTypeLabel(type: CertificateType): string {
  switch (type) {
    case 'BONAFIDE':
      return 'Bona Fide Certificate';
    case 'LC':
      return 'Leaving Certificate';
    case 'DIPLOMA':
      return 'Diploma Certificate';
  }
}

export function buildCertificateNumber(
  type: CertificateType,
  issueDate: Date,
  suffix: string,
): string {
  const year = issueDate.getUTCFullYear();
  return `NTTF/${type}/${year}/${suffix}`;
}

export function buildVerificationUrl(publicAppUrl: string, code: string): string {
  return `${publicAppUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(code)}`;
}

export function formatIssueDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

const NAVY = '#0b2b4b';
const GOLD = '#b8862d';
const INK = '#172a3a';
const MUTED = '#586b7a';

function drawField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, {
    width,
    characterSpacing: 1,
  });
  doc
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(12)
    .text(value, x, y + 14, { width });
}

export async function generateCertificatePdf(data: CertificatePdfData): Promise<GeneratedPdf> {
  const qrBuffer = await QRCode.toBuffer(data.verificationUrl, {
    type: 'png',
    width: 180,
    margin: 1,
    color: { dark: NAVY, light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  const document = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 36, bottom: 36, left: 36, right: 36 },
    info: {
      Title: `${certificateTypeLabel(data.certificateType)} — ${data.rollNumber}`,
      Author: 'Nettur Technical Training Foundation',
      Subject: `Certificate ${data.certificateNumber}`,
      CreationDate: data.issueDate,
    },
  });

  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));

  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  const pageWidth = document.page.width;
  const pageHeight = document.page.height;

  // Background and decorative frame.
  document.rect(0, 0, pageWidth, pageHeight).fill('#f7f2e7');
  document
    .lineWidth(2)
    .strokeColor(NAVY)
    .rect(28, 28, pageWidth - 56, pageHeight - 56)
    .stroke();
  document
    .lineWidth(0.8)
    .strokeColor(GOLD)
    .rect(36, 36, pageWidth - 72, pageHeight - 72)
    .stroke();

  document
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(25)
    .text('NETTUR TECHNICAL TRAINING FOUNDATION', 58, 58, {
      width: pageWidth - 116,
      align: 'center',
      characterSpacing: 0.6,
    });
  document
    .fillColor(GOLD)
    .font('Helvetica')
    .fontSize(9)
    .text('Skill · Knowledge · Character  |  Established 1961', {
      width: pageWidth - 116,
      align: 'center',
    });

  document
    .moveTo(pageWidth / 2 - 85, 112)
    .lineTo(pageWidth / 2 + 85, 112)
    .lineWidth(1)
    .strokeColor(GOLD)
    .stroke();

  document
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(certificateTypeLabel(data.certificateType), 58, 128, {
      width: pageWidth - 116,
      align: 'center',
    });

  document
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(12)
    .text('This is to certify that', { width: pageWidth - 116, align: 'center' });

  document
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(data.fullName, 90, 196, { width: pageWidth - 180, align: 'center' });

  document
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(12)
    .text(
      `bearing roll number ${data.rollNumber}, was a student of the ${data.programme} (Batch ${data.batchYear}) at NTTF.`,
      100,
      238,
      { width: pageWidth - 200, align: 'center', lineGap: 3 },
    );

  document
    .fontSize(11)
    .fillColor(INK)
    .text(
      `This certificate is issued upon the student's request for the purpose of: ${data.purpose}`,
      110,
      290,
      { width: pageWidth - 220, align: 'center', lineGap: 2 },
    );

  const fieldY = 350;
  drawField(document, 'Certificate number', data.certificateNumber, 58, fieldY, 250);
  drawField(document, 'Roll number', data.rollNumber, 330, fieldY, 180);
  drawField(document, 'Programme', data.programme, 530, fieldY, 240);
  drawField(document, 'Date of issue', formatIssueDate(data.issueDate), 58, fieldY + 54, 250);
  drawField(document, 'Batch', String(data.batchYear), 330, fieldY + 54, 180);

  // QR verification.
  const qrX = pageWidth - 172;
  const qrY = 332;
  document.image(qrBuffer, qrX, qrY, { width: 92, height: 92 });
  document
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .text('SCAN TO VERIFY', qrX - 4, qrY + 95, {
      width: 100,
      align: 'center',
      characterSpacing: 0.8,
    });

  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text(
      'This digitally generated certificate can be validated at the NTTF Student Certificate Portal using the QR code or certificate number. Any alteration renders this document invalid.',
      58,
      pageHeight - 98,
      { width: pageWidth - 220, lineGap: 2 },
    );
  document
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('REGISTRAR / AUTHORISED SIGNATORY', pageWidth - 248, pageHeight - 90, {
      width: 190,
      align: 'center',
    });
  document
    .moveTo(pageWidth - 238, pageHeight - 105)
    .lineTo(pageWidth - 68, pageHeight - 105)
    .lineWidth(0.7)
    .strokeColor(MUTED)
    .stroke();

  document.end();
  const buffer = await completed;
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return { buffer, sha256 };
}
