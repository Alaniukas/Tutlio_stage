# VšĮ „Laisvi vaikai“ – finansų suvestinės klaida (2026-09)

**Org ID:** `2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17`  
**Kontekstas:** buhalterė pastebėjo ~€250 skirtumą tarp Tutlio finansų suvestinės ir Stripe banko.  
**Išvada:** pinigų Stripe neprarado. Problema – ataskaitos logika ir filtrai.

Buhalterės Excel: [`docs/exports/Laisvi-vaikai-mokejimu-suderinimas-2026-09-11.xlsx`](exports/Laisvi-vaikai-mokejimu-suderinimas-2026-09-11.xlsx)

---

## Simptomai

1. Tutlio suvestinėje dalis **bankinių** mokėjimų rodoma kaip **Stripe**.
2. Kai kurios dienos (pvz. 2026-08-04) – Tutlio „Stripe“ suma **€1700**, Stripe banke **€1400** (skirtumas **€300** = vienas klaidingai priskirtas bankinis).
3. Archyvuotų sutarčių jau apmokėtos įmokos **dingsta** iš finansų suvestinės.
4. Stripe Dashboard metadata rodo **UUID**, ne mokinio vardą – sudėtinga suderinti.

---

## Root cause

### 1. Klaidingas mokėjimo būdo nustatymas

**Failas:** `src/lib/schoolFinanceExport.ts` → `inferPaymentMethod()`

```typescript
return stripeCheckoutSessionId ? 'stripe' : 'manual';
```

Stripe laikomas, jei egzistuoja `stripe_checkout_session_id`. Tačiau session ID įrašomas jau **sukūrus mokėjimo nuorodą** (`api/pay-school-installment.ts`), net jei mokėtojas **niekada neapmokėjo** per Stripe.

Kai adminas vėliau pažymi **„Apmokėta rankiniu“** (`api/confirm-school-installment-manual.ts` → `markSchoolInstallmentPaidAndMaybeInvite`):

- `payment_status` → `paid` ✓
- `stripe_payment_intent_id` lieka `NULL` ✓ (teisingai – ne Stripe)
- `stripe_checkout_session_id` **neišvalomas** ✗

**Teisingas Stripe identifikatorius:** `stripe_payment_intent_id IS NOT NULL` (nustatomas webhook / `confirm-school-installment-payment` po sėkmingo Checkout).

### 2. Archyvuotos sutartys išfiltruojamos

**Failas:** `src/hooks/useSchoolPaymentsData.ts`

```typescript
.is('archived_at', null)
```

Finansų suvestinė (`CompanySchoolFinanceReport.tsx`) naudoja tik aktyvias pasirašytas sutartis. Apmokėtos archyvuotų sutarčių įmokos **neberodomos**, nors pinigai gauti.

**Prod duomenys (2026-09-11):** €400 paslėpta (3 sutartys, 3 įmokos).

### 3. Matomas €250 neatitikimas

| Efektas | Suma |
|---------|------|
| Klaidingai „Stripe“ (session be PI) | **+€650** |
| Paslėpta archyve | **−€400** |
| **Neto** | **€250** |

---

## Patvirtinti bankiniai (Swedbank, buhalterė 2026-09-11)

| Banko data | Mokėtojas | Suma | Mokinys | Tutlio sutartis |
|------------|-----------|------|---------|-----------------|
| 2026-07-29 | Raimonda Širvytė | €350 | Palaima Jokūbas | SUT-20260724-1158 (€50 + €300) |
| 2026-07-28 | Gerda Viskontė | €300 | Viskontas Adrijus | SUT-20260723-1741 |
| 2026-07-28 | Edita Palskė | €290 | Palskė Neda | SUT-20260724-1200 (€50 + €240) |
| 2026-07-28 | Edita Palskė | €300 | Palskis Edas | SUT-20260723-1625 |

Visi keturi – **banko pavedimai**. Tutlio DB sumos teisingos; keisti DB **nereikia**.

### Klaidingai Stripe (3 įmokos, €650)

