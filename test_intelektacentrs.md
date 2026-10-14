# Intelekta attīstības centrs — demo prezentācijai

MK-style company org ar **latviešu UI**, klienta **logo/krāsām** un fake datiem (bērni, paketes, rēķini, nodarbības).

**Seed (idempotent):** `node scripts/seed-intelektacentrs-demo.mjs`  
**Supabase:** `cuhciqwmqfuajeeqjjbm` (kā citi QA demo).

## Pieslēgšanās

| Loma | E-pasts | Parole |
|------|---------|--------|
| **Org admin (klients)** | `trenini@intelektacentrs.lv` | `TutlioQaDemo2026!` |
| **Org admin (Tutlio)** | `alanas@tutlio.com` | `TutlioQaDemo2026!` |
| **Speciālists** | `iac.demo.tutor1@tutlio.lt` | `TutlioQaDemo2026!` |
| **Grupu nodarbības** | `iac.demo.tutor2@tutlio.lt` | `TutlioQaDemo2026!` |
| **Vecāks** | `iac.demo.parent@tutlio.lt` | `TutlioQaDemo2026!` |

## URL

| Portāls | Saite |
|---------|-------|
| Admin | https://tutlio.com/company/login?org=intelektacentrs-demo |
| Korepetitors | https://tutlio.com/login?org=intelektacentrs-demo&portal=tutor |
| Vecāks | https://tutlio.com/login?org=intelektacentrs-demo&portal=parent |

Lokāli: `http://localhost:3000` vietā `https://tutlio.com`.

**Branding login lapā:** `?org=intelektacentrs-demo` uz `/company/login` rāda logo un krāsas no DB (kā `/login?org=…`). Bez šī parametra — standarta Tutlio navy. Pēc `CompanyLogin.tsx` labojuma vajag deploy uz prod, lai tutlio.com rādītu klienta brandingu.

## Org

| Lauks | Vērtība |
|-------|---------|
| Org ID | `c6a00000-7e57-4000-8000-000000000001` |
| Slug | `intelektacentrs-demo` |
| `preferred_locale` | `lv` |
| Krāsas | `#6941c6` / `#4353ff` (no intelektacentrs.lv Webflow) |
| Logo | `public/demo/intelektacentrs-logo.png` (no klienta CDN) |

## Fake dati

- **Bērni:** Emīlija Kalniņa, Roberts Liepa, Sofija Briede (pakalpojumu nosaukumi kā uz mājaslapas)
- **Pakete:** Emīlijai — apmaksāta (8 nodarbības), Robertam — gaidošs maksājums
- **Rēķini:** IAC-DEMO-0001 (apmaksāts), IAC-DEMO-0002 (izrakstīts)
- **Nodarbības:** 2 pabeigtas vēsturē, 1 neapmaksāta, 2 nākotnes grafikā

## Ieslēgtās funkcijas

Kā **Mano Korepetitorius** prod (`mb-mano-korepetitorius`): PVM rēķini, mēneša norēķini, priekšapmaksas paketes, org kalendārs ar pilnu kontroli, `org_payer_fee_split`, bandomās nodarbības u.c. (sk. `MK_FEATURES` seed failā).

**Piezīme:** `organization_admins.user_id` ir unikāls — ja `alanas@tutlio.com` jau bija cita org admin, seed pārvieto viņu uz šo demo org.
