# School follow-up spec (2026-09-05)

Specas kitam agentui. **Niekas čia dar neimplementuota.** Šaka: `simo-local`. Demo QA: Demo Mokykla; produkcijos pavyzdys defaultams: **VšĮ Laisvi vaikai** (`2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17`).

Patvirtinta su Simo:

- Dizainas: visi prisijungę portalai (admin, mokytojas, tėvai, mokinys). Landing / marketingo **neliesti**.
- Defaultai: **tik Laisvi vaikai**. Duomenys jau yra / rodomi — paimti iš grupės (ir mokytojo nuorodos), ne išgalvoti tuščiuose laukuose.
- Bazinis kiekis / mėn.: **tiksliai pagal mėnesį** (kiek tų savaitės dienų tilps), ne `× 4`.
- Laiško strikethrough Gmail’e **nėra bugas**. Dubliuojasi el. paštas: palikti vieną, **nuimti tą, kuris eina po „Tutlio komanda“**.

---

## 1. Dizainas — nav visiems portalams, mažiau AI slop

School admin šoniniame meniu jau yra: suskleidimas, kairysis accent’as aktyviam punktui, ramesnė spalva, system-ui, be CAPS sekcijų.

**Daryti analogiškai visiems authenticated layout’ams** (ne landing):

| Portalas | Failas |
|----------|--------|
| School / company admin | `src/components/CompanyLayout.tsx` |
| Mokytojas | `src/components/Layout.tsx` (jau turi expand/collapse) |
| Tėvai | `src/components/ParentLayout.tsx` |
| Mokinys | `src/components/StudentLayout.tsx` |

**Vizualus tikslas (minimaliai, vienodai visiems):**

- Aktyvus punktas: švelnus fill + **kairysis accent** (kaip school admin Statistika), ne ryškus „glass pill“.
- Plonesnės ikonos (`strokeWidth` ~1.75), normalus šriftas, ne uppercase tracking.
- Suskleidžiamas desktop meniu ten, kur dar nėra (parent/student), admin/tutor — palikti veikiantį collapse.
- Spalvas palikti pagal portalą (school tamsiai žalia, company/tutor tamsiai pilka) — **ne** unifikuoti į vieną „AI dashboard“ temą.
- **Neliesti:** landing, quiz, blog, login/register, public extra-lessons accept puslapio maketo (ten tik copy, žr. §4).

---

## 2. „Korepetit. dalis“ ir kiti hardcoded / neperrašomi staff tekstai

Screenshot: statistikos kortelė **„Korepetit. dalis“**.

Priežastis: raktas `compStats.tutorShare` LT žodyne yra santrumpa `'Korepetit. dalis'` (`src/lib/i18n/lt.ts`). School overlay keičia tik pilną žodį **korepetitorius** (ir linksnius) — **„Korepetit.“ nepagaus**.

**Daryti:**

1. School org statistikoj / finansų suvestinėj naudoti mokytojo formą, pvz. `t('role.staffSchool') + ' dalis'` arba atskiras raktas `compStats.staffShare` su overlay-friendly tekstu **„Mokytojo dalis“** (be santrumpos).
2. **Audit** visame UI + el. laiškuose (ne landing):
   - hardcoded `'Korepetitorius'` / `'Korepetit.'` fallback’ai;
   - raktai, kurių tekstas yra santrumpa ir apeina overlay;
   - `tutorName: … \|\| 'Korepetitorius'` tipo vietos (dalį jau pataisė `StudentSchedule.tsx`).
3. Bazinis LT žodynas gali likti „korepetitorius“ — school portalai per `schoolTerminology.ts`. Santrumpų **nenaudoti**.
4. Company / solo lieka „Korepetitorius“.

Pagrindiniai failai: `CompanyStats.tsx`, `OrgTutorFinanceSummary.tsx`, `compStats.tutorShare`, `schoolTerminology.ts` / `LT_ACTIVITY_KEY_OVERRIDES` jei reikia.

---

## 3. Laisvi vaikai — defaultai kuriant grupę ir extra-lessons pasiūlymą

**Scope:** tik `isLaisviVaikaiOrg()` (`LAISVI_VAIKAI_ORG_ID`). Demo Mokykla / kitos mokyklos — kaip dabar (tušti arba esami defaultai).

Duomenys **jau yra** grupėje / mokytojo profilyje — forma turi juos **prefillinti**, laukai lieka redaguojami.

### 3.1 Klasės grupės forma (`ClassGroupFormDialog`)

Jau yra `platform: 'Google Meet'`, `duration_minutes: 45`. Papildyti:

| Laukas | Default | Pastaba |
|--------|---------|---------|
| Trukmė | 45 min | palikti keičiamą |
| Platforma | Google Meet | palikti keičiamą |
| Meet nuoroda | mokytojo įkelta nuoroda, jei yra | kai pasirenkamas mokytojas — užpildyti `meeting_link`, jei tuščia; admin gali perrašyti |
| Slotai | kaip dabar | pabaiga = startas + trukmė |

### 3.2 Extra-lessons pasiūlymas (`ExtraLessonsOfferDialog`)

