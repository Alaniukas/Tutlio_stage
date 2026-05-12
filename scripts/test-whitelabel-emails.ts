/**
 * Test script: sends 12 representative email types to verify whitelabel branding.
 *
 * Prerequisites:
 *   1. Dev API server running: npm run dev:api  (port 3002)
 *   2. Run: npx tsx scripts/test-whitelabel-emails.ts
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const envText = readFileSync(envPath, 'utf-8');
const envMap = new Map<string, string>();
for (const line of envText.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx < 1 || line.startsWith('#')) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim();
  if (key) envMap.set(key, val);
}

const SERVICE_KEY = envMap.get('SUPABASE_SERVICE_ROLE_KEY') || '';
if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const API_BASE = `http://localhost:${process.env.TEST_API_PORT || envMap.get('DEV_API_PORT') || '3002'}`;
const TO = 'alaniukasa@gmail.com';
const ORG_ID = 'bfaa96e5-8e94-4e53-86ed-cd34e9c1e782';

const tomorrow = new Date(Date.now() + 86400000);
const dateStr = tomorrow.toISOString().slice(0, 10);
const timeStr = '14:00';

type EmailPayload = { type: string; to: string; data: Record<string, unknown> };

const emails: EmailPayload[] = [
  {
    type: 'booking_confirmation',
    to: TO,
    data: {
      organizationId: ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Test Korepetitorius',
      date: dateStr,
      time: timeStr,
      subject: 'Matematika',
      price: 25,
      duration: 60,
      cancellationHours: 24,
      cancellationFeePercent: 50,
      paymentStatus: 'pending',
    },
  },
  {
    type: 'session_reminder',
    to: TO,
    data: {
      organizationId: ORG_ID,
      recipientName: 'Test Mokinys',
      otherName: 'Test Korepetitorius',
      date: dateStr,
      time: timeStr,
      topic: 'Matematika',
      duration: 60,
      price: 25,
      isTutor: false,
    },
  },
  {
    type: 'session_cancelled',
    to: TO,
    data: {
      organizationId: ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Test Korepetitorius',
      date: dateStr,
      time: timeStr,
      cancelledBy: 'tutor',
      reason: 'Korepetitorius serga',
    },
  },
  {
    type: 'payment_reminder',
    to: TO,
    data: {
      organizationId: ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Test Korepetitorius',
      recipientName: 'Test Tėvai',
      date: dateStr,
      time: timeStr,
      price: 25,
      deadlineHours: 24,
      paymentTiming: 'before_lesson',
      paymentUrl: 'https://tutlio.lt',
    },
  },
  {
    type: 'payment_success',
    to: TO,
    data: {
      organizationId: ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Test Korepetitorius',
      date: dateStr,
      time: timeStr,
      subject: 'Matematika',
      price: 25,
      lessonPriceEur: 25,
      totalChargedEur: 25,
      duration: 60,
      cancellationHours: 24,
      cancellationFeePercent: 50,
    },
  },
  {
    type: 'invite_email',
    to: TO,
    data: {
      organizationId: ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Test Korepetitorius',
      inviteCode: 'TEST123',
      bookingUrl: 'https://tutlio.lt/book/TEST123',
    },
  },
  {
    type: 'lesson_rescheduled',
    to: TO,
    data: {
      organizationId: ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Test Korepetitorius',
      oldDate: dateStr,
      oldTime: '10:00–11:00',
      newDate: dateStr,
      newTime: '14:00–15:00',
      rescheduledBy: 'tutor',
      recipientRole: 'student',
    },
  },
  {
    type: 'monthly_invoice',
    to: TO,
    data: {
      organizationId: ORG_ID,
      recipientName: 'Test Tėvai',
      studentName: 'Test Mokinys',
      tutorName: 'Paskutine Pamoka',
      periodText: '2026-05-01 - 2026-05-31',
      sessions: [
        { date: '2026-05-05', time: '14:00', topic: 'Matematika', price: '25.00' },
        { date: '2026-05-12', time: '14:00', topic: 'Matematika', price: '25.00' },
      ],
      lessonsTotal: '50.00',
      totalAmount: '50.00',
      paymentDeadline: '2026-06-01 23:59',
      paymentLink: 'https://tutlio.lt',
    },
  },
  {
    type: 'prepaid_package_request',
    to: TO,
    data: {
      organizationId: ORG_ID,
      recipientName: 'Test Tėvai',
      studentName: 'Test Mokinys',
      tutorName: 'Paskutine Pamoka',
      subjectName: 'Matematika',
      totalLessons: 10,
      pricePerLesson: '25.00',
      totalPrice: '250.00',
      paymentLink: 'https://tutlio.lt',
    },
  },
  {
    type: 'chat_new_message',
    to: TO,
    data: {
      organizationId: ORG_ID,
      recipientName: 'Test Mokinys',
      senderName: 'Test Korepetitorius',
      preview: 'Sveiki, ar galėsite ateiti į pamoką rytoj?',
      messagesUrl: 'https://tutlio.lt/student/messages',
    },
  },
  {
    type: 'school_contract',
    to: TO,
    data: {
      organizationId: ORG_ID,
      schoolName: 'Paskutine Pamoka',
      schoolEmail: 'paskutine.pamoka@gmail.com',
      studentName: 'Test Mokinys',
      parentName: 'Test Tėvai',
      recipientName: 'Test Tėvai',
      contractNumber: 'TST-001',
      annualFee: 500,
      contractBody: '<p>Tai yra testinė sutartis whitelabel testavimui.</p>',
      date: dateStr,
    },
  },
  {
    type: 'school_installment_request',
    to: TO,
    data: {
      organizationId: ORG_ID,
      schoolName: 'Paskutine Pamoka',
      schoolEmail: 'paskutine.pamoka@gmail.com',
      studentName: 'Test Mokinys',
      parentName: 'Test Tėvai',
      recipientName: 'Test Tėvai',
      installmentNumber: 1,
      totalInstallments: 10,
      amount: '50.00',
      dueDate: dateStr,
      paymentUrl: 'https://tutlio.lt',
    },
  },
];

async function sendOne(payload: EmailPayload, index: number) {
  const label = `[${index + 1}/${emails.length}] ${payload.type}`;
  try {
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': SERVICE_KEY,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (res.ok) {
      console.log(`✓ ${label} — ${res.status}`);
    } else {
      console.error(`✗ ${label} — ${res.status}: ${body}`);
    }
  } catch (e: any) {
    console.error(`✗ ${label} — NETWORK ERROR: ${e.message}`);
  }
}

async function main() {
  console.log(`\nSending ${emails.length} whitelabel test emails to ${TO}`);
  console.log(`Organization: Paskutine Pamoka (${ORG_ID})`);
  console.log(`API: ${API_BASE}/api/send-email\n`);

  for (let i = 0; i < emails.length; i++) {
    await sendOne(emails[i], i);
    if (i < emails.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log('\nDone! Check alaniukasa@gmail.com for all 12 emails.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
