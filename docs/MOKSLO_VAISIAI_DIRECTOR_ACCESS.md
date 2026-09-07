# Mokslo vaisiai — vadovė mato pajamas, administratorė operuoja

Org: `Mokslo vaisiai` (`c1f36796-c281-4650-bed2-1bd6874764f1`, slug `mokslovaisiai`).  
Tikslas: vadovė (Agnė) mato visą finansų vaizdą, bet kasdienybės nedaro. Administratorė (`info@`) operuoja (kas neapmokėjo, sąskaitos), bet **nemato mėnesio / viso pajamų suvestinių**. UX lieka tas pats — jokių „neturite teisės“ juostų.

Šis failas yra vykdymo ir QA planas. Paskyra Agnėi **jau sukurta** (2026-09-03). Produkto kodas: **`finance.totals` + diskretus dashboard/statistika UI** (2026-09-03).

---

## Dabartinė būsena (po acc sukūrimo, prieš kodą)

| Paskyra | Rolė dabar | Ką mato dabar |
|---------|------------|----------------|
| `info@mokslovaisiai.lt` | **owner** | Viską, įskaitant pajamų totalus |
| `agne.mokslovaisiai@gmail.com` | **admin** | Viską, išskyrus `/company/team` (tik owner) |

Agnė **dar nėra** owner. Owner perduosime tik **po** kodo deploy, kitaip `info@` kaip `admin` ir toliau matytų totalus.

Login: `https://tutlio.lt/company/login` (arba lokalus `http://localhost:3000/company/login`).  
El. laiško kvietimo **nesiuntėme** — acc sukurtas su patvirtintu el. paštu. Slaptažodis — pokalbyje su kūrėju, ne čia. Prieš atiduodant Agnėi: „Pamiršau slaptažodį“ tame pačiame login puslapyje.

---

## Kaip vykdyti (kodas + DB, kai sakysime „pirmyn“)

### 1. Nauja teisė `finance.totals`

`src/lib/orgAdminPermissions.ts`:

- Pridėti `finance.totals` į `ORG_ADMIN_PERMISSION_KEYS`.
- `owner` ir toliau visada `true` (Agnė po perdavimo matys viską).
- `admin` presetas **neturi** `finance.totals` (kad numatytasis admin = operatorius).
- `accountant` **turi** `finance.totals` (buhalteriui totalai reikalingi).
- Esama `finance.view` lieka operacinei daliai: neapmokėta, sąskaitos, mokėjimo nuorodos.

Atnaujinti `tests/lib/org-admin-permissions.test.ts`. Team UI grupėje prie Finansų — trečias checkbox tik jei norime, kad owner galėtų tai junginėti; pirmai versijai užtenka kodo, ne naujo checkbox UX.

### 2. Diskretus UI, kai `!can('finance.totals')`

Be geltonos `OrgPermissionRoute` „tik peržiūra“ juostos ir be tuščių skylių.

**Apžvalga (`CompanyDashboard`)**  
4 kortelių tinklelis lieka. Vietoj „Šio mėnesio pajamos“ ir „Visos pajamos“ — operaciniai skaičiai (pvz. neapmokėtų / dėmesio reikalaujančių kiekis). Be €.  
Bloką „Naujausi mokėjimai“ su sumomis Agnėi palikti; administratorei sumas slėpti arba bloką nerodyti (kad nesudėliotų mėnesio).

**Statistika (`CompanyStats`)**  
Pajamų kortelės ir € stulpeliai tik su `finance.totals`. Be teisės — pamokų / atšaukimų skaičiai, be eurų. Meniu punkto nenaikinti.

**Finansai / sąskaitos**  
Puslapis lieka (`finance.view`). Sąskaitų eilutės su sumomis OK — administratorė taip giliai nesudėlios. Nerodyti tik suvestinio „šio mėnesio pajamos = X €“, jei toks atsirastų.

Duomenų nefiltruoti RLS pirmai versijai — tik UI + nebekrauti suvestinių, jei paprasta. Tai ne banko lygio slaptumas.

### 3. Owner perdavimas (tik po deploy)

Vienu transakciniu RPC `transfer_org_admin_ownership` (jau yra, `service_role`):

1. Agnė: `admin` → **`owner`**.
2. `info@`: lieka **`owner`** su `permissions: { "finance.totals": false }` (antras super-adminas). Nemato € totalų ir nemato Agnės Komandoje. Tvarkaraštis / statistika (be €) / finansai lieka.

Daryti per service role / SQL, **ne** per `info@` UI — kitaip ji matytų kvietimą ir teisių keitimą.

Po to:

| Paskyra | Rolė | Pajamų totalai | Kasdienybė | Komanda |
|---------|------|----------------|------------|---------|
| Agnė | owner | taip | gali, neprivalo | taip (mato visus) |
| `info@` | owner (be €) | ne | taip | taip (kuria narius, nemato Agnės; statistika be €) |

### 4. Ko nedaryti

- Nekurti naujos `super_admin` rolės — `owner` jau yra.
- Neliesti `hide_admin_lesson_prices` (jau įjungta).
- Nenimti `finance.view` iš `info@` — dingtų neapmokėtos sąskaitos.
- Nedaryti dviejų owner (unique index + trigger).
- Nesiųsti Agnėi kvietimo laiško, kol ji pati neprašys prisijungti.

---

## Kaip išsitestuoti

Du langai (normalus + Incognito), kad sesijos nesusimaišytų. Prieš 3 žingsnį (owner transfer) kodas turi būti lokaliai arba stage.

### A. Dabar (prieš kodą) — ar acc gyvas

1. Incognito → `https://tutlio.lt/company/login` (arba lokalus `/company/login`).
2. `agne.mokslovaisiai@gmail.com` + laikinas slaptažodis iš kūrėjo.
3. Turi patekti į Mokslo vaisių `/company` apžvalgą.
4. Turi matyti pajamas (šį mėnesį / viso) — ji dar `admin` su pilnu `finance.view`.
5. Meniu **Komanda** neturi būti (ne owner).
6. `info@` vis dar veikia kaip iki šiol.

Jei Agnė nukrenta į tutor `/dashboard`, portalas blogas — stabdyti.

### B. Po kodo, prieš owner transfer

1. Laikinai `info@` seat'e nuimti `finance.totals` (arba testuoti su custom flag lokaliai).
2. `info@`: apžvalga be € totalų, 4 kortelės lieka, nėra „negali matyti“, Finansai atsidaro, matosi kas neapmokėjo.
3. Agnė: visos € suvestinės vietoje.

### C. Po owner transfer (produkcija)

1. Agnė: meniu **Komanda**, savininkė, visos pajamos.
2. `info@`: **Komanda** dingsta (diskretiška), apžvalga be € totalų, operacijos veikia (mokiniai, tvarkaraštis, neapmokėta, sąskaitos).
3. Abi paskyros vienu metu — dvi sesijos, duomenys tie patys, skiriasi tik totalai.

### D. Prieš atiduodant Agnėi

1. Ji pati pasikeičia slaptažodį per „Pamiršau slaptažodį“.
2. Trumpai: tu matai finansų skaičius; kasdienybę palieki administratorei; nieko papildomai spausti nereikia.

---

## Failai, kuriuos liesti, kai programuoti

- `src/lib/orgAdminPermissions.ts` + `tests/lib/org-admin-permissions.test.ts`
- `src/pages/company/CompanyDashboard.tsx`
- `src/pages/company/CompanyStats.tsx`
- Jei reikia — `CompanyFinanceHub` / `CompanyInvoices` (tik jei ten yra mėnesio totalas)
- i18n: `lt.ts` + `en.ts` naujiems kortelių labeliams (be „paslėpta“)
- DB pabaigoje: `node scripts/transfer-mokslo-vaisiai-owner.mjs` (po deploy)

Nedeployinti ir neperduoti owner be atskiro leidimo.

---

## Lokalus demo (fake duomenys)

Skriptas: `node scripts/seed-mokslo-vaisiai-finance-access-qa.mjs`  
Org: `c1b00000-7e57-4000-8000-000000000001`, slug `demo-mokslo-vaisiai`  
Slaptažodis: `TutlioQaDemo2026!` (kaip kiti QA demo)

| Vaidmuo | El. paštas | Rolė | Pajamų totalai |
|---------|------------|------|----------------|
| Agnė (demo) | `mokslovaisiai.demo.agne@tutlio.lt` | **owner** | taip |
| info@ (demo) | `mokslovaisiai.demo.info@tutlio.lt` | **owner** (`finance.totals: false`) | ne |

Login: `http://localhost:3000/company/login` (reikia `.env.local` su stage Supabase).

Fake: 2 korepetitoriai, 3 mokiniai, ~60 € šį mėnesį + senesnė pamoka, neapmokėtos pamokos (Reikia dėmesio), S.F. 120 € apmokėta + 85 € išrašyta.

Testuok du naršyklės langus: Agnė mato € korteles ir Statistikoje sumas; info@ — Statistika su pamokų skaičiais (be €), Apžvalgoje be pajamų kortelių, bet Finansai / sąskaitos / tvarkaraštis veikia.
