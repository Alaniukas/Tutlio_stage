# Demo Mokykla — pilnas testavimo planas

Dokumentas skirtas eiti visą school modulį ant `alano-local` (extra-lessons, 14 d. click-wrap, **tikra Laisvi vaikai DOCX sutartis**). Galima atsidaryti kitame PC ir eiti checkbox’us iš eilės.

**Šaka:** `alano-local`
**DB:** stage Supabase `cuhciqwmqfuajeeqjjbm` (ne `tutlio.lt` produkcija)
**App:** `http://localhost:3000` · API `http://localhost:3002`
**Laiškai:** `alaniukasa@gmail.com` (QA mokinių `payer_email`)
**Sutarties šablonas (repo):** `docs/legal/extra-lessons-laisvi-vaikai.docx` (API kopija `api/_lib/templates/`)

**Nedėti į produkciją** extra-lessons, klasės grupių, įrašų, join no-show, mokytojų sutarčių WIP ir 14 d. legal stulpelio be atskiro patvirtinimo.

---

## 0. Kitas PC — paruošimas

1. `git fetch` ir `git checkout alano-local`. Šiame PC turi būti ir **DOCX šablonas** (`docs/legal/extra-lessons-laisvi-vaikai.docx`). Jei failo nėra — tai sena kopija; be jo tėvas vėl matys tekstinį dump’ą.
2. 14 d. atsisakymas / **Atsisakyti vs Nutraukti** jau yra `alano-local` (nebesitikėk atskirų nekomituotų failų). Migracija `20260827120000_extra_lessons_start_within_14.sql` stage turi būti uždėta. Jei accept/withdraw krenta dėl stulpelio — trūksta `start_within_14_status`.
3. `.env.local` iš stage raktų (URL turi būti `cuhciqwmqfuajeeqjjbm.supabase.co`). **Nenaudok** senojo `xklzjhfztjxltrdkplog`. Windows: jei OS env turi seną `SUPABASE_URL`, vis tiek turi laimėti `.env.local` / `.env` failas.
4. **DOCX→PDF converter** turi veikti, kitaip iframe’e bus Times-Roman tekstas, ne 7 psl. Word maketas. Lokaliai: `DOCX_CONVERTER_URL` + `DOCX_CONVERTER_API_KEY` (Railway) **arba** LibreOffice `soffice` PATH. API log’e ieškok `[extra-lessons] bundled docx`.
5. `npm install` tada `npm run dev` (PowerShell: komandas skirk `;`, ne `&&`).
6. Seed (jei nėra QA mokinių / nori šviežių extra sutarčių):

```bash
node scripts/seed-qa-demo-orgs.mjs
node scripts/seed-demo-org-admins.mjs
node scripts/seed-school-extra-lessons-qa.mjs
node scripts/seed-school-extra-lessons-legal-qa.mjs
```

Legal seed siunčia pasiūlymo nuorodas į `alaniukasa@gmail.com`, jei yra `RESEND_API_KEY`.

---



## 1. Prisijungimai

Slaptažodis visiems QA: `TutlioQaDemo2026!`


| Rolė                           | URL             | El. paštas                               |
| ------------------------------ | --------------- | ---------------------------------------- |
| School admin (savininkas)      | `/school/login` | `demo-mokykla.demo.admin@tutlio.lt`      |
| Antras admin                   | `/school/login` | `demo-mokykla.demo.admin2@tutlio.lt`     |
| Buhalterė (tik finansai)       | `/school/login` | `demo-mokykla.demo.accountant@tutlio.lt` |
| Ribotos teisės                 | `/school/login` | `demo-mokykla.demo.limited@tutlio.lt`    |
| Mokytojas                      | `/login`        | `demo-mokykla.demo.tutor@tutlio.lt`      |
| Tėvas (extra-lessons portalas) | `/login`        | `demo-mokykla.extra.parent@tutlio.lt`    |