Dabar platforma / trukmė / kaina / bazinis kiekis **tušti**. Kai admin pasirenka **esamą grupę**:

1. Paslaugos pavadinimas ← grupės vardas (jei tuščias).
2. Tipas ← grupinė (jei dar nepasirinkta).
3. Platforma ← grupės `platform` (Laisvi vaikai: Google Meet).
4. Trukmė ← grupės `duration_minutes` (45).
5. Grafikas ← grupės slotai.
6. Meet — jei reikia snapshot’e, grupės `meeting_link` arba mokytojo nuoroda.
7. **Bazinis kiekis / mėn.** ← skaičius iš grafiko ir laikotarpio (žr. 3.3). Perskaičiuoti keičiant slotus / datas, kol admin ranka neperrašė.
8. **Kaina € / užsiėmimas** ← bazinė pagal tipą (žr. 3.4). Rankiniu būdu keičiama.

Jei grupė **nepasirinkta** (individuali): vis tiek Laisvi vaikai defaultai: 45 min, Google Meet; kaina = individuali; bazinis kiekis iš įvesto grafiko + datų.

### 3.3 Bazinis kiekis / mėn. — tikras mėnuo

Ne `pamokos_per_savaitę × 4`.

Skaičiuoti, **kiek kartų kiekvienas savaitės slotas įvyksta pasirinktame mėnesyje** (Vilnius TZ):

- Jei nurodytas `start_date` / `end_date` — langas nuo start (arba mėnesio pirmos) iki end (arba mėnesio pabaigos).
- Jei end nėra (einantys extra-lessons) — **pirmas paslaugų mėnuo** nuo `start_date` (arba einamas mėnuo, jei start tuščias).
- Praleisti datas už mokyklos metų / grupės `school_year_end`.
- Rezultatas = suma occurrence’ų tame mėnesyje (pvz. pirmadienis 10:00 rugsėjį = kiek pirmadienių).

Orientacinė mėnesio suma jau yra `indicativeMonthlyPrice(base, unit)` — palikti, kad naudotų tą patį `base`.

### 3.4 Kaina pagal tipą

Laisvi vaikai turi bazinę kainą **grupinei** vs **individualiai**. Spec’e skaičiai **nepatvirtinti** (QA seed naudoja 18 €, tėvų ekrano screenshot’e buvo 20 €).

**Prieš kodą:** paimti tikras kainas iš Laisvi vaikų (org subject templates / jų kainoraštis) ir įrašyti čia. Kol nėra — nehardcodinti 18/20 spėjimų.

Laukai redaguojami po prefill.

---

## 4. Extra-lessons accept (`SchoolExtraLessonsAccept`) — tėvų viešas puslapis

Šis puslapis **be** terminology overlay — tekstus rašyti iš karto su **užsiėmimais**, ne „pamok*“.

### 4.1 Grupinis tipas — blokas prie užsakymo suvestinės

Rodyti **tik** kai `service_type === 'group'` (grupinė):

> Grupiniai užsiėmimai užsakomi visam mėnesiui. Mokestis skaičiuojamas ir už tuos pagal tvarkaraštį įvykusius užsiėmimus, kuriuose vaikas nedalyvavo.

Individualiai šio teksto **nėra**.

### 4.2 Elgesio taisyklės — ne atskira eilutė prieduose

**Pašalinti** iš „Priedai ir kontaktai“:

`Elgesio taisyklės — kreipkitės {email}`

(`SchoolExtraLessonsAccept.tsx` ~eil. 476.)

**Privatumo pranešimas** ir **atsisakymo formos šablonas** lieka.

### 4.3 Checkbox „Perskaičiau sutartį“

Papildyti esamą privalomą checkbox tekstą (ne naujas checkbox). Pridėti:

> Patvirtinu, kad susipažinau ir sutinku su nuotolinių užsiėmimų elgesio taisyklėmis: vaikas turi prisijungti laiku savo vardu ir pavarde, laikytis mokytojo nurodymų, mandagiai bendrauti ir netrukdyti kitiems, nesidalinti užsiėmimo nuoroda bei nefotografuoti, nefilmuoti ir neįrašinėti užsiėmimo. Įsipareigoju supažindinti vaiką su šiomis taisyklėmis ir užtikrinti, kad jis jų laikytųsi.

Senas sakinys apie Sutartį / priedus / privatumo pranešimą **lieka** prieš šį bloką.

Įrašymo (media) radio **atskirai** — neliesti, nebent dubliuotųsi su „neįrašinėti“; elgesio taisyklės = draudimas tėvams/vaikui filmuoti, radio = mokyklos įrašas.

---

## 5. El. laiškai — mokyklos kontaktas vieną kartą

Offer / extra-lessons laiške dabar:

1. Žalias CTA.
2. „Jei turite klausimų, susisiekite su mokykla: irminta@laisvivaikai.lt.“
3. Parašas „Tutlio komanda“.
4. **Dar kartą tas pats el. paštas** po parašo.