| Mokinys | Suma | Session | PI |
|---------|------|---------|-----|
| Palaima Jokūbas #1 | €50 | taip | ne |
| Viskontas Adrijus #1 | €300 | taip | ne |
| Palskis Edas #1 | €300 | taip | ne |

---

## Ką reikia pataisyti (implementacija)

### P1 – Ataskaitos logika (frontend)

- [ ] `inferPaymentMethod()` – `'stripe'` tik jei `stripe_payment_intent_id` (arba ateityje `paid_via === 'stripe'`)
- [ ] `buildSchoolFinanceRows()` – perduoti `stripe_payment_intent_id`, ne tik session ID
- [ ] `useSchoolPaymentsData` – finansų suvestinėje **įtraukti archyvuotų** sutarčių jau apmokėtas įmokas (atskirai pažymint „archyvuota“) ARBA eksporto filtras „įskaitant archyvą“
- [ ] Atnaujinti `tests/lib/school-finance-export.test.ts`

### P2 – Rankinis apmokėjimas (API)

- [ ] `markSchoolInstallmentPaidAndMaybeInvite()` – kai `stripePaymentIntentId` nepaduotas (rankinis):
  - išvalyti `stripe_checkout_session_id` (arba nustatyti `paid_via = 'manual'`)
- [ ] Migracija: `school_payment_installments.paid_via` (`'stripe' | 'manual' | null`) – kaip jau planuota monthly invoices (`20260905120000_school_monthly_invoice_payments.sql`)

### P3 – Istoriniai duomenys (vienkartinis prod fix)

- [ ] 3 klaidingi įrašai: `stripe_checkout_session_id = NULL` kur `payment_status = paid` ir `stripe_payment_intent_id IS NULL` (arba backfill `paid_via = manual`)
- [ ] Neprivaloma: archyvuotų įmokų eksportas buhalterei (Excel jau sugeneruotas)

### P4 – Stripe Connect matomumas (buhalterei)

- [ ] `api/pay-school-installment.ts` – metadata papildyti:
  - `student_name`, `contract_number`, `payer_name`
- [ ] Finansų eksporte – stulpelis `stripe_payment_intent_id`, sutarties nr.
- **Pastaba:** jau įvykusių mokėjimų metadata Stripe nekeičiama; line item aprašyme vardas jau yra.

---

## Susiję failai

| Sritis | Failas |
|--------|--------|
| Metodo inferencija | `src/lib/schoolFinanceExport.ts` |
| Suvestinės UI | `src/pages/company/CompanySchoolFinanceReport.tsx` |
| Duomenų hook | `src/hooks/useSchoolPaymentsData.ts` |
| Rankinis paid | `api/confirm-school-installment-manual.ts` |
| Mark paid helper | `api/_lib/schoolBookingInvite.ts` |
| Checkout nuoroda | `api/pay-school-installment.ts` |
| Stripe webhook | `api/stripe-webhook.ts` (school installment) |
| Testai | `tests/lib/school-finance-export.test.ts` |

---

## QA po pataisos

1. Sukurti installment → sugeneruoti Stripe nuorodą → **ne** mokėti → pažymėti rankiniu → suvestinėje **Bankas**, ne Stripe.
2. Stripe Checkout sėkmė → suvestinėje Stripe + PI ID.
3. Archyvuoti sutartį su apmokėta įmoka → įmoka vis tiek matoma suvestinėje (su „archyvuota“ žyma).
4. Eksportuoti XLSX – dienos, kuriose anksčiau buvo skirtumas (2026-07-30, 2026-08-04), sutampa su Stripe banku.
5. Naujas Checkout – Stripe metadata turi mokinio vardą ir sutarties numerį.

---

## Generuoti buhalterės Excel iš naujo

```bash
node scripts/generate-laisvi-vaikai-reconciliation-xlsx.mjs
```

Reikia `.env.local` su `SUPABASE_SERVICE_ROLE_KEY` (prod ref `cuhciqwmqfuajeeqjjbm`).
