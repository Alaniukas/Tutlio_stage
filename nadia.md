# Nada El Abouti — Bijles Haarlem (pardavimų demo)

Perėjimas kitam kompiuteriui. **Ne** siųsti šito failo Nadai. Payer / demo laiškai eina į `@tutlio.lt`, ne į jos asmeninį paštą.

**Meet (ką ji prašė):** ketvirtadienis **13:45–14:15**, Google Meet. **Anglų kalba OK.**  
(2026-09-03 — jei skaitai tą pačią dieną, Meet yra popiet.)

---

## Trial account (2026-09-03 — Nada testuojasi)

**Tuščia org** — jokių fake mokinių/docentų/pamokų. Tik **3 licencijos** + **manual payments** + NL UI.

| | |
|---|---|
| **Admin login** | https://tutlio.lt/company/login |
| **El. paštas** | `bijlesdetoekomst@outlook.com` |
| **Slaptažodis** | `TutlioQaDemo2026!` (gali pakeisti profilyje) |
| **Licencijos** | 3 (docentų dar neįdėta) |

**Seed iš naujo (išvalo viską):** `node scripts/seed-haarlem-bijles-demo.mjs`

---

## Ką ji parašė / ko nori

Nada El Abouti, bijlesbedrijf **Haarlem** (Nyderlandai). Svetainė dar **negyva**.

- ~**10 mokytojų**
- **Individualios** pamokos + **mažos grupės**
- **Basisschool** (pradinė) + **middelbare** (vidurinė: havo / vwo ir pan.)
- Vienas org admin vaizdas: **lankomumas**, **tvarkaraščiai**, **mokytojų deklaracijos / išmokos**, **mokinio ir pamokos duomenys**
- Mokytojo **komentarai po pamokos matomi organizacijai** (ne tik pačiam korepui)

Tai **company** srautas (kaip Mano Korepetitorius), **ne** mokykla (sutartys / GoSign) ir **ne** Pro Klasė (Pro Klasė payout taisyklės prikabintos prie konkretaus org ID).

---

## Ką mes padarėme

### 1. Demo org produkcijos DB (`cuhciqwmqfuajeeqjjbm`)

| | |
|---|---|
| Pavadinimas | **Bijles Haarlem** |
| Slug | `bijles-haarlem` |
| Org ID | `c4a00000-7e57-4000-8000-000000000001` |
| Tipas | `company`, locale `nl`, 10 licencijų |
| Seed | `node scripts/seed-haarlem-bijles-demo.mjs` (idempotentus) |

**Prisijungimai** (visi: `TutlioQaDemo2026!`):

| Rolė | El. paštas | Kur |
|------|------------|-----|
| Admin (vardas UI: Nada El Abouti) | `haarlem.demo.admin@tutlio.lt` | https://tutlio.lt/company/login |
| Mokytoja Sanne (wiskunde) | `haarlem.demo.tutor@tutlio.lt` | `/login` arba `/login?org=bijles-haarlem` |
| Mokytojas Thomas (Engels) | `haarlem.demo.tutor2@tutlio.lt` | tas pats |

Yra ir tutor3–tutor10 (`haarlem.demo.tutor3@tutlio.lt` … `tutor10@`).

**Duomenys (po antro seed):** ~25 mokiniai visiems 10 mokytojų, ~140 pamokų (įvykusios + komentarai, 1 neatvykimas, 1 atšaukimas, būsimos), maža grupė trečiadieniais 16:00 (Finn, Julian, Fleur), Tess ketvirtadienį 15:30 (po Meet 13:45, kad nepersidengtų), visų mokytojų pasikartojantis laikas pr–pn 15:00–20:00, 5 paketai, 2 rugpjūčio sąskaitos (`BH-2026-08-01` / `02`). Komisija demo: `company_commission_percent` ~24–28 €/pam. (ne Pro Klasė formula).

**Flag’ai:** kalendoriaus view + **full_control**, `tutor_lesson_status_confirmation`, student overview, branding / white-label, `school_teacher_labels` („docent“), paketai + per-lesson.

### 2. Olandų kalba (UI žodynas)

Peržiūra: nėra likusių EN pastraipų, bet buvo kalkės (`Begin nu met gebruiken`, `Dashboard`, `no-show`, `je`/`u` mix support’e, `klas 9–12` mockup’uose ir pan.).

Pataisyta `nl.ts`, `nlQuiz.ts`, `supportTranslations.ts`, `schoolInstructionsTranslations.ts`, `api/feature-render.ts` („From the blog“). Testas `tests/lib/i18n-nl-quality.test.ts`.

