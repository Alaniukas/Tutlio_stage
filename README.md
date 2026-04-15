# 🎓 Tutlio - Korepetitorių Valdymo Platforma

Moderni platforma korepetitoriams ir korepetitorių organizacijoms valdyti mokinius, pamokas, mokėjimus ir tvarkaraščius.

## 🚀 Greitas startas

### Reikalavimai
- Node.js 18+
- npm arba yarn
- Supabase paskyra
- Stripe paskyra (mokėjimams)

### Lokalus development

```bash
# 1. Įdiegti priklausomybes
npm install

# 2. Nukopijuoti .env.example į .env.local
cp .env.example .env.local

# 3. Užpildyti .env.local su savo API raktais

# 4. Paleisti development serverį
npm run dev
```

Platforma bus prieinama: `http://localhost:5173`

## 📚 Dokumentacija

- **[darbai.md](./darbai.md)** - Deployment instrukcijos į produkciją
- **[docs/](./docs/)** - Papildoma dokumentacija
- **[docs/archive/](./docs/archive/)** - Senesnė dokumentacija

## 🏗️ Technologijos

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Mokėjimai**: Stripe Connect + Stripe Checkout
- **Email**: Resend
- **Kalendorius**: React Big Calendar + Google Calendar API
- **Deploy**: Vercel

## 📁 Projekto struktūra

```
tutlio/
├── api/                    # Serverless funkcijos (Vercel)
├── src/
│   ├── components/         # React komponentai
│   ├── pages/             # Puslapiai (routes)
│   ├── lib/               # Utility funkcijos
│   └── contexts/          # React contexts
├── supabase/              # DB schema ir migrations
├── docs/                  # Dokumentacija
└── public/                # Statiniai failai
```

## ⚡ Feature Flags Sistema

Organizacijoms galima įjungti/išjungti individualias funkcijas per `/admin` panelę.

### Kaip veikia:
1. **Feature Registry** (`src/lib/featureRegistry.ts`) - apibrėžtos visos galimos funkcijos
2. **Admin Panel** (`/admin`) - toggle ON/OFF feature'us konkrečioms organizacijoms
3. **Frontend** - automatiškai slepia/rodo funkcijas pagal organizacijos nustatymus

### Naudojimas kode:
```typescript
import { useOrgFeatures } from '@/hooks/useOrgFeatures';

function MyComponent() {
  const { hasFeature } = useOrgFeatures();

  return (
    <div>
      {hasFeature('my_feature') && <PremiumFeature />}
    </div>
  );
}
```

### Pridėti naują feature:
1. Implementuoti funkciją (UI + logika)
2. Pridėti į `featureRegistry.ts`
3. Toggle ON per `/admin` panelę
4. Feature iš karto veikia organizacijai! ✅

Daugiau: [src/lib/featureRegistry.ts](./src/lib/featureRegistry.ts)

---

## 👥 Vartotojų tipai

### 1. **Korepetitoriai** (Individual Tutors)
- Prenumeratos sistema (20 EUR/mėn)
- Pamokų planavimas su kalendoriumi
- Mokinių valdymas
- Mokėjimų priėmimas per Stripe
- Google Calendar integracija

### 2. **Organizacijos** (Organization Admins)
- Centralizuotas korepetitorių valdymas
- Organizacijos statistika
- Mokėjimų valdymas
- Komisijos nustatymas

### 3. **Org Tutors** (Organization Tutors)
- Priskirti prie organizacijos
- Riboti nustatymai (valdo organizacija)
- Automatinė komisijų apskaita

### 4. **Mokiniai** (Students)
- Pamokų užsakymas
- Mokėjimai už pamokas
- Pamokų istorija
- Laukiamasis sąrašas

## 🔐 BDAR & Duomenų apsauga

Platforma atitinka BDAR reikalavimus:
- **Privatumo politika**: `/privacy-policy`
- **Vidaus taisyklės**: `/terms`
- **DPA (Data Processing Addendum)**: `/dpa`

Daugiau info: [src/pages/DataProcessingAgreement.tsx](./src/pages/DataProcessingAgreement.tsx)

## 🚢 Deployment

Žr. **[darbai.md](./darbai.md)** su išsamiomis instrukcijomis.

Pagrindiniai žingsniai:
1. Push kodą į GitHub
2. Supabase: paleisti `supabase/schema.sql`
3. Vercel: nustatyti environment variables
4. Stripe: sukonfigūruoti webhooks
5. Deploy!

## 📞 Kontaktai

- **Email**: info@tutlio.lt
- **Website**: https://tutlio.lt

## 📄 Licencija

Proprietary - MB Tutlio © 2026
