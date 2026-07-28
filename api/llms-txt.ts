import type { VercelRequest, VercelResponse } from './types';
import { TUTOR_PLANS, eur } from '../src/lib/pricing.js';
import { SUBSCRIPTION_PLN } from '../src/lib/subscriptionPricing.js';
import { formatPln } from '../src/lib/formatPln.js';
import { detectDomain, type DomainKey } from './_lib/seo-routing.js';
import { FEATURE_PAGES } from '../src/lib/featurePages.js';

function pricingBlock(isPl: boolean): string {
  if (isPl) {
    return `- **Monthly**: ${formatPln(SUBSCRIPTION_PLN.monthly)}/month
- **Yearly**: ${formatPln(SUBSCRIPTION_PLN.yearlyPerMonth)}/month (${formatPln(SUBSCRIPTION_PLN.yearlyTotal)} billed annually)
- **Subscription Only**: ${formatPln(SUBSCRIPTION_PLN.subscriptionOnly)}/month (manual payment tracking instead of Stripe collection — no commission on student payments)`;
  }
  return `- **Monthly**: ${eur(TUTOR_PLANS.monthly.pricePerMonthEur)}/month
- **Yearly**: ${eur(TUTOR_PLANS.yearly.pricePerMonthEur)}/month (${eur(TUTOR_PLANS.yearly.pricePerYearEur)} billed annually)
- **Subscription Only**: ${eur(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur)}/month (manual payment tracking instead of Stripe collection — no commission on student payments)`;
}

function featureLinks(base: string): string {
  return Object.entries(FEATURE_PAGES)
    .map(([id, f]) => `- ${id}: ${base}${f.path}`)
    .join('\n');
}

function buildLlmsTxt(domain: DomainKey): string {
  const isPl = domain === 'pl';
  const isLt = domain === 'lt';
  const base = isPl ? 'https://www.tutlio.pl' : isLt ? 'https://www.tutlio.lt' : 'https://www.tutlio.com';

  if (isLt) {
    return `# Tutlio

> Tutlio — korepetitorių ir korepetavimo mokyklų valdymo platforma Lietuvoje. Automatizuoja tvarkaraštį, mokėjimus, mokinių valdymą ir komunikaciją.

## Kas yra Tutlio

Tutlio pakeičia Excel, WhatsApp ir išskaidytus įrankius viena platforma. Korepetitoriai nustato prieinamumą, mokiniai rezervuoja pamokas patys. Sistema tvarko priminimus, mokėjimus, atšaukimus, laukimo eilę ir finansų sekimą.

## Pagrindinės funkcijos

- **Išmanusis kalendorius**: savarankiškas užsakymas, pasikartojančios pamokos, grupinės pamokos
- **Mokinių laukimo eilė**: atšaukus pamoką, laisva vieta automatiškai siūloma eilėje esantiems mokiniams
- **Stripe mokėjimai**: kortelių mokėjimai, sąskaitos, paketai, mėnesinės ataskaitos
- **Automatiniai priminimai**: el. paštas prieš ir po pamokų, vėluojantys mokėjimai
- **Mokinių ir tėvų portalai**: tvarkaraštis, mokėjimai, žinutės
- **Mokyklų režimas**: keli mokytojai, sutartys, GoSign e-pasirašymas, įmokų planai
- **12 kalbų**: LT, EN, PL ir dar 9 rinkos

## Funkcijų puslapiai

${featureLinks(base)}
- Visos funkcijos (hub): ${base}/features

## Kainodara

${pricingBlock(false)}

- 7 dienų nemokamas bandomasis laikotarpis

## Nuorodos

- Svetainė: https://www.tutlio.lt
- Tarptautinė: https://www.tutlio.com
- Mokykloms: https://www.tutlio.lt/schools
- Tinklaraštis: https://www.tutlio.lt/blog
- RSS: https://www.tutlio.lt/blog/rss.xml
- Kainos: https://www.tutlio.lt/pricing
- Kontaktai: info@tutlio.lt

## Kam skirta

- Privatūs korepetitoriai (bet koks dalykas)
- Korepetavimo mokyklos ir švietimo centrai
- Kalbų, muzikos, matematikos mokyklos
- Lietuvoje ieškantiems: korepetitorių platforma, pamokų tvarkaraštis online, mokinių laukimo eilė

## Techninė informacija

- Web aplikacija + PWA
- Stripe, Google Calendar, GoSign integracijos
- GDPR, duomenys ES
`;
  }

  return `# Tutlio

> Tutlio is tutoring management software for private tutors and tutoring schools. It automates scheduling, payments, student management, and communication so tutors can focus on teaching.

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
- **Tutoring School Mode**: Manage multiple tutors, students, subjects, and groups under one organization.
- **Multi-language**: Available in 12 languages — Lithuanian, English, Polish, Latvian, Estonian, French, Spanish, German, Swedish, Danish, Finnish, Norwegian.

## Feature Pages

${featureLinks(base)}
- All features (hub): ${base}/features

## Pricing

All plans include every feature. Pricing is per-tutor, not per-student — unlimited students on all plans.

${pricingBlock(isPl)}
- All plans include a 7-day free trial (applied automatically at checkout)

## Links

- Website: https://www.tutlio.com
- Website (Lithuania): https://www.tutlio.lt
- Website (Poland): https://www.tutlio.pl
- For Schools: ${base}/schools
- Blog: ${base}/blog
- Blog RSS feed: ${base}/blog/rss.xml
- Pricing: ${base}/pricing
- About: ${base}/about
- Contact: info@tutlio.lt

## Target Users

- Private tutors (any subject)
- Music teachers and instrument instructors
- Language tutors
- Math and science tutors
- Tutoring schools and education centers
- After-school program coordinators
- Users searching for: tutor management software, lesson scheduling software, tutoring business platform, tutoring school management

## Technical Details

- Web application (works on desktop, tablet, mobile)
- Installable as PWA (Progressive Web App)
- Hosted on Vercel, database on Supabase
- Stripe integration for payments
- GDPR compliant, data stored in EU
`;
}