**Ribos, ko NL vis tiek nepadengia Meet’e:** auth laiškų **subject** vis dar EN (Supabase 255 simb. limitas); school sutarčių / įmokų laiškai API vis dar LT/EN; teisiniai tekstai cituoja **Lietuvos** įstatymus — NL rinkai tai pasakyti atvirai.

Kodas: šaka `alano-local`, commit su NL + Pro Klasė slot pick (~`74c3a98`). Vercel prod deploy **buvo atšauktas** (`DEPLOYMENT_CANCELED`) — prieš Meet patikrinti, ar `tutlio.lt` jau turi NL pataisas ir Haarlem branding. Jei ne — `npm run vercel:deploy-prod` iš `alano-local`.

### 3. Kas tai **nėra**

- Ne tikra Nada paskyra ir ne jos mokiniai.
- Nesiuntėme jai laiškų / kvietimų.
- Haarlem **ne** `isProKlaseOrg` — deklaracijos = org komisiniai nuo pamokos, ne Pro Klasė valandinis / baudos.

---

## Kaip paleisti Meet’e (5 min)

1. Admin: https://tutlio.lt/company/login → `haarlem.demo.admin@tutlio.lt`
2. Kalba **Nederlands** (org `preferred_locale` jau `nl`).
3. **Overzicht** — mėnesio pamokos / pajamos.
4. **Tvarkaraštis** — Sanne, grupė wo 16:00, Tess do 15:30.
5. **Mokiniai** — Tess / Finn kortelė: komentaras matomas org, individuali kaina jei reikia.
6. **Pamokos** — completed + tutor comment; neatvykimas (Milan).
7. **Finansai / sąskaitos** — BH-2026-08-*.
8. Jei nori mokytojo akies: Sanne `haarlem.demo.tutor@tutlio.lt`.

Jei login stringa — `.env` gali rodyti seną Supabase; produkcija `cuhciqwmqfuajeeqjjbm`.

---

## Klausimai Meet’e (prioritetas)

**Operacijos**

1. Kas veda tvarkaraštį — adminas, mokytojai, ar abu? Ar adminas turi kurti laisvą laiką mokytojui (kaip Mano Korepetitorius — tam reikia `org_admin_calendar_full_control`)?
2. Grupės: kiek vaikų, ar fiksuota savaitės diena, ar ad-hoc?
3. Lankomumas: ar pakanka „įvyko / neatsirado“, ar reikia tėvams laiško (pas mus cron join-no-show tėvų **ne** pingina; laiškas tik po rankinio žymėjimo)?
4. Komentarai: tik org viduje, ar tėvai / mokinys irgi mato?

**Pinigai (čia skylė — ji minėjo deklaracijas)**

5. Kaip mokate mokytojus: fiksuota suma už pamoką, % nuo kainos, valandinis, mėnesio deklaracija?
6. Kas surenka pinigus iš tėvų — įmonė (jūs), ar mokytojas? Stripe / pavedimas / iDEAL?
7. Ar tėvai perka **paketus**, moka **už pamoką**, ar **mėnesio** sąskaitą?
8. Ar reikia Nyderlandų sąskaitos (KvK, BTW), ar kol kas užtenka Tutlio S.F. layout’o?

**Produktas / startas**

9. Kada nori startuoti ir su kiek mokytojų pirmą savaitę (demo turi 10 licencijų)?
10. White-label: savo domenas / login `?org=bijles-haarlem` / spalvos — ar brandas jau yra, jei svetainė negyva?
11. Tėvų portalas — ar tėvai turi jungtis, ar tik el. paštas?
12. Ar mokiniai patys rezervuoja, ar tik adminas / mokytojas deda į kalendorių?

**Teisė / NL**

13. Ar OK, kad T&C / privatumas kol kas LT teisė, kol nebus NL teisinio teksto?
14. Asmens kodai / BSN — NL dažnai vengiama; mūsų school formos prašo LT laukų. Company Haarlem šito neturėtų kišti.

**Kaina**

15. Kiek moka Tutlio: enterprise licencijos (kaip `/pricing` B2B), ar kitas dealas?
16. Ar nori palyginti su Mano Korepetitorius modeliu (korep išrašo S.F. įmonei)?

---

## Po Meet — greiti next step’ai

- Jei patiko: tikra org (ne `c4a…` demo), jos el. paštas adminu, licencijų skaičius, branding.
- Jei nori Pro Klasė stiliaus payout — **ne** jungti Haarlem prie Pro Klasė org ID; atskirai aptarti taisykles.
- Jei deploy vis dar atšauktas: paleisti `npm run vercel:deploy-prod` iš `alano-local`.
- Seed perrašyti: `node scripts/seed-haarlem-bijles-demo.mjs` (tik šitą org).

---

*Paskutinis atnaujinimas: 2026-09-03. Demo Meet 13:45–14:15.*
