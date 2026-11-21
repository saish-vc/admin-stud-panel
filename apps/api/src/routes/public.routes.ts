import { Router } from 'express';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client.js';
import { certificateRequests, certificates, students } from '../db/schema.js';
import { errors, parseOrThrow } from '../lib/errors.js';
import { verificationCodeSchema } from '../lib/validation.js';
import { publicRateLimiter } from '../middleware/rate-limit.js';

export function createPublicRouter(db: AppDb): Router {
  const router = Router();
  const limiter = publicRateLimiter();

  router.get('/verify/:code', limiter, async (req, res) => {
    const { code } = parseOrThrow(verificationCodeSchema, req.params);
    const [row] = await db
      .select({
        certificateNumber: certificates.certificateNumber,
        certificateType: certificateRequests.certificateType,
        holderName: students.fullName,
        rollNumber: students.rollNumber,
        programme: students.programme,
        issuedAt: certificates.generatedAt,
      })
      .from(certificates)
      .innerJoin(certificateRequests, eq(certificateRequests.requestId, certificates.requestId))
      .innerJoin(students, eq(students.studentId, certificateRequests.studentId))
      .where(eq(certificates.verificationCode, code))
      .limit(1);

    if (!row) throw errors.notFound('No valid certificate matches this verification code.');

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      data: {
        valid: true,
        certificateNumber: row.certificateNumber,
        certificateType: row.certificateType,
        holderName: row.holderName,
        rollNumber: row.rollNumber,
        programme: row.programme,
        issuedAt: row.issuedAt.toISOString(),
      },
    });
  });

  return router;
}