const LLMS_FULL_SUFFIX = `
## Detailed Feature Breakdown

### Smart Calendar
Tutors define their weekly availability by setting time slots for each day. Students visit the tutor's booking page and select an available slot. The calendar supports:
- One-time and recurring lessons
- Multiple subjects with different durations and prices
- Configurable break times between lessons
- Booking deadlines (e.g., must book 24h in advance)
- Visual color coding per subject

### Student Waitlist
The waitlist is Tutlio's signature feature. When a student cancels a lesson, the freed time slot is automatically offered to students on the waitlist who expressed interest in that time. This dramatically reduces no-shows and lost revenue.

### Payments & Finance
- Stripe-powered card payments with 3D Secure
- Per-student payment tracking (paid, pending, overdue)
- Monthly revenue summaries and financial reports
- Lesson package support (buy 10 lessons at a discount)
- Automatic payment reminders for overdue invoices
- Invoice generation with PDF export

### Tutoring School Features
- Multi-tutor management under one organization
- Admin dashboard with overview of all tutors and students
- Contract templates and e-signing (GoSign in Lithuania)
- Installment payment plans on school contracts
- Custom branding (white-label support)
- Role-based access (admin, tutor, student, parent)

## Company Information

- **Product**: Tutlio
- **Type**: SaaS (Software as a Service)
- **Founded**: Lithuania
- **Contact**: info@tutlio.lt
- **Domains**: tutlio.com (international), tutlio.lt (Lithuania), tutlio.pl (Poland)
- **Languages**: Lithuanian, English, Polish, Latvian, Estonian, French, Spanish, German, Swedish, Danish, Finnish, Norwegian
`;

export default function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const isFull = (req.url || '').includes('llms-full');
  const body = buildLlmsTxt(domain) + (isFull ? LLMS_FULL_SUFFIX : '');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(body.trim() + '\n');
}
