import { fakerEN_IN as faker } from '@faker-js/faker';
import { count, inArray } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { adminUsers, studentCredentials, students, type StudentStatus } from '../src/db/schema.js';
import { hashPassword, hashPasswords } from '../src/lib/password.js';

const PROGRAMMES = [
  'Diploma in Mechanical Engineering',
  'Diploma in Electronics & Communication Engineering',
  'Diploma in Information Technology',
  'Diploma in Mechatronics Engineering',
] as const;

const STAFF = [
  { name: 'NTTF Verification Clerk', email: 'clerk@nttf.ac.in', role: 'CLERK' as const },
  { name: 'NTTF Head of Department', email: 'hod@nttf.ac.in', role: 'HOD' as const },
  {
    name: 'NTTF Super Administrator',
    email: 'superadmin@nttf.ac.in',
    role: 'SUPER_ADMIN' as const,
  },
];

const CHUNK_SIZE = 150;
const BATCH_YEARS = [2022, 2023, 2024, 2025, 2026] as const;

function formatDobPassword(dateOfBirth: string): string {
  const [year, month, day] = dateOfBirth.split('-');
  if (!year || !month || !day) throw new Error(`Invalid generated DOB: ${dateOfBirth}`);
  return `${day}${month}${year}`;
}

function emailFor(firstName: string, lastName: string, index: number): string {
  const normalise = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[^A-Za-z]/g, '')
      .toLowerCase();
  return `${normalise(firstName)}.${normalise(lastName)}.${String(index).padStart(4, '0')}@students.nttf.ac.in`;
}

function makeRollNumber(sequence: number): string {
  return `NTTF${String(20260000 + sequence).padStart(8, '0')}`;
}

function makePhone(): string {
  const first = String(faker.number.int({ min: 6, max: 9 }));
  const rest = faker.string.numeric({ length: 9 });
  return `${first}${rest}`;
}

