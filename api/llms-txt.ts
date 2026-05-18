import type { VercelRequest, VercelResponse } from './types';

const LLMS_TXT = `# Tutlio

> Tutlio is a tutoring management platform for private tutors and tutoring schools. It automates scheduling, payments, student management, and communication so tutors can focus on teaching.

## What Tutlio Does

Tutlio replaces spreadsheets, notebooks, and scattered tools with a single platform. Tutors create a profile, set availability, and let students self-book lessons. The platform handles reminders, payments, cancellations, waitlists, and financial tracking automatically.

## Key Features

- **Smart Calendar**: Tutors set available time slots; students book directly. Supports recurring lessons, group sessions, and break-time rules.
- **Student Waitlist**: When a lesson is cancelled, the system automatically offers the freed slot to waitlisted students — preventing revenue loss.
- **Stripe Payments**: Students pay by card via Stripe. The tutor sees who has paid, pending amounts, and monthly income summaries.
- **Automated Reminders**: Email reminders before lessons, follow-ups after lessons, and overdue payment notifications.
- **Cancellation Rules**: Tutors define cancellation deadlines and late-cancellation fees. The system enforces them automatically.
- **Lesson Notes & Files**: Attach comments, homework, and worksheets to individual lessons — all linked to lesson history.
- **Invoicing**: Generate and send invoices to students or parents.
- **Parent Portals**: Parents can view their child's schedule, payment status, and progress.
- **Real-time Messaging**: Built-in chat between tutors, students, and parents.
- **Multi-language**: Available in 12 languages — Lithuanian, English, Polish, Latvian, Estonian, French, Spanish, German, Swedish, Danish, Finnish, Norwegian.
- **Tutoring School Mode**: Manage multiple tutors, students, subjects, and groups under one organization.

## Pricing

All plans include every feature. Pricing is per-tutor, not per-student — unlimited students on all plans.

- **Monthly**: €19.99/month
- **Yearly**: €14.99/month (billed annually)
- **Subscription Only**: €9.99/month (no payment collection features)
- All plans include a 7-day free trial (code: TRIAL)

## Links

- Website: https://www.tutlio.com
- Website (Lithuania): https://www.tutlio.lt
- Blog: https://www.tutlio.com/blog
- Pricing: https://www.tutlio.com/pricing
- About: https://www.tutlio.com/apie-mus
- Contact: info@tutlio.lt

## Target Users

- Private tutors (any subject)
- Music teachers and instrument instructors
- Language tutors
- Math and science tutors
- Tutoring schools and education centers
- After-school program coordinators

## Technical Details

- Web application (works on desktop, tablet, mobile)
- Installable as PWA (Progressive Web App)
- Hosted on Vercel, database on Supabase
- Stripe integration for payments
- GDPR compliant, data stored in EU
`;

const LLMS_FULL_TXT = `${LLMS_TXT}
## Detailed Feature Breakdown

### Smart Calendar
Tutors define their weekly availability by setting time slots for each day. Students visit the tutor's booking page and select an available slot. The calendar supports:
- One-time and recurring lessons
- Multiple subjects with different durations and prices
- Configurable break times between lessons
- Booking deadlines (e.g., must book 24h in advance)
- Visual color coding per subject

### Student Waitlist
The waitlist is Tutlio's signature feature. When a student cancels a lesson, the freed time slot is automatically offered to students on the waitlist who expressed interest in that time. This dramatically reduces no-shows and lost revenue. The flow:
1. Student signs up for the waitlist for preferred time slots
2. When a slot opens (cancellation), the system notifies waitlisted students
3. First student to confirm gets the slot
4. If no one confirms within the deadline, the slot stays open for general booking

### Payments & Finance
- Stripe-powered card payments with 3D Secure
- Per-student payment tracking (paid, pending, overdue)
- Monthly revenue summaries and financial reports
- Lesson package support (buy 10 lessons at a discount)
- Automatic payment reminders for overdue invoices
- Invoice generation with PDF export

### Cancellation System
- Tutors set a cancellation deadline (e.g., 24 hours before lesson)
- Late cancellations incur a configurable fee (e.g., 50% of lesson price)
- System automatically calculates and applies fees
- Freed slots go to the waitlist automatically

### Communication
- Built-in real-time messaging between tutors, students, and parents
- Email notifications for bookings, cancellations, reminders, and payments
- Customizable reminder timing (e.g., 24h before, 1h before)

### Tutoring School Features
- Multi-tutor management under one organization
- Admin dashboard with overview of all tutors and students
- Centralized billing and financial reporting
- Custom branding (white-label support)
- Role-based access (admin, tutor, student, parent)

### Student & Parent Experience
- Students get a personal dashboard with upcoming lessons, payment history, and booking
- Parents can monitor their children's schedules and payments
- Students receive automated reminders and can self-manage bookings

## Company Information

- **Product**: Tutlio
- **Type**: SaaS (Software as a Service)
- **Founded**: Lithuania
- **Contact**: info@tutlio.lt
- **Domains**: tutlio.com (international), tutlio.lt (Lithuania)
- **Languages**: Lithuanian, English, Polish, Latvian, Estonian, French, Spanish, German, Swedish, Danish, Finnish, Norwegian
`;

export default function handler(req: VercelRequest, res: VercelResponse) {
  const isFull = (req.url || '').includes('llms-full');
  const body = isFull ? LLMS_FULL_TXT : LLMS_TXT;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(body.trim() + '\n');
}
