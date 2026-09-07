import { TUTOR_PLANS, TUTOR_PLANS_USD, eur, usd } from '../../src/lib/pricing.js';
import { USD_LOCALES } from '../../src/lib/localeCurrency.js';
import { LOCALE_NAMES } from '../../src/lib/i18n/locales.js';

import { SUBSCRIPTION_PLN, formatSubscriptionPln } from '../../src/lib/subscriptionPricing.js';
import {
  PRODUCT_SUPPORT_AREA_IDS,
  PUBLIC_PRODUCT_FEATURES,
  normalizeProductSearchValue,
  productSearchTokens,
  type ProductSupportAreaId,
  type PublicProductFeatureId,
} from '../../src/lib/productFeatureCatalog.js';
import { getEnterpriseLicenseBounds } from './enterprise-license.js';

export const SUPPORT_AREA_IDS = PRODUCT_SUPPORT_AREA_IDS;
export type SupportAreaId = ProductSupportAreaId;

export interface SupportKnowledgeArea {
  id: SupportAreaId;
  label: string;
  routerDescription: string;
  content: string;
  keywords: readonly string[];
}

const monthlyEur = eur(TUTOR_PLANS.monthly.pricePerMonthEur);
const yearlyMonthlyEur = eur(TUTOR_PLANS.yearly.pricePerMonthEur);
const yearlyTotalEur = eur(TUTOR_PLANS.yearly.pricePerYearEur);
const noCommissionEur = eur(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur);
const monthlyPln = formatSubscriptionPln(SUBSCRIPTION_PLN.monthly, { perMonth: true });
const yearlyMonthlyPln = formatSubscriptionPln(SUBSCRIPTION_PLN.yearlyPerMonth, { perMonth: true });
const monthlyUsd = usd(TUTOR_PLANS_USD.monthly.pricePerMonth);
const yearlyMonthlyUsd = usd(TUTOR_PLANS_USD.yearly.pricePerMonth);
const noCommissionUsd = usd(TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth);
const usdMarketNames = USD_LOCALES.map((l) => LOCALE_NAMES[l]).join(', ');
const { minLicenses: enterpriseMinLicenses, maxSelfServe: enterpriseMaxSelfServe } = getEnterpriseLicenseBounds();

export const ENTERPRISE_SELF_SERVE_SUPPORT_KNOWLEDGE = `
# Agency, company, and school license checkout

- An agency, tutoring company, or school can buy ${enterpriseMinLicenses}–${enterpriseMaxSelfServe} tutor licenses directly from /pricing. This is a self-service purchase; an ordinary purchase in this range does not require contacting Tutlio or booking a demo first.
- Ten tutor licenses are within the self-service range and can be purchased immediately on /pricing: set the license calculator to 10 and choose Buy now (Lithuanian: “Pirkti dabar”; Polish: “Kup teraz”).
- A new buyer enters the company name and continues to secure Stripe Checkout. The calculator shows the current per-license price, administration fee, and monthly total before purchase.
- Only quantities above ${enterpriseMaxSelfServe}, a tailored/custom deployment, a request for pre-purchase guidance, or a checkout problem should be directed to Contact us. Do not replace an available self-service checkout with Contact us.
- An organization that already has an active license subscription manages its licenses from the organization dashboard instead of starting a second subscription on /pricing.
`.trim();

export function buildSupportFollowUpGuidance(
  userQuestionNumber: number,
  localizedGeneralFollowUp: string,
): string {
  const normalizedQuestionNumber = Math.max(1, Math.floor(userQuestionNumber));

  if (normalizedQuestionNumber <= 3) {
    return `
# Follow-up behavior for the first three user questions

- This is user question ${normalizedQuestionNumber} of the first three.
- Give the complete answer first, then ask exactly one brief, friendly, context-specific follow-up question that helps tailor Tutlio to the visitor or identify their most useful next step.
- Keep the question low-pressure and easy to answer. Ask about only one missing detail; do not collect a lead, force a purchase, or offer a list of questions.
- Use the recent conversation so you never ask for information the user already provided, answered, or declined.
- Do not ask a follow-up if the user is only thanking or saying goodbye, explicitly asked for no follow-up questions, or the answer must stop at a support or security escalation.
`.trim();
  }

  return `
# Follow-up behavior after the first three user questions

- This is user question ${normalizedQuestionNumber}, after the first three.
- Give the complete answer and do not manufacture another topic-specific question.
- End with this exact localized sentence as the final sentence: “${localizedGeneralFollowUp}”
- Do not add any text after that sentence.
- Omit it only if the user is thanking or saying goodbye, explicitly asked for no follow-up questions, or the answer must stop at a support or security escalation.
`.trim();
}