**Login smoke (**`9fe5009` **—** `PasswordInput`**):** akių ikona rodo/slepia slaptažodį. Korep prisijungimas **ne** įleidžia į `/school/`*.

**Teisės:** buhalterė nemato mokinių/grupių redagavimo; limited nemato sutarčių/finansų; du adminai gali būti prisijungę vienu metu.

---



## 2. Feature flag’ai (Demo Mokykla)

Po seed turi būti įjungta. Tikrink `/school` navigaciją.


| Flag                            | Kas atsiranda                                                        |
| ------------------------------- | -------------------------------------------------------------------- |
| `school_extra_lessons_contract` | Papildomų pamokų pasiūlymas sutartyse / mokinio kortelėje            |
| `school_class_groups`           | Meniu **Grupės** → `/school/groups`                                  |
| `school_lesson_recordings`      | **Parkuota** — Demo = `false`. Meniu **Įrašai** ir extra-lessons įrašų checkbox **nėra**. |
| `school_join_no_show`           | Cron: mokinys nepaspaudė Join per 10 min                             |
| `school_teacher_labels`         | UI „mokytojas“, ne „korepetitorius“                                  |
| `school_contract_esign`         | GoSign (Demo dažnai **išjungta** — tada skenas iškart į Pasirašytos) |


---



## 3. Click-wrap URL (legal seed, veikia bet kuriame PC su tuo pačiu localhost)

Jei kitas PC turi savo `localhost:3000` ir tą pačią stage DB:

- Per 14 d.: `http://localhost:3000/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- Po 14 d.: `http://localhost:3000/school-extra-lessons-accept?token=legalqaafter14bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
- Pusiau užpildyta walkthrough: `http://localhost:3000/school-extra-lessons-accept?token=walkthroughhalfaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (`PP-QA-HALF`)

Po vieno sėkmingo accept tokenas sunaudojamas — tada naują pasiūlymą siųsk iš admin UI (laiškas į Gmail).

---

## 3b. Extra-lessons DOCX — ką TURI pamatyti tėvas (daryk pirmiausia)

Tai **ne** metinė GoSign sutartis ir **ne** 6 skyrių santrauka. Demo Mokykla / Laisvi vaikai pildo kanoninį Word: *„NUOTOLINIŲ PAPILDOMŲ PAMOKŲ (UGDOMŲJŲ VEIKLŲ) PASLAUGŲ SUTARTIS“* (VšĮ „Laisvi vaikai“, ~7 psl. + 1 priedas).

**Kaip eiti (5–8 min):**

1. Paleisk `npm run dev`.
2. Atidaryk WITHIN14 URL iš §3 (be school login).
3. Palauk, kol užsikraus iframe **Sutarties dokumentas** (converter gali užtrukti iki ~20 s; viršuje gali būti „Atnaujinama peržiūra…“).
4. Spausk **Atidaryti visą PDF** — naujas tabas, galima scrollinti visus puslapius.

**Pass — iframe / PDF:**

- [ ] Antraštė kaip Word’e, **ne** „Papildomu pamoku sutartis“ Times Roman be lietuviškų raidžių.
- [ ] ~7 puslapiai (poraštė: *VšĮ „Laisvi vaikai“ | Tutlio sistemos sutarties šablonas | Redakcija 2026-08-19*).
- [ ] 1 skyrius: paslaugų teikėjas **VšĮ „Laisvi vaikai“**, kodas `306698942`, direktorė Akvilė Adomaitytė (šie laukai **nėra** `{{...}}` — hardcoded).
- [ ] Dinaminiai laukai **užpildyti**, ne palikti kaip `{{sutarties_nr}}`: sutarties nr. `PP-LEGAL-WITHIN14`, vaikas (QA Legal Per 14 d.), tėvas, paslauga, grafikas, kaina, orientacinė mėnesio suma.
- [ ] 5.2 bankas: Swedbank `LT467300010185024788`.
- [ ] Skyriai 1–11 + **1 PRIEDAS** (atsisakymo forma) pabaigoje.
- [ ] Elektroninio sudarymo įrašas: redakcija, SHA (`—` kol nepriimta), autentifikavimo būdas Tutlio paskyra, 14 d. prašymas TAIP/NE/NETAIKOMA, įrašymas NETAIKOMA (Demo flag parked).

**Fail — stabdyk ir nebekartok click-wrap, kol PDF netaisomas:**

- [ ] Vienas puslapis / santrauka „1. Šalys… 6. Teisė per 14 dienų“.
- [ ] Tušti `{{laukeliai}}` viduryje teksto.
- [ ] Metinės mokyklos sutarties maketas (kitas DOCX).
- [ ] Tik `<details>` tekstas be iframe (nėra `https://` PDF URL).