**Daryti:** palikti (2). **Nuimti el. paštą po „Tutlio komanda“** (org branding / `email_team_signature` / `applyOrgBrandingToHtml`). Gmail strikethrough ignoruoti.

Patikrinti visus school tėvų laiškus (`api/send-email.ts`, `emailOrgBranding.ts`), kad mokyklos `contact` / `parentContactEmail` **nesikartotų** footer’yje, jei jau yra „Jei turite klausimų…“ eilutėje.

---

## 6. Grupės UI rodo `common.edit`

`/school/groups` mygtukas / kortelė rodo raw raktą `common.edit` vietoj „Redaguoti“.

`CompanyClassGroups.tsx` kviečia `t('common.edit')`; raktas LT žodyne **yra**. Reiškia overlay / locale load / neteisingas `t` wrapperis grąžina raktą.

**Daryti:**

- Rasti kodėl `t('common.edit')` (ir kiti `common.*`) grupių puslapyje nerendina vertimo.
- Sutikrinti visą `CompanyClassGroups` + `ClassGroupFormDialog`: jokių raw raktų (`school.groups.*`, `common.*`).
- Jei overlay „suvalgo“ trumpą žodį — override, ne keisti visą `common.edit` visoms kalboms.

---

## 7. Testai — privaloma, kad tekstai nepasprūstų

Po implementacijos **parašyti ir paleisti** testus. Be green testų darbas nebaigtas.

### 7.1 Nauji / atnaujinti testai

| Sritis | Failas (siūloma) | Ką assertinti |
|--------|------------------|---------------|
| Staff copy | `tests/lib/school-terminology.test.ts` | `compStats.tutorShare` / school share **neturi** `Korepetit` / `korepetitor`; school režime „Mokytoj*“ |
| Hardcoded staff | grep testas arba esamas terminology coverage | school UI stringai be `Korepetit.` |
| Grupės defaultai | `tests/pages/company-class-groups.test.tsx` | Laisvi vaikai: 45 min, Google Meet; Meet nuoroda iš mokytojo kai pasirenkamas tutor |
| Extra-lessons prefill | `tests/lib/extra-lessons-contract.test.ts` arba dialog testas | pasirinkus grupę — trukmė/platforma/slotai/base count; individuali vs grupė kaina (kai žinomos) |
| Mėnesio kiekis | naujas unit testas šalia `schoolClassGroupMaterialize` / extra-lessons | 1 slotas pirmadienį rugsėjį = tiek, kiek pirmadienių, ne visada 4 |
| Accept copy | `tests/pages/school-extra-lessons-accept.test.tsx` | grupinei yra mėnesio mokėjimo pastraipa; individualiai nėra; **nėra** „Elgesio taisyklės — kreipkitės“; checkbox turi elgesio taisyklių sakinį; nėra „pamok*“ |
| Email dublikatas | `tests/api/send-email-extra-lessons.test.ts` | HTML’e mokyklos el. paštas **vieną** kartą; yra „Jei turite klausimų“; po „Tutlio komanda“ **nėra** antro mailto to paties adreso |
| i18n raktai | `tests/pages/company-class-groups.test.tsx` | ekrane **nėra** teksto `common.edit`; yra „Redaguoti“ (ar locale atitikmuo) |
| i18n coverage | `tests/lib/i18n-coverage.test.ts` | nauji raktai visose 13 legacy kalbų; jokių identiškų EN prose |

### 7.2 Paleisti prieš merge

```bash
npm test -- tests/pages/school-extra-lessons-accept.test.tsx
npm test -- tests/pages/company-class-groups.test.tsx
npm test -- tests/lib/school-terminology.test.ts
npm test -- tests/lib/extra-lessons-contract.test.ts
npm test -- tests/api/send-email-extra-lessons.test.ts
npm test -- tests/lib/i18n-coverage.test.ts
```

Jei keičiamas `send-email.ts` footer — ir `tests/api/send-email-school-reminder.test.ts`.

**QA vis dar ranka** pagal `testavimo.md` (grupė → kalendorius, extra-lessons accept, laiškas į `alaniukasa@gmail.com`).

---

## 8. Sąmoningai nedaroma

- Extra-lessons GoSign / metinės sutarties kopija.
- Public 14 d. atsisakymas be paskyros.
- Defaultai kitoms mokykloms (ne Laisvi vaikai).
- Landing / quiz / support widget dizainas.
- Deploy į prod be atskiro leidimo.

---

## 9. Atvira (patikslinti prie kodo, ne blokuoti dizaino/copy)

- Tikslūs Laisvi vaikai **€ grupė vs individuali** (ne spėti iš 18/20).
- Extra-lessons be pasirinktos grupės: ar Meet nuorodą vis tiek imti iš pasirinkto mokytojo, jei dialoge mokytojo nėra — tada palikti tuščią.
- Parent/student layout’uose collapse: localStorage raktas atskiras nuo admin (`tutlio_org_sidebar_collapsed`).

*Rankinis QA po kodo: Demo Mokykla copy/terminologija; Laisvi vaikai defaultai — tik toje org (arba stage kopijoje), ne Demo kainų spėjimais.*