export const SHARED_SUPPORT_KNOWLEDGE = `
# Tutlio shared product facts

- Tutlio is a tutoring-management SaaS made by MB Tutlio in Lithuania. It serves solo tutors, tutoring companies, schools, tutors working inside organizations, students, and parents.
- Public domains: tutlio.lt (Lithuania), tutlio.pl (Poland), and tutlio.com (international). The product is a web app and installable PWA.
- Tutlio brings scheduling, students, payments, invoices, reminders, communication, and operational reporting into one system.
- Support email: info@tutlio.lt. The Tutlio team typically answers email requests within 15 minutes during normal availability.
- After a B2B purchase, Tutlio creates a WhatsApp support chat for fast ongoing support.
- The support agent explains product behavior and navigation. It cannot see or change a user's account, payments, contracts, passwords, or private records.
- If a question depends on account-specific data, an undocumented edge case, or a possibly failed payment/signature, advise the user to use Contact us and include the relevant email, date, and a short description. Never invent an account state.

${ENTERPRISE_SELF_SERVE_SUPPORT_KNOWLEDGE}
`.trim();

export const SUPPORT_KNOWLEDGE_AREAS: readonly SupportKnowledgeArea[] = [
  {
    id: 'getting_started',
    label: 'Product overview, plans, trial, roles, and getting started',
    routerDescription: 'What Tutlio is, who it is for, pricing, free trial, registration, roles, portals, languages, and first steps.',
    keywords: [
      'price', 'pricing', 'plan', 'cost', 'trial', 'register', 'start', 'role', 'portal', 'language',
      'kaina', 'planas', 'bandom', 'registr', 'prad', 'rol', 'kalba',
      'cena', 'abonament', 'okres próbny', 'rejestr', 'zacząć', 'język',
    ],
    content: `
# Product overview and getting started

## Who uses Tutlio

- Solo tutors use /dashboard, /calendar, /students, /finance, /invoices, /messages, /instructions, and /settings.
- Students use /student/*, parents use /parent/*, organization administrators use /company/*, and school administrators use /school/*.
- Each person signs in through the matching portal. If an email belongs to a different portal, Tutlio can direct the user to the correct one.

## Is Tutlio a good fit?

- Tutlio is a strong fit for a solo tutor who wants one place for scheduling, students, lesson records, payments, invoices, reminders, and communication instead of separate calendars and spreadsheets.
- It is a strong fit for a tutoring company or growing team that needs shared schedules, tutor and student administration, permissions, finance visibility, branding, and operational reporting.
- It is a strong fit for a school that needs student records plus contracts, parent data collection, signatures, installment schedules, and accounting exports.
- Students and parents normally use Tutlio through a tutor, organization, or school rather than buying it as a standalone consumer learning app.
- When someone is evaluating fit, identify their role and the workflow they most want to simplify. Explain only the capabilities relevant to that situation and invite a Contact us conversation for a tailored B2B setup.

## Solo pricing and trial

- EUR monthly plan: ${monthlyEur}/month.
- EUR yearly plan: ${yearlyMonthlyEur}/month, billed as ${yearlyTotalEur} per year.
- EUR Subscription Only plan: ${noCommissionEur}/month; it keeps full platform access but uses manual payment tracking instead of collecting student payments through Tutlio, so there is no Tutlio commission on those student payments.
- Poland list pricing: ${monthlyPln} monthly or ${yearlyMonthlyPln} on the yearly plan.
- USD list pricing for interface languages without a supported local currency (${usdMarketNames}): ${monthlyUsd}/month, ${yearlyMonthlyUsd}/month on the yearly plan, ${noCommissionUsd}/month Subscription Only. Same numbers as EUR, charged in USD at checkout.
- Solo plans include all main product features and unlimited students.
- New solo subscriptions include a 7-day free trial. A payment card is entered at checkout, the first charge is after the trial, and the subscription can be cancelled during the trial.
- Plans can be cancelled from Settings / the Stripe customer portal. Access continues until the end of the paid billing period.
- B2B organizations and schools use tutor-license pricing. Licenses within the self-service range can be selected and purchased directly on /pricing; the calculator shows the live total. Contact us is optional for guidance and required only above the self-service cap or for a tailored deployment.

## First steps for a tutor

1. Register and choose a subscription.
2. Complete the tutor profile and lesson settings: subjects, duration, price, format, and cancellation rules.
3. Add students or invite them.
4. Set weekly or one-off availability in the calendar.
5. Connect Stripe if collecting card payments and optionally connect Google Calendar.
6. Share the student portal or public tutor page when ready.

## Languages and markets

Tutlio supports Lithuanian, English, Polish, Latvian, Estonian, French, Spanish, German, Swedish, Danish, Finnish, Norwegian, and Dutch. tutlio.lt defaults to Lithuanian, tutlio.pl to Polish, and tutlio.com to English.
`.trim(),
  },
  {
    id: 'tutor_workspace',
    label: 'Tutor calendar, whiteboard, availability, students, lessons, waitlist, and daily work',
    routerDescription: 'Tutor calendar, interactive lesson whiteboard, creating/editing lessons, availability/free time, recurring slots, lesson settings, students, packages, attendance, comments, public page, and waitlist.',
    keywords: [
      'calendar', 'lesson', 'availability', 'free time', 'slot', 'recurring', 'student', 'waitlist', 'homework', 'attendance', 'public page',
      'kalend', 'pamok', 'laisvas laikas', 'laisv', 'mokin', 'eil', 'lankom', 'komentar', 'vizitin',
      'kalendarz', 'lekcj', 'dostępn', 'wolny termin', 'termin', 'uczeń', 'lista oczek', 'frekwenc',
      ...PUBLIC_PRODUCT_FEATURES.whiteboard.aliases,
    ],
    content: `
# Tutor workspace

## Calendar and lessons

- The tutor calendar supports one-time and recurring lessons, different subjects, online/in-person formats, lesson comments, files/homework, attendance, cancellation rules, and payment status.
- To create a lesson, select an empty calendar interval and choose Create lesson. Complete the student, subject, duration, and other details, then save.
- Lesson types/statuses have distinct calendar styling. Trial lessons are violet; completed unpaid lessons are amber; makeup lessons are violet with a return arrow; tutor no-show cancellations are red and dashed.
- A tutor can review upcoming work on /dashboard and full scheduling on /calendar.

## Interactive lesson whiteboard

${PUBLIC_PRODUCT_FEATURES.whiteboard.facts.map((fact) => `- ${fact}`).join('\n')}

## Availability / free time

- Localized labels for this flow are: Lithuanian “Kalendorius”, “Pamoka / Laisvas laikas”, “Laisvas laikas”, and “Darbo laiko nustatymai”; English “Calendar”, “Lesson / Free time”, “Free time”, and “Working-time settings”; Polish “Kalendarz”, “Lekcja / Wolny czas”, “Wolny czas”, and “Ustawienia czasu pracy”. Use the labels matching the answer language.
- Weekly availability is managed in Working-time settings. A specific-date exception can also be created.
- Selecting empty time in the calendar opens a Lesson / Free time choice. Choosing Free time immediately creates a one-off availability record and opens its edit sheet.
- In the free-time editor, the tutor can adjust start/end time, restrict the slot to specific subjects, add a meeting link, or assign a student. Empty subject selection means all subjects.
- Closing that editor without saving does not delete the just-created free-time slot; it remains with the originally selected time.

## Students and lesson settings

- /students contains student profiles, payer details, notes, lesson history, packages, and invitations.
- /lesson-settings controls lesson subjects/types, duration, pricing, breaks, booking deadlines, and cancellation rules.
- Students and parents can self-book only within the availability and rules the tutor or organization exposes.

## Waitlist and public tutor page

- The waitlist helps fill cancelled time by offering it to interested students.
- A solo tutor can publish a digital business card with profile, subjects, formats, prices, reviews, and selected live availability.
- A visitor choosing a public time sends a booking enquiry. It is not silently confirmed: the tutor reviews and accepts the new student before it becomes a lesson.
`.trim(),
  },
  {
    id: 'students_parents',
    label: 'Student and parent portals, booking, lessons, payments, and invitations',
    routerDescription: 'Student or parent login, invitations, children, booking, lesson history, payments, invoices, messages, and what each portal can do.',
    keywords: [
      'parent', 'child', 'student portal', 'student login', 'book', 'booking', 'invite', 'invoice',
      'tėv', 'vaik', 'mokinio portal', 'rezerv', 'kviet', 'sąskait',
      'rodzic', 'dzieck', 'portal ucznia', 'rezerw', 'zaprosz', 'faktur',
    ],
    content: `
# Student and parent portals

## Access and invitations

- Students sign in through /login and use /student/*. Parents sign in through /login or register from /parent-register and use /parent/*.
- A student normally receives an invitation from a tutor or organization. A parent can be invited for a child and can manage more than one linked child from one parent account.
- If sign-in succeeds but the wrong portal appears, sign out and use the portal associated with the invited email. Contact support if the same email appears to have conflicting roles.

## Student capabilities

- Students can view their dashboard and lesson history, book available lessons when booking is enabled, see payments, join the waitlist, exchange messages, and read instructions.
- Booking respects the tutor's subjects, duration, availability, breaks, deadlines, and organization policy. Some organizations intentionally disable student self-booking.
- A pending public-page request is only an enquiry until the tutor accepts it.

## Parent capabilities

- Parents can switch between linked children, view lessons and invoices, make available payments, and message the tutor or organization.
- Parents cannot change tutor-wide availability or organization settings.
- A parent should use the same email address to which the invitation was sent. If the child is missing, the tutor or organization should verify that the parent invitation was created for that student.

## Changes, cancellations, and refunds

- Cancellation timing and any late fee are set by the tutor or organization and are shown in the platform.
- A refund is not guaranteed solely because a lesson was cancelled. Card refunds depend on the lesson/payment state and the tutor or organization's policy. For an uncertain charge, use Contact us and include the payer email, amount, and date; do not repeat the payment while its status is unknown.
`.trim(),
  },
  {
    id: 'organizations',
    label: 'Company and organization administration, tutors, finance, permissions, and branding',
    routerDescription: 'Company/agency administration, adding tutors and students, schedules, statistics, finance, invoices, team permissions, licenses, payroll, and branding.',
    keywords: [
      'company', 'organization', 'agency', 'admin', 'team', 'manage a tutoring team', 'tutor license', 'permission', 'payroll', 'branding', 'statistics', 'b2b', 'whatsapp', 'support chat',
      'įmon', 'organiz', 'agentūr', 'admin', 'komand', 'valdau korepetitorių komandą', 'licenc', 'leidim', 'atlyg', 'prekin', 'statistik', 'pagalbos pokalb',
      'firma', 'organizac', 'agenc', 'zespół', 'zarządzam zespołem korepetytorów', 'licencj', 'uprawn', 'wynagrod', 'branding', 'statyst', 'czat wsparcia',
    ],
    content: `
# Organizations and tutoring companies

- Organization administrators sign in at /company/login and work under /company/*.
- The organization dashboard brings together tutors, students, sessions, schedules, statistics, finance, invoices, messages, and settings.
- Administrators can invite tutors, manage tutor licenses, add students, view the combined schedule, review lesson status, and use operational/finance reports.
- Team-member permissions can limit access to areas such as students, sessions, messages, finance, contracts, or settings. An owner controls team membership and permissions.
- Organization branding can customize the experience for tutors, students, and parents. Available options depend on the organization's configuration.
- Finance tools can summarize tutor hours/pay and organization revenue. Exact pay rules can be organization-specific, so the assistant must not infer a tutor's pay from a generic lesson status.
- B2B licensing is based on tutor-license quantity plus the administration fee shown by the live calculator. For ${enterpriseMinLicenses}–${enterpriseMaxSelfServe} licenses, including 10 licenses, select the quantity on /pricing and use Buy now; contacting Tutlio first is not required. Above ${enterpriseMaxSelfServe} licenses or for a tailored deployment, use Contact us.
- After a B2B purchase, Tutlio creates a WhatsApp support chat for quick ongoing help with setup and operations.

## Typical organization setup

1. Select and buy the required tutor licenses on /pricing, or contact Tutlio for a quantity above the self-service cap or a tailored deployment.
2. Invite tutors and configure access.
3. Add/import students and payer contacts.
4. Configure lesson types, availability, cancellation rules, payments, and branding.
5. Invite students/parents and begin scheduling.

Tutlio support can explain setup, but cannot make organization changes from the public support widget.
`.trim(),
  },
  {
    id: 'schools_contracts',
    label: 'School administration, contracts, e-signatures, installments, and reports',
    routerDescription: 'School portal, student records, contracts/templates, parent completion, GoSign e-signing, signed copies, installments, manual payments, filters, and accounting exports.',
    keywords: [
      'school', 'represent a school', 'contract', 'signature', 'esign', 'gosign', 'installment', 'accounting export', 'annual fee',
      'mokykl', 'atstovauju mokyklai', 'sutart', 'paraš', 'įmok', 'buhalter', 'metin',
      'szkoł', 'reprezentuję szkołę', 'umow', 'podpis', 'rata', 'księgow', 'opłata roczna',
    ],
    content: `
# School administration, contracts, and installments

- School administrators sign in at /school/login. The main areas are /school/students, /school/contracts, and /school/finance.
- The school and company portals share core administration, but school organizations add contract, signature, installment, and accounting workflows.

## Contracts

- Administrators manage DOCX-based contract templates and create a contract for a student with annual/additional fees and payer details.
- Typical status flow: draft → sent → awaiting school signature → signed by school → signed.
- The parent link collects required contract data and consent. An electronic-signature-enabled school uses GoSign; another school can complete a manual signed-copy flow.
- For an e-signature school, uploading a parent-signed scan does not count as the school's signature. The school director still signs the prepared copy through GoSign.
- If a contract says it is waiting for parent data, the parent must complete the public contract form before the school can continue.
- Contract filters separate missing parent data, not signed by school, not signed by parents, and fully signed contracts. Search and Excel export apply to the currently filtered list.

## Installments and school finance

- Payment schedules are created only from a fully signed contract.
- After choosing the contract, the administrator enters installment amounts or uses Split equally. A placeholder such as 100.00 is only an example and is not an entered value.
- The school can send a payer link, confirm a manual payment, or review paid/outstanding installments.
- The accounting report under /school/finance includes a formatted summary and detailed payment export.

For a signature or payment that may already be processing, do not advise repeating it. Ask the user to contact support with the contract/student reference and approximate time.
`.trim(),
  },
  {
    id: 'payments_billing',
    label: 'Stripe, subscriptions, lesson payments, packages, invoices, refunds, and finance',
    routerDescription: 'Stripe connection, subscription, checkout, card payments, packages, invoices/PDF, manual payments, commissions, refunds, overdue status, and finance reports.',
    keywords: [
      'stripe', 'payment', 'paid', 'charge', 'refund', 'subscription', 'package', 'invoice', 'commission', 'finance', 'card',
      'mokėj', 'apmok', 'nuskaič', 'grąž', 'prenumer', 'paket', 'sąskait', 'komisin', 'kortel', 'finans',
      'płat', 'opłac', 'obciąż', 'zwrot', 'subskry', 'pakiet', 'faktur', 'prowizj', 'karta', 'finans',
    ],
    content: `
# Payments, subscriptions, packages, and invoices

## Tutor subscription

- A tutor subscription is purchased through Stripe. The 7-day trial starts with card checkout and can be cancelled before the first charge.
- Subscription management and cancellation are available through Settings / the Stripe customer portal. Cancelling keeps access until the end of the current paid period.
- Current EUR solo prices are ${monthlyEur}/month, ${yearlyMonthlyEur}/month billed yearly, and ${noCommissionEur}/month for Subscription Only.

## Student lesson payments

- Tutors or organizations can collect eligible lesson/package payments through Stripe, or track manual payments according to their plan/settings.
- Payment state is linked to the related lesson, package, installment, or invoice. A browser closing after checkout does not necessarily mean payment failed; allow the status to update before retrying.
- Lesson packages contain prepaid lesson credit. Subject, price, and available lesson counts can vary by package.
- The Subscription Only plan uses manual payment tracking and avoids Tutlio's commission on student payments.

## Invoices and finance

- Tutors and organizations can create and send invoices and download PDF versions. Required seller/buyer details must be configured before generating a valid invoice.
- Finance views summarize revenue, payment status, and relevant lesson activity. Organization and school reports add team-wide or installment data.
- Automated reminders are email-based. Tutlio does not currently provide SMS reminders.

## Uncertain charges and refunds

- Never promise that a charge was captured or refunded without account-specific evidence.
- If checkout, a webhook, or a refund may still be processing, do not retry repeatedly. Use Contact us with payer email, amount, currency, date/time, and what the final screen showed.
- Refund eligibility and who initiates it depend on the payment path and the tutor/organization cancellation policy.
`.trim(),
  },
  {
    id: 'integrations_messages',
    label: 'Google Calendar, messaging, reminders, email, files, PWA, and integrations',
    routerDescription: 'Google Calendar sync, platform chat/messages, email reminders, files/homework, notifications, PWA installation, Stripe/GoSign overview, and integration behavior.',
    keywords: [
      'google calendar', 'sync', 'message', 'chat', 'reminder', 'email', 'notification', 'file', 'homework', 'pwa', 'install app',
      'sinchron', 'žinut', 'pokalb', 'primin', 'laišk', 'praneš', 'fail', 'namų darb', 'programėl',
      'synchron', 'wiadomo', 'czat', 'przypomn', 'email', 'powiadom', 'plik', 'zadanie', 'aplikac',
    ],
    content: `
# Integrations, messages, and notifications

## Google Calendar

- Tutors can connect Google Calendar from settings. Tutlio's documented calendar sync is one-way from Tutlio to Google.
- New or updated Tutlio lessons can appear in the connected Google calendar. Changes made only in Google should not be assumed to update Tutlio.
- If events stop syncing, confirm the Google connection is still authorized, then reconnect it. Avoid creating duplicate lessons while testing.

## Messages, files, and reminders

- Tutlio includes messages between the relevant tutor/organization, student, and parent accounts.
- Lesson comments and files/homework stay connected to lesson/student context according to the user's role and access.
- Automated reminders are sent by email for applicable upcoming lessons, post-lesson actions, and overdue payments. SMS reminders are not part of the current product.
- Browser push notifications may be available after permission is granted. Email delivery can also depend on the recipient's spam filters and address accuracy.

## Other integrations

- Stripe is used for subscription and eligible card-payment flows.
- GoSign is used for Lithuanian school electronic signatures when the organization has that feature enabled.
- Tutlio is an installable Progressive Web App. In a supported browser, use the browser's Install/Add to Home Screen action; no separate App Store download is required.

The widget cannot reconnect third-party accounts itself. If reconnecting does not help, use Contact us and include the affected integration, account email, approximate failure time, and any visible error text.
`.trim(),
  },
  {
    id: 'troubleshooting_security',
    label: 'Login, troubleshooting, privacy, security, access, and support escalation',
    routerDescription: 'Login/password issues, wrong portal, permissions, missing data, browser/PWA problems, privacy, GDPR, security, account-specific incidents, and contacting support.',
    keywords: [
      'login', 'password', 'error', 'broken', 'missing', 'permission', 'access', 'privacy', 'gdpr', 'security', 'delete account', 'support', 'contact',
      'prisijung', 'slaptaž', 'klaid', 'neveik', 'ding', 'leidim', 'prieig', 'privatum', 'saug', 'pagalb', 'susisiek',
      'logow', 'hasł', 'błąd', 'nie działa', 'brak', 'uprawn', 'dostęp', 'prywat', 'bezpiecz', 'pomoc', 'kontakt',
    ],
    content: `
# Troubleshooting, privacy, and support

## Safe first checks

1. Confirm the correct portal and email address are being used.
2. Refresh once, then sign out and sign back in if it is safe to do so.
3. Check the network connection and try a current Chrome, Safari, Edge, or Firefox version.
4. For an installed PWA that looks stale, close it fully and reopen it; if needed, open the same page in the browser.
5. Copy the exact error text and note the approximate time before contacting support.

## Login and permissions

- Password reset is available from the login flow. Reset links should be opened in the same browser where the user intends to finish the reset.
- Tutor, student, parent, company, and school users have different portals and permissions. Seeing fewer menu items can be intentional for an organization team member.
- The support widget cannot inspect a session, reveal private data, change a role, or bypass a permission. An administrator or Tutlio support must verify account-specific access.

## Privacy and security

- Tutlio uses Supabase authentication/database services and role-based access controls. Payment card details are handled through Stripe rather than being entered into the support chat.
- Do not ask users to paste passwords, full card numbers, authentication codes, private keys, or national identification numbers into chat or the contact form.
- For privacy, data-export, or deletion requests, contact info@tutlio.lt from the account email and clearly state the request. Support may need to verify identity before acting.

## Escalation

- Use Contact us for account-specific errors, uncertain payments/refunds, missing contracts/signatures, inaccessible data, or anything the product knowledge does not establish.
- Include the account email, page, approximate time, expected result, actual result, and a screenshot only if it contains no unnecessary sensitive data.
- Tutlio typically answers email requests within 15 minutes during normal availability. B2B customers receive a WhatsApp support chat after purchase for fast ongoing assistance.
`.trim(),
  },
] as const;

