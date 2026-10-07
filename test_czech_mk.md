# České MK-style demo — QA průvodce

Organizace s funkcemi jako **Mano Korepetitorius** (PVM faktury, kalendář admina, balíčky, přepsání ceny studenta), ale **UI v češtině** a fake data v češtině.

**Seed (idempotentní):** `node scripts/seed-czech-mk-demo.mjs`  
**Supabase:** produkční projekt `cuhciqwmqfuajeeqjjbm` (stejně jako ostatní QA demo).

## Přihlášení

| Role | E-mail | Heslo |
|------|--------|-------|
| **Admin organizace** | `czech.demo.admin@tutlio.lt` | `TutlioQaDemo2026!` |
| **Lektor (matematika)** | `czech.demo.tutor@tutlio.lt` | `TutlioQaDemo2026!` |
| **Lektor (chemie)** | `czech.demo.tutor2@tutlio.lt` | `TutlioQaDemo2026!` |
| **Student** | `czech.demo.student@tutlio.lt` | `TutlioQaDemo2026!` |
| **Studentka** | `czech.demo.student2@tutlio.lt` | `TutlioQaDemo2026!` |
| **Rodič** | `czech.demo.parent@tutlio.lt` | `TutlioQaDemo2026!` |

## URL

| Portál | Odkaz |
|--------|-------|
| Admin | https://tutlio.com/company/login?org=demo-ceske-doucovani |
| Lektor | https://tutlio.com/login?org=demo-ceske-doucovani&portal=tutor |
| Student | https://tutlio.com/login?org=demo-ceske-doucovani&portal=student |
| Rodič | https://tutlio.com/login?org=demo-ceske-doucovani&portal=parent |

Lokálně nahraďte `https://tutlio.com` za `http://localhost:3000`.

## Org metadata

| Pole | Hodnota |
|------|---------|
| Org ID | `c5a00000-7e57-4000-8000-000000000001` |
| Slug | `demo-ceske-doucovani` |
| Název | Demo České doučování |
| `preferred_locale` | `cs` (org + všichni uživatelé) |

## Fake data (čeština)

- **Studenti:** Lukáš Dvořák (8. třída), Tereza Horáková (6. třída), Adam Procházka (10. třída, bez přihlášení)
- **Předměty:** Matematika, Anglický jazyk, Český jazyk, Chemie
- **Plánované lekce:** 2–4 dny dopředu (po každém seedu přepočítány)
- **Rodič** Jan Horák je plátce pro všechny tři děti

## Zapnuté funkce (jako MK)

- `pvm_education_invoice` — PVM / vzdělávací faktury
- `org_admin_calendar_view` + `org_admin_calendar_full_control`
- `per_student_payment_override`
- `enable_per_lesson` + `enable_prepaid_packages`
- Fakturační profil série **DD** (demo česká firma)

## Jazyk UI — co kontrolovat

1. Po přihlášení musí být menu v češtině (Studenti, Rozvrh, Finance…).
2. Profil → jazyk **Čeština**; org má `preferred_locale=cs`.
3. Pokud vidíte angličtinu: většinou jde o klíče bez českého překladu (fallback EN) — nahlaste konkrétní obrazovku.
4. **School modul** (`/school/*`) a **admin panel** platformy zůstávají anglicky (mimo rozsah cs draftu).
5. Některé chybové hlášky v `orgAdminSessionCreate.ts` jsou stále hardcoded LT — netýká se běžného MK company flow.

## Testy

```bash
npm test -- tests/lib/i18n-cs-quality.test.ts
```
