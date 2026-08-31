# Papildomų pamokų sutartis — 14 d. atsisakymas (QA planas)

**Aplinka:** stage Supabase `cuhciqwmqfuajeeqjjbm` (ne produkcija).
**Lokalus app:** `http://localhost:3000` (`npm run dev`; API `:3002`).
**Feature flag:** `school_extra_lessons_contract` (Demo Mokykla).
**Seed:** `node scripts/seed-school-extra-lessons-legal-qa.mjs` (pirmiau `seed-school-extra-lessons-qa.mjs`, kad būtų įkeltas DOCX).
**Šablonas:** `docs/legal/extra-lessons-laisvi-vaikai.docx`. Converter: `DOCX_CONVERTER_URL` + `DOCX_CONVERTER_API_KEY` arba LibreOffice.

Laiškai (pasiūlymo nuorodos) eina į `alaniukasa@gmail.com`. Fake portalų loginai — žemiau ir seed išvestyje.

Pilnas school planas (mokiniai, grupės, finansai + extra): `test_school.md` §3b.

---

## Prisijungimai

| Rolė | URL | El. paštas | Slaptažodis |
|------|-----|------------|-------------|
| School admin | `/school/login` | `demo-mokykla.demo.admin@tutlio.lt` | `TutlioQaDemo2026!` |
| Mokytojas | `/login` | `demo-mokykla.demo.tutor@tutlio.lt` | `TutlioQaDemo2026!` |
| Tėvas (portalas) | `/login` → tėvų portalas | `demo-mokykla.extra.parent@tutlio.lt` | `TutlioQaDemo2026!` |

Viešas click-wrap **be login** — token URL iš laiško / seed konsolės:

- WITHIN14: `http://localhost:3000/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- AFTER14: `http://localhost:3000/school-extra-lessons-accept?token=legalqaafter14bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
- SPARSE: `http://localhost:3000/school-extra-lessons-accept?token=legalqasparsecccccccccccccccccccccccccccccccc`

---

## Paruošti scenarijai (po seed)

| Sutartis | Pirma pamoka | Ką tikrinti |
|----------|--------------|-------------|
| `PP-LEGAL-WITHIN14` | per 14 kalendorinių dienų (Vilnius) | Checkbox **matomas**, nepažymėtas; be jo vis tiek galima užsakyti (statusas `no`); su juo — `yes` |
| `PP-LEGAL-AFTER14` | po 14 d. | Checkbox **paslėptas**; DB `start_within_14_status = na` |
| `PP-LEGAL-SPARSE` | admin paliko tuščius laukus (tipas, kiekiai, grafikas) | Tėvas užpildo geltonoje juostoje; SHA nuo **sujungto** order |
| `PP-LEGAL-WITHDRAW` | jau pasirašyta prieš ~2 d. | Portale **Atsisakyti** (ne Nutraukti) |
| `PP-LEGAL-TERMINATE` | pasirašyta prieš ~20 d. | Portale **Nutraukti** |

---

## TC-00 — Tikra DOCX sutartis (prieš visus checkbox’us)

1. Atidaryk WITHIN14 URL.
2. Iframe **Sutarties dokumentas** + **Atidaryti visą PDF**.
3. Turi būti ~7 psl. VšĮ „Laisvi vaikai“ maketas (kodas 306698942, Swedbank, 1 PRIEDAS), užpildyti `PP-LEGAL-WITHIN14` / vaikas / kaina — **ne** Times-Roman santrauka ir **ne** `{{sutarties_nr}}`.
4. Po accept PDF persigeneruoja: SHA, sutikimo **TAIP**, 14 d. **TAIP** arba **NE**.

Jei TC-00 failina — TC-02..07 PDF dalies nevertink kaip pass.

---

## TC-01 — Admin pasiūlymas

1. `/school/contracts` → papildomų pamokų pasiūlymas (arba mokinio kortelė).
2. Palik dalį laukų tuščių (grafikas / pradžia) — tėvas turi galėti užpildyti accept puslapyje.
3. Siųsti. Laiškas į `alaniukasa@gmail.com` su mygtuku į `/school-extra-lessons-accept?token=…`.

---

## TC-02 — Click-wrap (14 d. taikoma)

1. Atidaryk `PP-LEGAL-WITHIN14` URL.
2. Teisinis checkbox privalomas; 14 d. checkbox **ne** pažymėtas pagal nutylėjimą.
3. Be 14 d. varnelės spausk **Patvirtinti sutartį** → priimta, `start_within_14_status = no`, paslaugos startas = accept + 14 d. (Vilnius).
4. Pakartok su nauju pasiūlymu ir **pažymėta** 14 d. varnele → `yes`, pamokos gali prasidėti iš karto.
5. Laiškas tėvui su PDF priedu; `document_sha256` užšaldomas (įskaitant parodytą 14 d. tekstą).
6. Sėkmės ekrane **nėra** „Atsisakyti sutarties“.

---

## TC-03 — Click-wrap (NETAIKOMA)

1. `PP-LEGAL-AFTER14` — 14 d. checkbox nėra.
2. Po accept `start_within_14_status = na`, `start_within_14_shown_text` tuščias.
3. Klientas negali priversti `yes` per API, jei pirma pamoka jau po 14 d.

---

## TC-04 — Įrašų sutikimas

**Dabar parked:** Demo Mokykla `school_lesson_recordings = false`, todėl accept UI **neturi** įrašų checkbox.
Jei org turi flag `true`: atskiras checkbox, ne tas pats kaip 14 d.
Jei flag išjungtas — įrašų klausimo nėra (`recording_consent` NETAIKOMA).

---

## TC-05 — Tėvų portalas: atsisakymas vs nutraukimas

1. Login kaip `demo-mokykla.extra.parent@tutlio.lt` → `/parent`.
2. `PP-LEGAL-WITHDRAW` → **Atsisakyti sutarties** → pareiškimas PDF + laiškas `school_contract_extra_withdrawn` mokėtojui. Mokytojui / mokyklai **nėra** atskiro laiško.
3. `PP-LEGAL-TERMINATE` → **Nutraukti sutartį** → `extra_end_kind = termination`.
4. Po veiksmo mygtukai dingsta; galima atsisiųsti sutarties / pareiškimo PDF.
5. Token / sėkmės ekrane po accept atsisakymo mygtuko **nėra** — tik portale.

---

## TC-06 — Billing ir materializacija

1. Statusas `no`: iki service start datos cron `bill-school-extra-lessons` **nesiskaito** periodo / nesiunčia 0 € sąskaitos.
2. Klasės grupės pamokos materializuojamos tik nuo leistinos starto datos, kai sutartis susieta su `student_id` + `class_group_id`.
3. Extra pamoka į sąskaitą tik jei `school_billing_kind = extra` ir mokinys joined / completed (`no_show` ne).

---

## TC-07 — SHA / redakcija

Pakeitus order po accept — tėvas vis tiek mato tą patį užšaldytą tekstą; naujas pasiūlymas = nauja redakcija / naujas token.

---

## Ko netestuoti produkcijoje

Šio srauto **nedeployinti** į `tutlio.lt` be atskiro patvirtinimo. Mokytojų sutartys (GoSign teacher) — atskiras WIP, čia neįeina.
