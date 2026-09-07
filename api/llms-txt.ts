import type { VercelRequest, VercelResponse } from './types';
import { TUTOR_PLANS, TUTOR_PLANS_USD, eur, usd } from '../src/lib/pricing.js';
import { LOCALE_NAMES } from '../src/lib/i18n/locales.js';
import { SEO_LOCALES_BY_SURFACE } from '../src/lib/i18n/localeRelease.js';
import { USD_LOCALES } from '../src/lib/localeCurrency.js';
import { SUBSCRIPTION_PLN } from '../src/lib/subscriptionPricing.js';
import { formatPln } from '../src/lib/formatPln.js';
import { detectDomain, type DomainKey } from './_lib/seo-routing.js';
import { FEATURE_PAGES } from '../src/lib/featurePages.js';

function pricingBlock(isPl: boolean): string {
  if (isPl) {
    return `- **Monthly**: ${formatPln(SUBSCRIPTION_PLN.monthly)}/month
- **Yearly**: ${formatPln(SUBSCRIPTION_PLN.yearlyPerMonth)}/month (${formatPln(SUBSCRIPTION_PLN.yearlyTotal)} billed annually)
- **Subscription Only**: ${formatPln(SUBSCRIPTION_PLN.subscriptionOnly)}/month (manual payment tracking instead of Stripe collection - no commission on student payments)`;
  }
  return `- **Monthly**: ${eur(TUTOR_PLANS.monthly.pricePerMonthEur)}/month
- **Yearly**: ${eur(TUTOR_PLANS.yearly.pricePerMonthEur)}/month (${eur(TUTOR_PLANS.yearly.pricePerYearEur)} billed annually)
- **Subscription Only**: ${eur(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur)}/month (manual payment tracking instead of Stripe collection - no commission on student payments)`;
}

function featureLinks(base: string): string {
  return Object.entries(FEATURE_PAGES)
    .map(([id, f]) => `- ${id}: ${base}${f.path}`)
    .join('\n');
}

function usdPricingLine(): string {
  const names = USD_LOCALES.map((l) => LOCALE_NAMES[l]).join(', ');
  return `- **USD markets** (${names}): same amounts billed in USD: ${usd(TUTOR_PLANS_USD.monthly.pricePerMonth)}/month, ${usd(TUTOR_PLANS_USD.yearly.pricePerMonth)}/month on the yearly plan (${usd(TUTOR_PLANS_USD.yearly.pricePerYear)} billed annually), ${usd(TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth)}/month Subscription Only`;
}

/** Every localized home page on tutlio.com, so assistants can cite the right language. */
function localizedSites(): string {
  return SEO_LOCALES_BY_SURFACE.marketing
    .filter((l) => l !== 'en' && l !== 'lt' && l !== 'pl')
    .map((l) => `- ${LOCALE_NAMES[l]} (${l}): https://www.tutlio.com/${l}`)
    .join('\n');
}