Po to eik A6 (naujas pasiūlymas iš admin) ir C1 (checkbox’ai). Po **Patvirtinti sutartį** PDF turi persigeneruoti: SHA nebe `—`, sutikimo būsena **TAIP**, 14 d. **TAIP** arba **NE**.
Sėkmės ekrane **nėra** „Atsisakyti sutarties“ — 14 d. atsisakymas tik tėvų paskyroje `/parent`.

---



# A. Commit `9fe5009` — school extra-lessons paketas



## A1. School login ir etiketės

- [ ] `/school/login` → dashboard.
- [ ] Šoninėje: **Mokytojai** (ne korepetitoriai), jei `school_teacher_labels`.
- [ ] Kalendorius `/school/tvarkarastis` (ar analogiškas org kelias) atsidaro.



## A2. Mokiniai — filtrai ir archyvas (`CompanyStudents`, enrollment)

Kelias: `/school/students`.

Numatyta: tik **Aktyvus**. 2 eilutė: filtrai + paieška + Excel.

- [ ] **Klasė** — pvz. `5 klasė` (seed: QA Aktyvus Vilnius).
- [ ] **Mokslo metai** — `2026/2027` vs `2027/2028` (būsimas).
- [ ] **Statusas:** Aktyvus / Būsimas / Išėjęs / Baigęs.
- [ ] Išėję ir baigę **nėra** pagrindiniame sąraše — **Šiukšlinė**.
- [ ] Šiukšlinėje: išėjimo data, priežastis, pastaba; galima grąžinti į aktyvų.
- [ ] Naujas mokinys: statusas + mokslo metai (siūlymas pagal datą: iki birž. 13 → praėję metai).
- [ ] **Skola:** rankinis `has_debt_manual` **arba** neapmokėta įmoka / mėnesinė S.F.
- [ ] **Sutartis:** pasirašyta / laukia / nėra (metinė **ir** extra-lessons).
- [ ] **Atvaizdas:** sutinka / nesutinka / tuščia — iš `students.media_publicity_consent`.
- [ ] **Savivaldybė** — Vilnius / Kaunas / … (ne laisvas tekstas).
- [ ] Excel: surūšiuota pagal klasę; stulpeliai: mokinys, klasė, metai, statusas, sutikimas, sutartis, mokėtojas, kontaktai.
- [ ] Extra-lessons mygtukas mokinio kortelėje atidaro pasiūlymo dialogą.

Seed `seed-school-extra-lessons-qa.mjs`: Vilnius, Kaunas+skola, būsimas Klaipėda, išėjęs, baigęs, Klaipėda extra.

## A3. Klasės grupės

`/school/groups` (`school_class_groups`).

- [ ] Sukurti grupę: pavadinimas, mokslo metai (nuo–iki), platforma, trukmė, Meet nuoroda, mokytojas.
- [ ] Savaitės slotai (pvz. antradienis 16:00–16:45).
- [ ] Nariai: keli mokiniai.
- [ ] Seed grupė: **QA Matematika 5kl (grupė)** / **QA Legal Matematika**.
- [ ] Tvarkaraštis: pamokos materializuojamos iš slotų (cron `materialize-recurring-sessions`). Extra-lessons su `start_within_14_status = no` — **ne anksčiau** nei leistina starto data.