const areaById = new Map(SUPPORT_KNOWLEDGE_AREAS.map((area) => [area.id, area]));

export function getSupportKnowledgeArea(id: SupportAreaId): SupportKnowledgeArea {
  return areaById.get(id) ?? SUPPORT_KNOWLEDGE_AREAS[0];
}

export function supportRouterCatalog(): string {
  return SUPPORT_KNOWLEDGE_AREAS
    .map((area) => `- ${area.id}: ${area.routerDescription}`)
    .join('\n');
}

export interface RetrievedSupportKnowledgeChunk {
  id: string;
  title: string;
  content: string;
  source: 'area' | 'feature';
  featureId?: PublicProductFeatureId;
}

function supportSearchTokens(value: string): string[] {
  return productSearchTokens(value);
}

function splitAreaKnowledge(area: SupportKnowledgeArea): RetrievedSupportKnowledgeChunk[] {
  const chunks: RetrievedSupportKnowledgeChunk[] = [];
  let title = area.label;
  let lines: string[] = [];

  const flush = () => {
    const content = lines.join('\n').trim();
    if (content) {
      chunks.push({
        id: `${area.id}:${chunks.length}`,
        title,
        content,
        source: 'area',
      });
    }
    lines = [];
  };

  for (const line of area.content.split('\n')) {
    if (line.startsWith('## ')) {
      flush();
      title = line.slice(3).trim();
      continue;
    }
    if (line.startsWith('# ')) continue;
    lines.push(line);
  }
  flush();

  return chunks.length > 0
    ? chunks
    : [{ id: `${area.id}:0`, title: area.label, content: area.content, source: 'area' }];
}