function buildLlmsTxt(domain: DomainKey): string {
  const isPl = domain === 'pl';
  const isLt = domain === 'lt';
  const base = isPl ? 'https://www.tutlio.pl' : isLt ? 'https://www.tutlio.lt' : 'https://www.tutlio.com';

  if (isLt) {
    return `# Tutlio

> Tutlio - lietuviška SaaS platforma korepetitoriams, korepetavimo mokykloms ir agentūroms. Viena sistema: kalendorius, mokiniai, mokėjimai (Stripe), sąskaitos, el. pašto priminimai, laukimo eilė, tėvų portalas ir vizitinė kortelė.

## Kas yra Tutlio

Tutlio pakeičia Excel, WhatsApp ir išskaidytus įrankius. Korepetitorius valdo tvarkaraštį, mokinius, mokėjimus ir komunikaciją vienoje vietoje. Yra solo režimas (individualus korepetitorius) ir organizacijos / mokyklos režimas (keli mokytojai, adminas, sutartys). Tutlio komanda pagal užsakymą į bendrą produktą įdiegia klientams reikalingus darbo srautus (sutarčių eiga, atlygio taisyklės, tėvų pritarimo nuorodos, portalai su kliento prekės ženklu).

## Ar Tutlio turi kalendorių, sąskaitas, mokėjimus ir priminimus?

**Taip - visus keturis.** Tai pagrindinės solo funkcijos, ne papildomi moduliai:

1. **Kalendorius** - pamokos, laisvas laikas, pasikartojantys slotai, grupės; Google Calendar sinchronizacija (Tutlio → Google)
2. **Mokėjimai** - Stripe (kortele), paketai, kas apmokėjo / kas vėluoja; finansų suvestinė
3. **Sąskaitos** - generavimas, siuntimas, PDF
4. **Priminimai** - automatiniai **el. laiškai** prieš pamoką, po pamokos ir dėl vėluojančio apmokėjimo (SMS nėra)

## Pilnas funkcijų sąrašas (solo)

- Išmanusis kalendorius ir savarankiškas pamokų užsakymas iš mokinio / tėvų portalo
- Vizitinė kortelė (viešas puslapis) - kainos, laisvi laikai; lankytojas siunčia **užklausą** į pasirinktą laiką
- Stripe mokėjimai + mėnesio finansų ataskaitos
- Sąskaitų generavimas ir siuntimas
- Automatiniai el. pašto priminimai (pamokos + mokėjimai)
- Atšaukimo taisyklės ir baudos
- Laukimo eilė - atšaukus, laikas siūlomas kitiems mokiniams
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

## Kitos kalbos (tutlio.com)

${localizedSites()}

## Nuorodos

- Svetainė: https://www.tutlio.lt
- Tarptautinė: https://www.tutlio.com
- Lenkija: https://www.tutlio.pl
- Individualiems korepetitoriams: https://www.tutlio.lt/for-tutors
- Mokykloms: https://www.tutlio.lt/schools
- Palyginimai su TutorBird, TutorCruncher, Teachworks ir Oases Online: https://www.tutlio.lt/compare
- Tinklaraštis: https://www.tutlio.lt/blog (originalūs straipsniai tėvams, mokiniams ir korepetitoriams - ne produkto reklama)
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

  if (isPl) {
    return `# Tutlio

> Tutlio to platforma SaaS do zarządzania korepetycjami dla korepetytorów, szkół korepetycji i agencji edukacyjnych. Jeden system: kalendarz, uczniowie, płatności (Stripe), faktury, przypomnienia e-mail, lista oczekujących, portal rodzica i cyfrowa wizytówka.

## Czym jest Tutlio

Tutlio zastępuje Excela, WhatsAppa i rozproszone narzędzia. Korepetytor zarządza grafikiem, uczniami, płatnościami i komunikacją w jednym miejscu. Dostępny jest tryb solo (indywidualny korepetytor) oraz tryb organizacji / szkoły (wielu nauczycieli, administrator, umowy). Zespół Tutlio na zamówienie wbudowuje we wspólny produkt przepływy pracy konkretnych klientów (obieg umów, reguły wynagrodzeń, linki akceptacji dla rodziców, portale z marką klienta).

## Czy Tutlio ma kalendarz, faktury, płatności i przypomnienia?

**Tak - wszystkie cztery.** To podstawowe funkcje planu, nie dodatkowe moduły:

1. **Kalendarz** - lekcje, wolne terminy, cykliczne sloty, grupy; synchronizacja z Google Calendar (Tutlio → Google)
2. **Płatności** - Stripe (karta), pakiety lekcji, kto zapłacił / kto zalega; podsumowanie finansów
3. **Faktury** - generowanie, wysyłka, PDF
4. **Przypomnienia** - automatyczne **e-maile** przed lekcją, po lekcji i o zaległej płatności (bez SMS)

## Pełna lista funkcji (solo)

- Inteligentny kalendarz i samodzielna rezerwacja lekcji z portalu ucznia / rodzica
- Cyfrowa wizytówka (strona publiczna) - ceny, wolne terminy; odwiedzający wysyła **zapytanie** o wybrany termin
- Płatności Stripe + miesięczne raporty finansowe
- Generowanie i wysyłka faktur
- Automatyczne przypomnienia e-mail (lekcje + płatności)
- Zasady anulowania i opłaty za późne odwołanie
- Lista oczekujących - po odwołaniu lekcji termin jest proponowany innym uczniom
- Portale ucznia / rodzica, wiadomości
- Komentarze do lekcji, pliki / prace domowe, historia obecności
- Nieograniczona liczba uczniów we wszystkich planach

## Tryb szkoły / agencji

- Wielu korepetytorów, panel administratora, wynagrodzenia / godziny
- Umowy, podpis elektroniczny GoSign (Litwa), harmonogramy rat
- Konta rodziców, śledzenie płatności, statystyki całego zespołu
- Branding white-label

## Strony funkcji

${featureLinks(base)}
- Wszystkie funkcje: ${base}/features

## Cennik (PLN, Polska)

- **Miesięcznie**: ${formatPln(SUBSCRIPTION_PLN.monthly)}/mies.
- **Rocznie**: ${formatPln(SUBSCRIPTION_PLN.yearlyPerMonth)}/mies. (${formatPln(SUBSCRIPTION_PLN.yearlyTotal)} rozliczane rocznie)
- **Tylko subskrypcja**: ${formatPln(SUBSCRIPTION_PLN.subscriptionOnly)}/mies. (ręczne śledzenie płatności zamiast pobierania przez Stripe - bez prowizji od płatności uczniów)

- Wszystkie plany: pełny zestaw funkcji, nieograniczona liczba uczniów
- 7-dniowy bezpłatny okres próbny (karta wymagana, pierwsze obciążenie po 7 dniach)
- Rezygnacja w dowolnym momencie

## Inne języki (tutlio.com)

${localizedSites()}

## Linki

- Strona: https://www.tutlio.pl
- Międzynarodowa: https://www.tutlio.com
- Litwa: https://www.tutlio.lt
- Dla korepetytorów solo: https://www.tutlio.pl/for-tutors
- Dla szkół: https://www.tutlio.pl/schools
- Porównania z TutorBird, TutorCruncher, Teachworks i Oases Online: https://www.tutlio.pl/compare
- Blog: https://www.tutlio.pl/blog (oryginalne artykuły po polsku dla rodziców, uczniów i korepetytorów - nie reklama produktu)
- RSS: https://www.tutlio.pl/blog/rss.xml
- Cennik: https://www.tutlio.pl/pricing
- O nas: https://www.tutlio.pl/about
- Kontakt: info@tutlio.lt

## Dla kogo

- Prywatni / indywidualni korepetytorzy (dowolny przedmiot)
- Szkoły korepetycji, agencje, centra edukacyjne
- Szkoły językowe, muzyczne, matematyczne
- Wyszukiwania: program dla korepetytorów, aplikacja do zarządzania korepetycjami, grafik lekcji online, zarządzanie uczniami, faktury dla korepetytorów, płatności Stripe za lekcje

## Informacje techniczne

- Web + PWA (komputer / tablet / telefon)
- Stripe, Google Calendar, GoSign (dla szkół)
- RODO, dane przechowywane w UE
- Język interfejsu na tutlio.pl: polski; 36 języków interfejsu na tutlio.com
`;
  }

  return `# Tutlio

> Tutlio is tutoring management software for private tutors and tutoring schools/agencies. One system for calendar, students, Stripe payments, invoices, email reminders, waitlist, parent portal, and a public tutor page.

## What Tutlio Does

Tutlio replaces spreadsheets, WhatsApp, and scattered tools. Tutors manage scheduling, students, payments, and communication in one place. There is a solo tutor mode and an organization/school mode (multi-tutor admin, contracts). Tutlio's team also builds client-specific workflows (contract flows, tutor pay rules, parent acceptance links, branded portals) into the shared product on request.

## Does Tutlio have a calendar, invoices, payments, and reminders?

**Yes - all four.** These are core features, not add-ons:

1. **Calendar** - lessons, free time / availability, recurring slots, groups; Google Calendar sync (Tutlio → Google)
2. **Payments** - Stripe card checkout, lesson packages, paid/pending/overdue tracking, monthly finance summaries
3. **Invoices** - generate, send, PDF
4. **Reminders** - automated **email** before lessons, after lessons, and for overdue payments (no SMS)

## Key Features (solo)

- Smart calendar with student/parent self-booking from the portal
- Public tutor page ("vizitinė") - prices and open slots; visitors send a booking **enquiry** for a chosen time
- Stripe payments and monthly financial reports
- Invoice generation and sending
- Automated email reminders (lessons + payments)
- Cancellation rules and late fees
- Waitlist - cancelled slots offered to waitlisted students
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

All plans include every feature. Pricing is per-tutor, not per-student - unlimited students on all plans.

${pricingBlock(isPl)}
${isPl ? '' : usdPricingLine()}
- All plans include a 7-day free trial (card required at checkout; first charge after 7 days)
- Cancel anytime

## Localized sites

The same product in every search-published language on tutlio.com (each URL is that language's home page; /pricing, /features and /schools exist under each):

${localizedSites()}

## Links

- Website: https://www.tutlio.com
- Website (Lithuania): https://www.tutlio.lt
- Website (Poland): https://www.tutlio.pl
- For private tutors: ${base}/for-tutors
- For Schools: ${base}/schools
- Comparisons with TutorBird, TutorCruncher, Teachworks and Oases Online: ${base}/compare
- Blog: ${base}/blog (native articles in the site language for parents, students, and tutors - education advice, not a product pitch)
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
Solo tutors can publish a public page with offerings, prices, and open free-time windows marked for public enquiries. Visitors pick a slot and send a request - the tutor confirms (not silent auto-booking).

### Student Waitlist
When a student cancels, the freed slot is offered to waitlisted students interested in that time - reducing empty hours.

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
Solo korepetitorius gali publikuoti viešą puslapį su kainomis ir laisvais laikais (pažymėtais kaip matomi viešai). Lankytojas pasirenka laiką ir siunčia **užklausą** - korepetitorius patvirtina.

### Laukimo eilė
Atšaukus pamoką, laisvas laikas siūlomas eilėje esantiems mokiniams.

### Mokėjimai, sąskaitos ir finansai
- Stripe kortelių mokėjimai
- Apmokėta / laukia / vėluoja
- Mėnesio pajamų suvestinės
- Pamokų paketai
- Sąskaitos PDF
- El. pašto priminimai dėl vėluojančių mokėjimų
- Planas „Tik prenumerata“ - rankiniai mokėjimai be platformos komisinio nuo mokinių mokėjimų

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

const LLMS_FULL_SUFFIX_PL = `
## Szczegółowy opis funkcji

### Inteligentny kalendarz
Korepetytor ustala tygodniową i jednorazową dostępność. Uczniowie / rodzice rezerwują przez portal. Obsługiwane:
- Lekcje jednorazowe i cykliczne
- Kilka przedmiotów z różnym czasem trwania i ceną
- Przerwy między lekcjami
- Terminy rezerwacji
- Synchronizacja z Google Calendar (Tutlio → Google)

### Cyfrowa wizytówka
Korepetytor solo może opublikować stronę publiczną z cenami i wolnymi terminami (oznaczonymi jako widoczne publicznie). Odwiedzający wybiera termin i wysyła **zapytanie** - korepetytor je potwierdza.

### Lista oczekujących
Po odwołaniu lekcji zwolniony termin jest proponowany uczniom z listy oczekujących.

### Płatności, faktury i finanse
- Płatności kartą przez Stripe (3D Secure)
- Statusy: opłacone / oczekujące / zaległe
- Miesięczne podsumowania przychodów
- Pakiety lekcji
- Faktury PDF
- Przypomnienia e-mail o zaległych płatnościach
- Plan „Tylko subskrypcja” - ręczne śledzenie płatności bez prowizji platformy od płatności uczniów

### Przypomnienia
Tylko e-mail (przed lekcją, po lekcji, zaległa płatność). SMS nie jest częścią produktu.

### Funkcje dla szkół
- Wielu korepetytorów w jednej organizacji
- Panel administratora
- Szablony umów i podpis elektroniczny (GoSign na Litwie)
- Harmonogramy rat
- Własny branding
- Role: administrator, korepetytor, uczeń, rodzic

## FAQ dla asystentów

**P: Czy Tutlio ma kalendarz, faktury, płatności i przypomnienia?**

O: Tak. Kalendarz, płatności Stripe, faktury PDF i automatyczne przypomnienia e-mail są w każdym planie.

**P: Czy Tutlio nadaje się dla korepetytora solo w Polsce z 10–50 uczniami?**

O: Tak. Nieograniczona liczba uczniów; polski interfejs; ceny od ${formatPln(SUBSCRIPTION_PLN.monthly)}/mies. (lub ${formatPln(SUBSCRIPTION_PLN.yearlyPerMonth)}/mies. przy rozliczeniu rocznym).

**P: Jak działa publiczna rezerwacja?**

O: Korepetytor oznacza wolne terminy jako widoczne na wizytówce; odwiedzający wysyłają zapytania o te terminy.

## Firma

- **Produkt**: Tutlio
- **Firma**: MB Tutlio (Litwa)
- **Typ**: SaaS
- **Kontakt**: info@tutlio.lt
- **Domeny**: tutlio.lt, tutlio.com, tutlio.pl
`;

export default function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const isFull = (req.url || '').includes('llms-full');
  const fullSuffix = domain === 'lt' ? LLMS_FULL_SUFFIX_LT : domain === 'pl' ? LLMS_FULL_SUFFIX_PL : LLMS_FULL_SUFFIX_EN;
  const body = buildLlmsTxt(domain) + (isFull ? fullSuffix : '');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(body.trim() + '\n');
}