## A4. Pamokų įrašai — **nėra QA dabar** (parked)

Maršrutas `/school/recordings` ir lentelės **paliktos**, bet produktas paslėptas, kol bus Drive Meet ingest.

- [ ] Šoninėje **nėra** **Įrašai**.
- [ ] Extra-lessons accept: **nėra** įrašų checkbox (Demo `school_lesson_recordings: false`).
- Vėliau įjungti: Demo flag `true` + `SCHOOL_LESSON_RECORDINGS_NAV_READY = true` `CompanyLayout`.



## A5. Join no-show (10 min)

Flag `school_join_no_show`. Cron kas ~5 min: `school-join-no-show`.

Pažymi `no_show` **tik jei**: yra `meeting_link`, statusas `active`, praėjo **10 min** nuo starto, mokinys **niekada** nepaspaudė Join, mokytojas **jau** prisijungė. Be mokytojo Join — neliesti (pamoka gal neįvyko).

- [ ] Seed sesija be `student_joined_at` (praeitis) — po cron turi tapti no-show (jei mokytojas joined).
- [ ] Mokinys paspaudė Join — **nėra** no-show.
- [ ] Extra billing: `no_show` **nesiskaito** kaip mokama extra pamoka.



## A6. Extra-lessons — admin pasiūlymas (`9fe5009`)

`/school/contracts` arba mokinio kortelė → **Papildomų pamokų sutartis**.

Tai **ne** atskira lentelė. `school_contracts.kind = extra_lessons`. **Ne** GoSign.

- [ ] Pasirinkti mokinį (turi `payer_email`).
- [ ] Tipas grupė / individualu — galima palikti „Tėvai pasirinks“.
- [ ] Kaina privaloma mokyklai. Bazinis kiekis, trukmė, grafikas, datos — nebūtini.
- [ ] Galima palikti tuščią grafiką/datą/tipą — tėvas pildo accept puslapyje.
- [ ] Siųsti → laiškas `school_contract_extra_offer` į mokėtoją, nuoroda `/school-extra-lessons-accept?token=`.
- [ ] Sąraše matosi extra sutartis atskirai nuo metinės (žyma + filtras **Papildomos pamokos** / **Metinės**).
- [ ] Siuntus turi ateiti laiškas į `payer_email` (ne tėvų registracijos kvietimas). Jei mokėtojo el. pašto nėra — klaida, ne tylus skip.



## A7. Extra-lessons — tėvų accept (DOCX + click-wrap)

Pirmiausia §3b (maketas). Tada:

- [ ] Viešas `/school-extra-lessons-accept?token=` **be** school login.
- [ ] Iframe + **Atidaryti visą PDF** (ne vien tekstinis `<details>`).
- [ ] Užsakymo suvestinė po dokumentu (paslauga, tipas, platforma, trukmė, grafikas, kaina).
- [ ] Teisinis checkbox *Perskaičiau Sutartį…* privalomas, **ne** pažymėtas iš karto.
- [ ] Mygtukas **Patvirtinti sutartį**.
- [ ] Po accept: sėkmės antraštė **Sutartis sudaryta**; **nėra** mygtuko „Atsisakyti / Nutraukti“. 14 d. atsisakymas — `/parent` (prisijungus kaip extra tėvas).
- [ ] `signing_status = signed`, `document_sha256`, `accepted_at`; laiškas `school_contract_extra_accepted` su PDF priedu (jei converter veikė).
- [ ] Tušti admin laukai: geltona juosta „Prašome papildyti…“ (tipas, trukmė, platforma, grafikas, datos, kiekis); PDF persigeneruoja po įvesties.



## A8. Extra-lessons — billing cron

`bill-school-extra-lessons` (1 d. mėn. 04:00 UTC). Rankiniu: lokalus API su `CRON_SECRET`.

- [ ] Bazė × kaina + extra pamokos (`school_billing_kind = extra` ir joined/completed).
- [ ] Seed: Klaipėda extra + pending `school_monthly_invoices`.
- [ ] Skola filtre mokiniuose.