function scoreAreaChunk(chunk: RetrievedSupportKnowledgeChunk, query: string): number {
  const normalizedQuery = normalizeProductSearchValue(query);
  const queryTokens = new Set(supportSearchTokens(query));
  const normalizedChunk = normalizeProductSearchValue(`${chunk.title} ${chunk.content}`);
  const chunkTokens = new Set(supportSearchTokens(normalizedChunk));
  let score = 0;

  if (normalizedQuery && normalizedChunk.includes(normalizedQuery)) score += 12;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) score += 2;
  }
  return score;
}

function featureKnowledgeChunks(
  featureIds: readonly PublicProductFeatureId[],
): RetrievedSupportKnowledgeChunk[] {
  return featureIds.map((featureId) => {
    const feature = PUBLIC_PRODUCT_FEATURES[featureId];
    return {
      id: `feature:${featureId}`,
      title: feature.label,
      content: feature.facts.map((fact) => `- ${fact}`).join('\n'),
      source: 'feature' as const,
      featureId,
    };
  });
}

function areaChunkDuplicatesFeature(
  chunk: RetrievedSupportKnowledgeChunk,
  featureIds: readonly PublicProductFeatureId[],
): boolean {
  const normalizedChunk = normalizeProductSearchValue(chunk.content);
  return featureIds.some((featureId) => PUBLIC_PRODUCT_FEATURES[featureId].facts
    .every((fact) => normalizedChunk.includes(normalizeProductSearchValue(fact))));
}

