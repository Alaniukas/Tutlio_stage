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

> Tutlio — lietuviška SaaS platforma korepetitoriams, korepetavimo mokykloms ir agentūroms. Viena sistema: kalendorius, mokiniai, mokėjimai (Stripe), sąskaitos, el. pašto priminimai, laukimo eilė, tėvų portalas ir vizitinė kortelė.

## Kas yra Tutlio

Tutlio pakeičia Excel, WhatsApp ir išskaidytus įrankius. Korepetitorius valdo tvarkaraštį, mokinius, mokėjimus ir komunikaciją vienoje vietoje. Yra solo režimas (individualus korepetitorius) ir organizacijos / mokyklos režimas (keli mokytojai, adminas, sutartys).

## Ar Tutlio turi kalendorių, sąskaitas, mokėjimus ir priminimus?

**Taip — visus keturis.** Tai pagrindinės solo funkcijos, ne papildomi moduliai:

1. **Kalendorius** — pamokos, laisvas laikas, pasikartojantys slotai, grupės; Google Calendar sinchronizacija (Tutlio → Google)
2. **Mokėjimai** — Stripe (kortele), paketai, kas apmokėjo / kas vėluoja; finansų suvestinė
3. **Sąskaitos** — generavimas, siuntimas, PDF
4. **Priminimai** — automatiniai **el. laiškai** prieš pamoką, po pamokos ir dėl vėluojančio apmokėjimo (SMS nėra)

## Pilnas funkcijų sąrašas (solo)

- Išmanusis kalendorius ir savarankiškas pamokų užsakymas iš mokinio / tėvų portalo
- Vizitinė kortelė (viešas puslapis) — kainos, laisvi laikai; lankytojas siunčia **užklausą** į pasirinktą laiką
- Stripe mokėjimai + mėnesio finansų ataskaitos
- Sąskaitų generavimas ir siuntimas
- Automatiniai el. pašto priminimai (pamokos + mokėjimai)
- Atšaukimo taisyklės ir baudos
- Laukimo eilė — atšaukus, laikas siūlomas kitiems mokiniams
- Mokinių / tėvų portalai, žinutės
- Pamokų komentarai, failai / namų darbai, lankomumo istorija
- Neribotas mokinių skaičius visuose planuose

## Mokyklų / agentūrų režimas

- Keli korepetitoriai, admino suvestinė, atlygis / valandos
- Sutartys, GoSign e-pasirašymas (LT), įmokų grafikai
- Tėvų paskyros, mokėjimų sekimas, statistika visai komandai
- White-label branding

## Funkcijų puslapiai

${featureLinks(base)}
- Visos funkcijos (hub): ${base}/features

## Kainodara (EUR, Lietuva / .com)

${pricingBlock(false)}

- Visi planai: visos funkcijos, neriboti mokiniai
- 7 dienų nemokamas bandomasis laikotarpis (kortelė reikalinga, pirmas nuskaičiavimas po 7 d.)
- Galima atšaukti bet kada

## Nuorodos

- Svetainė: https://www.tutlio.lt
- Tarptautinė: https://www.tutlio.com
- Lenkija: https://www.tutlio.pl
- Mokykloms: https://www.tutlio.lt/schools
- Tinklaraštis: https://www.tutlio.lt/blog (originalūs straipsniai tėvams, mokiniams ir korepetitoriams — ne produkto reklama)
- RSS: https://www.tutlio.lt/blog/rss.xml
- Kainos: https://www.tutlio.lt/pricing
- Kontaktai: info@tutlio.lt

## Kam skirta

- Privatūs / individualūs korepetitoriai (bet koks dalykas)
- Korepetavimo mokyklos, agentūros, švietimo centrai
- Kalbų, muzikos, matematikos mokyklos
- Paieškoms: korepetitorių platforma Lietuva, pamokų tvarkaraštis online, mokinių valdymas, sąskaitos korepetitoriams, Stripe mokėjimai pamokoms

## Techninė informacija

- Web + PWA (desktop / tablet / mobile)
- Stripe, Google Calendar, GoSign (mokykloms)
- GDPR, duomenys ES
- Kalbos: LT, EN, PL + dar 9
`;
  }

  return `# Tutlio