## A9. Mokytojų sutartys — WIP, **ne** viso srauto

Commit’e yra `CompanyStaffContracts.tsx`, `school-contract-teacher-invite.ts`, migracija `party_kind`. **Neprijungta** prie `CompanyContracts` / `App.tsx`; `inviteTeacherToSign` `schoolContractSigning.ts` **nėra**.

- [ ] **Nesitikėk** meniu „Mokytojų sutartys“ ar mokytojo `/school-sign`.
- [ ] Jei matai import/500 — tai žinomas WIP, ne QA failas.

---



# B. Ankstesni school commit’ai (eiti kartu)



## B1. Sutarčių filtrai ir e-sign folderiai (`2fcd307`, `99201ad`)

`/school/contracts` — **dropdown**, ne company pill’ai.


| Filtras               | Tikėtina                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Visos                 | nearchyvuotos                                                                                     |
| Nepasirašyta mokyklos | `awaiting_school_signature` **arba** `signed_by_school` be tikro mokyklos parašo eilutėje         |
| Nepasirašyta tėvų     | mokykla jau pasirašiusi (`schoolHasSigned`)                                                       |
| Neužpildyti duomenys  | ne `signed` ir trūksta laukų **arba** e-sign `sent` be `completion_submitted_at` (geltona juosta) |
| Pasirašytos           | `signing_status = signed`                                                                         |


Trūkstami (school): adresas, gimimo data, tėvų ASM. kodas, tėvų tel., **atvaizdo sutikimas iš sutarties** `school_contracts.media_publicity_consent` — **ne** iš senesnio mokinio įrašo.

- [ ] PDF nuoroda = naujausias parašo PDF, tada `signed_contract_url` / `pdf_url`.
- [ ] Pagrindinis veiksmas atskirai; kiti — **Daugiau veiksmų**.
- [ ] Excel eksportuoja **dabartinį filtrą** + paiešką.



### Skeno įkėlimas (`99201ad`)

Mygtukas **Įkelti pasirašytą kopiją**.

- **Be eSign** (Demo default): iškart folderis **Pasirašytos**, failas į `signed_contract_url`.
- **Su eSign**, mokykla dar nepasirašė: dialogas — Tutlio **neanalizuoja** parašų:
  - Taip, pasirašyta abiejų → `signed`
  - Ne, mokykla dar ne → `awaiting_school_signature`, failas į `pdf_url`, direktorė gali GoSign

- [ ] Direktorė **Pasirašyti** kai `awaiting_school_signature` (įskaitant skeną).



## B2. Metinės sutartys + completion + mokėjimai

- [ ] Šablonas DOCX su `{{student_name}}` ir pan.
- [ ] Sukurti / siųsti tėvams → `/school-sign`.
- [ ] Completion forma (e-sign): be jos filtras „Neužpildyti“.
- [ ] Pasibaigusi `/school-sign` nuoroda atsinaujina (`6318ade`).
- [ ] `/school/finance?tab=payments`: **Naujas grafikas** tik prie `signing_status = signed`.
- [ ] Sumų laukai: placeholder `100.00` **nėra** reikšmė — įvesk sumą arba **Padalinti lygiai** po sutarties pasirinkimo.
- [ ] Mokėjimo nuoroda / rankinis apmokėta.
- [ ] Laiške matosi įmokų grafikas (`6f58437`); split 50€ mokestis atskira įmoka (`0dabc96` / `0e411e2`).



## B3. Buhalterijos suvestinė (`5ffd8cd`)

`/school/finance?tab=report`

- [ ] Filtrai, suvestinė, XLSX: lapas **Suvestinė** + **Mokėjimai** (autofilter, €).
- [ ] Buhalterės login mato report, nemato sutarčių redagavimo.



## B4. Complimentary / makeup (org kalendorius)

Jei school naudoja tuos pačius `CompanyTvarkarastis` veiksmus:

- [ ] Complimentary: klientui „įvyko“, pajamos 0 €.
- [ ] Makeup vizualiai atskira.

---



# C. 14 d. teisė (legal seed — jau `alano-local`)

Seed: `node scripts/seed-school-extra-lessons-legal-qa.mjs` (PowerShell: `ENV_FILE=.env.local` neveikia; naudok `$env:ENV_FILE='.env.local'; node scripts/seed-school-extra-lessons-legal-qa.mjs` arba `.env.local` jau užkraunamas skripto).

## C1. Accept UI + DOCX

Tekstai (turi sutapti su DOCX 3.2 ir 6.4):

- Teisinis: *Perskaičiau Sutartį, susipažinau su jos priedais ir privatumo pranešimu…*
- 14 d. (tik jei pirma pamoka **per 14 kalendorinių dienų, Europe/Vilnius**): *Prašau pradėti teikti paslaugas nepasibaigus 14 dienų sutarties atsisakymo terminui…* — radio **Sutinku pradėti iš karto** / **Palaukti**, pagal nutylėjimą ne „iš karto“.
- Mygtukas: **Patvirtinti sutartį**. Po sėkmės **nėra** atsisakymo mygtuko.
- Nuoroda į `/legal/extra-lessons-withdrawal-form.html`.
- PDF: §3b checklist (7 psl., užpildyti laukai).


| Sutartis            | Checkbox 14 d.                             | Po accept `start_within_14_status` |
| ------------------- | ------------------------------------------ | ---------------------------------- |
| `PP-LEGAL-WITHIN14` | matomas                                    | be varnelės `no`; su varnele `yes` |
| `PP-LEGAL-AFTER14`  | nėra                                       | `na`, shown text tuščias           |
| `PP-LEGAL-SPARSE`   | tėvas pildo tipą, trukmę, grafiką, datas, kiekį | SHA nuo **sujungto** order         |


- [ ] API ignoruoja kliento `yes`, jei pagal order išeina `na`.
- [ ] `accepted_by_user_id` = tėvo auth (ne vaiko id). `naudotojo_ID` placeholder — tėvo paskyra/el. paštas.
- [ ] PDF laiške; `document_sha256` įšaldo parodytą 14 d. tekstą.



## C2. Starto vartai

- [ ] `no`: pamokos ir sąskaita **ne** anksčiau nei `accepted_at + 14 d.` (Vilnius data).
- [ ] `yes`: galima iš karto; atsisakius per 14 d. mokama už jau suteiktas.
- [ ] `na`: startas pagal grafiką (jau po 14 d.).
- [ ] Cron nesiunčia 0 € sąskaitos už periodą prieš service start.



## C3. Atsisakyti vs Nutraukti

Tėvas: `demo-mokykla.extra.parent@tutlio.lt` → `/parent` → blokas **Papildomų pamokų sutartys**.

- [ ] `PP-LEGAL-WITHDRAW` (~2 d.): **Atsisakyti sutarties** → `extra_end_kind = withdrawal`, pareiškimas PDF, laiškas withdrawn į mokėtoją. **Mokyklai / mokytojui atskiro laiško nėra.**
- [ ] `PP-LEGAL-TERMINATE` (~20 d.): **Nutraukti sutartį** → `termination`.
- [ ] Po veiksmo mygtukai dingsta; PDF / pareiškimas atsisiunčiami.
- [ ] Click-wrap sėkmės ekrane ir token URL po accept **nėra** atsisakymo / nutraukimo mygtukų.



## C4. Tėvų sutarčių API

Sąrašas eina per `parent_profiles.user_id` → `parent_students` **ir** `students.parent_user_id` (ne per neegzistuojantį `parent_students.parent_user_id`).

- [ ] Portale matosi WITHDRAW + TERMINATE (ir ką tik accepted).

---



# D. Greitas kelias „praeiti viską per 45 min“