/**
 * Returns only the most relevant feature facts and area sections. Luna supplies
 * semantic feature choices; lexical ranking is the free deterministic fallback
 * and keeps broad area documents out of the final answer prompt.
 */
export function retrieveSupportKnowledgeChunks(
  areaId: SupportAreaId,
  query: string,
  featureIds: readonly PublicProductFeatureId[] = [],
  maxChunks = 4,
): RetrievedSupportKnowledgeChunk[] {
  const safeMax = Math.max(1, Math.min(6, Math.floor(maxChunks)));
  const featureChunks = featureKnowledgeChunks(featureIds).slice(0, safeMax);
  const remaining = safeMax - featureChunks.length;
  if (remaining <= 0) return featureChunks;

  const areaChunks = splitAreaKnowledge(getSupportKnowledgeArea(areaId))
    .filter((chunk) => !areaChunkDuplicatesFeature(chunk, featureIds))
    .map((chunk, order) => ({ chunk, order, score: scoreAreaChunk(chunk, query) }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const positiveAreaChunks = areaChunks.filter(({ score }) => score > 0);
  const chosenAreaChunks = positiveAreaChunks.length > 0
    ? positiveAreaChunks.slice(0, remaining)
    : featureChunks.length === 0
      ? areaChunks.slice(0, Math.min(2, remaining))
      : [];

  return [...featureChunks, ...chosenAreaChunks.map(({ chunk }) => chunk)];
}

export function renderSupportKnowledgeContext(
  areaId: SupportAreaId,
  query: string,
  featureIds: readonly PublicProductFeatureId[] = [],
): string {
  return retrieveSupportKnowledgeChunks(areaId, query, featureIds)
    .map((chunk) => `## ${chunk.title}\n${chunk.content}`)
    .join('\n\n');
}

function normalizedWords(value: string): string[] {
  return value
    .toLocaleLowerCase('lt')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
}

/**
 * Free, deterministic first-pass routing. Strong matches avoid a separate
 * classifier request; ambiguous and multilingual follow-ups fall back to Luna.
 */
export function guessSupportArea(value: string): { id: SupportAreaId; confident: boolean } {
  const normalized = normalizedWords(value).join(' ');
  const scores = SUPPORT_KNOWLEDGE_AREAS.map((area) => {
    let score = 0;
    for (const keyword of area.keywords) {
      const normalizedKeyword = normalizedWords(keyword).join(' ');
      if (!normalizedKeyword) continue;
      if (normalized.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(' ') ? 3 : 2;
      }
    }
    return { id: area.id, score };
  }).sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];
  if (!top || top.score === 0) return { id: 'getting_started', confident: false };
  return {
    id: top.id,
    confident: top.score >= 3 && top.score - (second?.score ?? 0) >= 1,
  };
}