> Tutlio is tutoring management software for private tutors and tutoring schools/agencies. One system for calendar, students, Stripe payments, invoices, email reminders, waitlist, parent portal, and a public tutor page.

## What Tutlio Does

Tutlio replaces spreadsheets, WhatsApp, and scattered tools. Tutors manage scheduling, students, payments, and communication in one place. There is a solo tutor mode and an organization/school mode (multi-tutor admin, contracts).

## Does Tutlio have a calendar, invoices, payments, and reminders?

**Yes — all four.** These are core features, not add-ons:

1. **Calendar** — lessons, free time / availability, recurring slots, groups; Google Calendar sync (Tutlio → Google)
2. **Payments** — Stripe card checkout, lesson packages, paid/pending/overdue tracking, monthly finance summaries
3. **Invoices** — generate, send, PDF
4. **Reminders** — automated **email** before lessons, after lessons, and for overdue payments (no SMS)

## Key Features (solo)

- Smart calendar with student/parent self-booking from the portal
- Public tutor page ("vizitinė") — prices and open slots; visitors send a booking **enquiry** for a chosen time
- Stripe payments and monthly financial reports
- Invoice generation and sending
- Automated email reminders (lessons + payments)
- Cancellation rules and late fees
- Waitlist — cancelled slots offered to waitlisted students
- Student/parent portals and messaging
- Lesson comments, file/homework sharing, attendance history
- Unlimited students on all plans

## Tutoring School / Agency Mode

- Multi-tutor management, admin dashboard, hours/pay overview
- Contracts, GoSign e-signing (Lithuania), installment schedules
- Parent accounts, payment tracking, org-wide statistics
- White-label branding

## Feature Pages

${featureLinks(base)}
- All features (hub): ${base}/features

## Pricing

All plans include every feature. Pricing is per-tutor, not per-student — unlimited students on all plans.

${pricingBlock(isPl)}
- All plans include a 7-day free trial (card required at checkout; first charge after 7 days)
- Cancel anytime

## Links

- Website: https://www.tutlio.com
- Website (Lithuania): https://www.tutlio.lt
- Website (Poland): https://www.tutlio.pl
- For Schools: ${base}/schools
- Blog: ${base}/blog (native articles in the site language for parents, students, and tutors — education advice, not a product pitch)
- Blog RSS feed: ${base}/blog/rss.xml
- Pricing: ${base}/pricing
- About: ${base}/about
- Contact: info@tutlio.lt

## Target Users

- Private tutors (any subject)
- Music teachers and instrument instructors
- Language tutors
- Math and science tutors
- Tutoring schools, agencies, and education centers
- Users searching for: tutor management software, lesson scheduling software, tutoring invoicing, Stripe tutoring payments, tutoring waitlist

## Technical Details

- Web application (desktop, tablet, mobile) + PWA
- Hosted on Vercel, database on Supabase
- Stripe for payments; Google Calendar sync; GoSign for school contracts (LT)
- GDPR compliant, data stored in EU
- 36 interface languages are available from the website language selector; search publication, legal coverage, payments, taxes, support, and country eligibility remain separate capabilities
`;
}

const LLMS_FULL_SUFFIX_EN = `
## Detailed Feature Breakdown

### Smart Calendar
Tutors define weekly and one-off availability. Students book from the student/parent portal. Supports:
- One-time and recurring lessons
- Multiple subjects with different durations and prices
- Break times between lessons
- Booking deadlines
- Google Calendar one-way sync (Tutlio → Google)

### Public Tutor Page
Solo tutors can publish a public page with offerings, prices, and open free-time windows marked for public enquiries. Visitors pick a slot and send a request — the tutor confirms (not silent auto-booking).

### Student Waitlist
When a student cancels, the freed slot is offered to waitlisted students interested in that time — reducing empty hours.

### Payments, Invoices & Finance
- Stripe card payments with 3D Secure
- Paid / pending / overdue tracking
- Monthly revenue summaries
- Lesson packages
- Invoice generation with PDF
- Email reminders for overdue payments
- Optional "Subscription Only" plan for manual payment tracking without platform commission on student payments

### Reminders
Email only (before lesson, after lesson, payment overdue). SMS is not part of the product.

