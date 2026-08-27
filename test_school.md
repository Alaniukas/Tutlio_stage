# Demo Mokykla — pilnas testavimo planas

Dokumentas skirtas eiti visą school modulį (įskaitant `alano-local` commitus ir vėlesnius 14 d. click-wrap pataisymus). Galima atsidaryti kitame PC.

**Šaka:** `alano-local`  
**DB:** stage Supabase `cuhciqwmqfuajeeqjjbm` (ne `tutlio.lt` produkcija)  
**App:** `http://localhost:3000` · API `http://localhost:3002`  
**Laiškai:** `alaniukasa@gmail.com` (QA mokinių `payer_email`)

**Nedėti į produkciją** extra-lessons, klasės grupių, įrašų, join no-show, mokytojų sutarčių WIP ir 14 d. legal stulpelio be atskiro patvirtinimo.

---

## 0. Kitas PC — paruošimas

1. `git clone` / `git fetch` ir `git checkout alano-local`.
2. Jei testuoji **14 d. atsisakymą / Atsisakyti vs Nutraukti**, darbo kopijoje turi būti ir nekomituoti failai (arba vėlesnis commit): `SchoolExtraLessonsAccept.tsx`, `extra-lessons-parent-contracts.ts`, migracija `20260827120000_extra_lessons_start_within_14.sql`. Be jų veikia tik `9fe5009` bazinis extra-lessons.
3. `.env.local` iš stage raktų (URL turi būti `cuhciqwmqfuajeeqjjbm.supabase.co`). **Nenaudok** senojo `xklzjhfztjxltrdkplog`. Windows: jei OS env turi seną `SUPABASE_URL`, vis tiek turi laimėti `.env.local` / `.env` failas.
4. `npm install` tada `npm run dev` (PowerShell: komandas skirk `;`, ne `&&`).
5. Stage migracijos extra-lessons + 14 d. stulpeliai jau turi būti uždėti. Jei accept/withdraw krenta dėl stulpelio — trūksta `start_within_14_status`.
6. Seed (pasirinktinai, jei nėra QA mokinių):

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
- Tušti laukai: `http://localhost:3000/school-extra-lessons-accept?token=legalqasparsecccccccccccccccccccccccccccccccc`

Po vieno sėkmingo accept tokenas sunaudojamas — tada naują pasiūlymą siųsk iš admin UI (laiškas į Gmail).

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
- [ ] Tipas grupė / individualu; grupė iš sąrašo užpildo slotus.
- [ ] Kaina / bazinės pamokos mėn. → orientacinė mėnesio suma.
- [ ] Galima palikti tuščią grafiką/datą — tėvas pildo accept puslapyje.
- [ ] Siųsti → laiškas `school_contract_extra_offer` į mokėtoją, nuoroda `/school-extra-lessons-accept?token=`.
- [ ] Sąraše matosi extra sutartis atskirai nuo metinės.



## A7. Extra-lessons — tėvų accept (bazinis `9fe5009`)

- [ ] Viešas puslapis be school login.
- [ ] Visas sutarties tekstas.
- [ ] Sutikimo checkbox + užsakymas.
- [ ] Po accept: `signing_status = signed`, `document_sha256`, `accepted_at`.
- [ ] Laiškas tėvui (su PDF, jei converter veikia).



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



# C. Po `9fe5009` — 14 d. teisė (darbo kopija / legal seed)

Be šių failų skyrių C praleisk.

## C1. Accept UI

Tekstai:

- Teisinis: *Perskaičiau Sutartį, susipažinau su jos priedais…*
- 14 d. (tik jei pirma pamoka **per 14 kalendorinių dienų, Europe/Vilnius**): *Noriu, kad vaikas galėtų pradėti lankyti pamokas iš karto…* — **nepažymėtas**.
- Mygtukas: **Užsakymas su prievole sumokėti**.
- Nuoroda į `/legal/extra-lessons-withdrawal-form.html`.


| Sutartis            | Checkbox 14 d.                             | Po accept `start_within_14_status` |
| ------------------- | ------------------------------------------ | ---------------------------------- |
| `PP-LEGAL-WITHIN14` | matomas                                    | be varnelės `no`; su varnele `yes` |
| `PP-LEGAL-AFTER14`  | nėra                                       | `na`, shown text tuščias           |
| `PP-LEGAL-SPARSE`   | priklauso nuo tėvo užpildytos pirmos datos | SHA nuo **sujungto** order         |


- [ ] API ignoruoja kliento `yes`, jei pagal order išeina `na`.
- [ ] `accepted_by_user_id` = tėvo auth (ne vaiko id). `naudotojo_ID` placeholder — tėvo paskyra/el. paštas.
- [ ] PDF laiške; `document_sha256` įšaldo parodytą 14 d. tekstą.



## C2. Starto vartai

- [ ] `no`: pamokos ir sąskaita **ne** anksčiau nei `accepted_at + 14 d.` (Vilnius data).
- [ ] `yes`: galima iš karto; atsisakius per 14 d. mokama už jau suteiktas.
- [ ] `na`: startas pagal grafiką (jau po 14 d.).
- [ ] Cron nesiunčia 0 € sąskaitos už periodą prieš service start.



## C3. Atsisakyti vs Nutraukti

Tėvas: `demo-mokykla.extra.parent@tutlio.lt` → tėvų dashboard extra-lessons blokas.

- [ ] `PP-LEGAL-WITHDRAW` (~2 d.): **Atsisakyti** → `extra_end_kind = withdrawal`, pareiškimas PDF, laiškas withdrawn. **Mokytojui laiško nėra.**
- [ ] `PP-LEGAL-TERMINATE` (~20 d.): **Nutraukti** → `termination`.
- [ ] Po veiksmo mygtukai dingsta; PDF / pareiškimas atsisiunčiami.
- [ ] Tas pats iš token puslapio po accept, kol langas galioja.



## C4. Tėvų sutarčių API

Sąrašas eina per `parent_profiles.user_id` → `parent_students` **ir** `students.parent_user_id` (ne per neegzistuojantį `parent_students.parent_user_id`).

- [ ] Portale matosi WITHDRAW + TERMINATE (ir ką tik accepted).

---



# D. Greitas kelias „praeiti viską per 45 min“

1. Login admin → mokiniai filtrai + šiukšlinė + Excel.
2. Grupės meniu (**Įrašai** parked — neturi būti).
3. Sutartys: filtrai + skeno dialogas (be eSign = iškart pasirašyta).
4. Finansai: įmokos placeholder + suvestinė XLSX.
5. Extra pasiūlymas iš mokinio → Gmail.
6. Trys accept URL (C1).
7. Tėvo login → atsisakyti / nutraukti.
8. Mokytojo login: etiketės, kalendorius; **nėra** school admin meniu.
9. Buhalterė / limited — teisės.
10. WIP mokytojų sutarčių **neieškoti** kaip gatavo.

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
| darbo kopija          | 14 d. TAIP/NE/NETAIKOMA, atsisakyti vs nutraukti, parent PDF, billing vartai                 |


Detalesnis 14 d. mini planas: `docs/SCHOOL_EXTRA_LESSONS_LEGAL_TEST_PLAN.md`.