1. Login admin → mokiniai filtrai + šiukšlinė + Excel.
2. Grupės meniu (**Įrašai** parked — neturi būti).
3. Sutartys: filtrai + skeno dialogas (be eSign = iškart pasirašyta).
4. Finansai: įmokos placeholder + suvestinė XLSX.
5. **WITHIN14 URL → §3b DOCX** (7 psl., ne santrauka). Jei failina — čia stabdyk extra srautą.
6. Extra pasiūlymas iš mokinio → Gmail → naujas token, vėl PDF.
7. Trys accept URL (C1): WITHIN14 / AFTER14 / SPARSE.
8. Tėvo login `/parent` → **Papildomų pamokų sutartys**: atsisakyti (`PP-LEGAL-WITHDRAW`) / nutraukti (`PP-LEGAL-TERMINATE`). Ne click-wrap sėkmės ekrane.
9. Mokytojo login: etiketės, kalendorius; **nėra** school admin meniu.
10. Buhalterė / limited — teisės.
11. WIP mokytojų sutarčių **neieškoti** kaip gatavo.

---



# E. Žinomi spąstai


| Problema                          | Ką daryti                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Demo login neveikia               | `.env.local` ne tas Supabase projektas                                                   |
| Nėra Grupės                       | `school_class_groups`; perseedinti legal/extra QA                                        |
| Yra **Įrašai** meniu              | parked — turi nebūti; `SCHOOL_LESSON_RECORDINGS_NAV_READY` + Demo flag `false`           |
| Accept 500 dėl stulpelio          | 14 d. migracija                                                                          |
| Token already used                | naujas offer iš UI                                                                       |
| Laiškas su `localhost` kitame PC  | atidaryk savo `localhost:3000` su tuo pačiu token **arba** pakeisk `APP_URL` ir persiųsk |
| `100.00` įmokose                  | placeholder, ne suma                                                                     |
| Sutikimas „jau yra“ filtre        | žiūrėk sutarties `media_publicity_consent`, ne sibling mokinį                            |
| Extra pamoka ir metinė GoSign     | skirtingi `kind`; extra be GoSign                                                        |
| PDF = Times Roman santrauka       | converter neveikia (`DOCX_CONVERTER_*` / LibreOffice) arba sena šaka be `docs/legal/*.docx` |
| PDF rodo `{{sutarties_nr}}`       | payload neužsipildė — perkrauk accept; jei vis dar — bug, ne „normalu“                   |
| Iframe tuščias, tekstas `<details>` | nėra pasirašyto PDF URL; žiūrėk API log `[extra-lessons]`                                |
| Pro Klasė legal / pending package | kitas agentas; čia netestuoti nebent atskirai                                            |


---



# F. Commit’ų žemėlapis (school)


| Commit                | Ką tikrinti                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `9fe5009`             | Extra-lessons, grupės, įrašai, no-show, enrollment filtrai, teacher WIP, password akių ikona |
| `6fbe546`             | (Pro Klasė TS narrowing — ne school QA)                                                      |
| `99201ad`             | Skeno folderio dialogas eSign org                                                            |
| `2fcd307`             | 5 filtrai, `schoolHasSigned`, PDF kelias                                                     |
| `5ffd8cd`             | Finance report XLSX, rankinis sutarties upload                                               |
| `6f58437`             | Įmokų grafikas laiškuose                                                                     |
| `8c4b730`             | Mokėjimai tik `signed`                                                                       |
| `0e411e2` / `0dabc96` | Split fee, parašų eilutės po rankinio upload                                                 |
| `6318ade` / `a37ca4d` | Pasibaigęs school-sign, Dokobit PDF                                                          |
| `96c8dae` + DOCX darbas | Kanoninis Laisvi vaikai extra-lessons DOCX tėvams; 14 d. 6.4 tekstas; grupės slotai         |
| darbo kopija / HEAD     | 14 d. TAIP/NE/NETAIKOMA, atsisakyti vs nutraukti, parent PDF, billing vartai                 |


Detalesnis 14 d. mini planas: `docs/SCHOOL_EXTRA_LESSONS_LEGAL_TEST_PLAN.md`.