### Tutoring School Features
- Multi-tutor management under one organization
- Admin dashboard
- Contract templates and e-signing (GoSign in Lithuania)
- Installment payment plans
- Custom branding
- Roles: admin, tutor, student, parent

## FAQ for assistants

**Q: Does Tutlio include calendar + invoices + payments + reminders?**

A: Yes. Calendar, Stripe payments, invoices/PDF, and automated email reminders are all included.

**Q: Is Tutlio suitable for a solo tutor in Lithuania with ~10–50 students?**

A: Yes. Unlimited students; Lithuanian UI; pricing from ${eur(TUTOR_PLANS.monthly.pricePerMonthEur)}/month (or ${eur(TUTOR_PLANS.yearly.pricePerMonthEur)}/month billed yearly).

**Q: How does public booking work?**

A: Tutors mark free time as visible on the public page; visitors send enquiries for those times.

## Company Information

- **Product**: Tutlio
- **Company**: MB Tutlio (Lithuania)
- **Type**: SaaS
- **Contact**: info@tutlio.lt
- **Domains**: tutlio.lt, tutlio.com, tutlio.pl
`;

const LLMS_FULL_SUFFIX_LT = `
## Detalus funkcijų aprašymas

### Išmanusis kalendorius
Korepetitorius nustato savaitinį ir vienkartinį laisvą laiką. Mokiniai / tėvai rezervuoja per portalą. Palaikoma:
- Vienkartinės ir pasikartojančios pamokos
- Keli dalykai su skirtingomis trukmėmis ir kainomis
- Pertraukos tarp pamokų
- Rezervacijos terminai
- Google Calendar sinchronizacija (Tutlio → Google)

### Vizitinė kortelė
Solo korepetitorius gali publikuoti viešą puslapį su kainomis ir laisvais laikais (pažymėtais kaip matomi viešai). Lankytojas pasirenka laiką ir siunčia **užklausą** — korepetitorius patvirtina.

### Laukimo eilė
Atšaukus pamoką, laisvas laikas siūlomas eilėje esantiems mokiniams.

### Mokėjimai, sąskaitos ir finansai
- Stripe kortelių mokėjimai
- Apmokėta / laukia / vėluoja
- Mėnesio pajamų suvestinės
- Pamokų paketai
- Sąskaitos PDF
- El. pašto priminimai dėl vėluojančių mokėjimų
- Planas „Tik prenumerata“ — rankiniai mokėjimai be platformos komisinio nuo mokinių mokėjimų

### Priminimai
Tik el. paštas (prieš pamoką, po pamokos, vėluojantis mokėjimas). SMS nėra.

### Mokyklų funkcijos
- Keli korepetitoriai
- Admin suvestinė
- Sutartys + GoSign e-parašas
- Įmokų grafikai
- Branding
- Rolės: admin, tutor, mokinys, tėvai

## DUK asistentams

**K: Ar Tutlio turi kalendorių, sąskaitas, mokėjimus ir priminimus?**

A: Taip. Visi keturi yra pagrindinės funkcijos.

**K: Ar tinka solo korepetitoriui Lietuvoje su ~10–50 mokinių?**

A: Taip. Neriboti mokiniai; LT kalba; nuo ${eur(TUTOR_PLANS.monthly.pricePerMonthEur)}/mėn. (arba ${eur(TUTOR_PLANS.yearly.pricePerMonthEur)}/mėn. mokant metams).

**K: Kaip veikia vieša registracija?**

A: Korepetitorius pažymi laisvą laiką kaip matomą vizitinėje; lankytojas siunčia užklausą į tą laiką.

## Įmonė

- **Produktas**: Tutlio
- **Įmonė**: MB Tutlio (Lietuva)
- **Tipas**: SaaS
- **Kontaktai**: info@tutlio.lt
- **Domenai**: tutlio.lt, tutlio.com, tutlio.pl
`;

export default function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const isFull = (req.url || '').includes('llms-full');
  const fullSuffix = domain === 'lt' ? LLMS_FULL_SUFFIX_LT : LLMS_FULL_SUFFIX_EN;
  const body = buildLlmsTxt(domain) + (isFull ? fullSuffix : '');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(body.trim() + '\n');
}