function makeStudent(sequence: number) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const batchYear = faker.helpers.arrayElement([...BATCH_YEARS]);
  const programme = faker.helpers.arrayElement([...PROGRAMMES]);
  const dobDate = faker.date.birthdate({ min: 18, max: 24, mode: 'age' });
  const dateOfBirth = dobDate.toISOString().slice(0, 10);
  const statusRoll = faker.number.int({ min: 1, max: 100 });
  const status: StudentStatus =
    statusRoll <= 82 ? 'ACTIVE' : statusRoll <= 93 ? 'GRADUATED' : 'DROPPED';
  return {
    rollNumber: makeRollNumber(sequence),
    fullName: `${firstName} ${lastName}`.slice(0, 100),
    dateOfBirth,
    email: emailFor(firstName, lastName, sequence),
    phone: makePhone(),
    programme,
    batchYear,
    currentSemester:
      status === 'DROPPED'
        ? faker.number.int({ min: 1, max: 4 })
        : status === 'GRADUATED'
          ? 8
          : faker.number.int({ min: 1, max: 8 }),
    status,
    initialPassword: formatDobPassword(dateOfBirth),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.isProduction && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Refusing to seed production. Set ALLOW_PRODUCTION_SEED=true only through the approved runbook.',
    );
  }
  if (!config.seed.adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD is required for seeding (minimum 12 characters).');
  }

  const targetStudents = config.seed.studentCount;
  const pool = createPool(config.databaseUrl);
  const db = createDb(pool);

  try {
    faker.seed(2601);

    const existingStudents = await db
      .select({ rollNumber: students.rollNumber, email: students.email })
      .from(students);
    const existingRolls = new Set(existingStudents.map((row) => row.rollNumber));
    const existingEmails = new Set(existingStudents.map((row) => row.email.toLowerCase()));
    const rollNumbers = new Set(existingRolls);
    const emails = new Set(existingEmails);

    const generated: ReturnType<typeof makeStudent>[] = [];
    let sequence = 1;
    let attempts = 0;

    while (existingStudents.length + generated.length < targetStudents) {
      attempts += 1;
      if (attempts > targetStudents * 10 + 10_000) {
        throw new Error('Could not generate enough unique students; check existing data.');
      }
      const candidate = makeStudent(sequence);
      sequence += 1;
      if (rollNumbers.has(candidate.rollNumber) || emails.has(candidate.email.toLowerCase())) {
        continue;
      }
      rollNumbers.add(candidate.rollNumber);
      emails.add(candidate.email.toLowerCase());
      generated.push(candidate);
    }

    // Duplicate pre-check is complete before any database write.
    if (rollNumbers.size !== existingRolls.size + generated.length) {
      throw new Error('In-memory duplicate roll-number check failed.');
    }

    console.info('[db:seed] hashing temporary passwords with bcrypt', {
      students: generated.length,
      cost: config.bcryptCost,
    });
    const passwordHashes = await hashPasswords(
      generated.map((student) => student.initialPassword),
      config.bcryptCost,
      6,
    );

    const staffPasswordHash = await hashPassword(config.seed.adminPassword, config.bcryptCost);

    let staffCreated = 0;
    let sampleStudent: (typeof generated)[number] | undefined;

    await db.transaction(async (tx) => {
      for (const staff of STAFF) {
        const inserted = await tx
          .insert(adminUsers)
          .values({
            name: staff.name,
            email: staff.email,
            passwordHash: staffPasswordHash,
            role: staff.role,
            isActive: true,
            mustChangePassword: config.seed.forcePasswordChange,
          })
          .onConflictDoNothing({ target: adminUsers.email })
          .returning({ adminId: adminUsers.adminId });
        staffCreated += inserted.length;
      }

      for (let start = 0; start < generated.length; start += CHUNK_SIZE) {
        const chunk = generated.slice(start, start + CHUNK_SIZE);
        const inserted = await tx
          .insert(students)
          .values(
            chunk.map((student) => ({
              rollNumber: student.rollNumber,
              fullName: student.fullName,
              dateOfBirth: student.dateOfBirth,
              email: student.email,
              phone: student.phone,
              programme: student.programme,
              batchYear: student.batchYear,
              currentSemester: student.currentSemester,
              status: student.status,
            })),
          )
          .returning({ studentId: students.studentId, rollNumber: students.rollNumber });

        const byRoll = new Map(inserted.map((row) => [row.rollNumber, row.studentId]));
        const credentialRows = chunk.flatMap((student, chunkIndex) => {
          const studentId = byRoll.get(student.rollNumber);
          const passwordHash = passwordHashes[start + chunkIndex];
          if (!studentId || !passwordHash) return [];
          return [
            {
              studentId,
              passwordHash,
              mustChangePassword: config.seed.forcePasswordChange,
            },
          ];
        });
        await tx.insert(studentCredentials).values(credentialRows);
        if (!sampleStudent) {
          sampleStudent = chunk[0];
        }
        console.info('[db:seed] inserted student chunk', {
          offset: start,
          size: inserted.length,
        });
      }
    });

    const [total] = await db.select({ value: count() }).from(students);
    const totalStudents = Number(total?.value ?? 0);
    if (totalStudents < 1000) {
      throw new Error(`Seed integrity check failed: only ${totalStudents} students exist.`);
    }

    const seededAdminRoles = await db
      .select({ email: adminUsers.email, role: adminUsers.role })
      .from(adminUsers)
      .where(inArray(adminUsers.role, ['CLERK', 'HOD', 'SUPER_ADMIN']));

    console.info('[db:seed] complete', {
      totalStudents,
      newlyInserted: generated.length,
      staffCreated,
      configuredStaffRoles: seededAdminRoles.map((row) => `${row.email}:${row.role}`),
      forcePasswordChange: config.seed.forcePasswordChange,
    });

    if (sampleStudent) {
      console.info('[db:seed] sample student login (change on first login)', {
        rollNumber: sampleStudent.rollNumber,
        password: sampleStudent.initialPassword,
        email: sampleStudent.email,
        fullName: sampleStudent.fullName,
      });
    }
    console.info('[db:seed] staff login identifiers', {
      clerk: 'clerk@nttf.ac.in',
      hod: 'hod@nttf.ac.in',
      superAdmin: 'superadmin@nttf.ac.in',
      password: 'SEED_ADMIN_PASSWORD (existing staff credentials are not overwritten)',
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db:seed] failed', error);
  process.exitCode = 1;
});
