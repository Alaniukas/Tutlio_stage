# 📅 Google Calendar Integracija - Setup Guide

## ✅ Kas padaryta:

### 1. **Database Schema**
Pridėti stulpeliai į `profiles`:
- `google_calendar_access_token` - OAuth access token
- `google_calendar_refresh_token` - OAuth refresh token
- `google_calendar_token_expiry` - Token galiojimo laikas
- `google_calendar_connected` - Ar prijungtas
- `google_calendar_sync_enabled` - Ar sync įjungtas

Pridėti stulpeliai į `sessions` ir `availability`:
- `google_calendar_event_id` - Google Calendar event ID

### 2. **Backend API Endpoints**
- `/api/google-calendar-auth` - Pradeda OAuth flow
- `/api/google-calendar-callback` - OAuth callback handler
- `/api/google-calendar-sync` - Sinchronizuoja įvykius
- `/api/google-calendar-disconnect` - Atjungia Google Calendar
- `/api/_lib/google-calendar.ts` - Helper funkcijos

### 3. **Frontend UI**
- Calendar.tsx pridėti Connect/Disconnect mygtukai
- Auto-sync kai sukuriama/atnaujinama sesija
- Sync status indikatorius
- Įspėjimas apie one-way sync

### 4. **Auto-sync Triggers**
- Kai sukuriama nauja sesija → automatiškai sync
- Kai atšaukiama sesija → ištrinama iš Google Calendar (`api/cancel-session.ts`)
- Kai perkeliama sesija → atnaujinama Google Calendar

---

## 🔧 Ko tau reikia padaryti:

### 1. **Supabase Database Migration**
Atnaujink schemą Supabase SQL Editor:

```bash
# Paleisk šį failą Supabase SQL Editor:
supabase/schema.sql
```

Arba rankiniu būdu supabase Dashboard → SQL Editor → Run SQL:

```sql
-- Google Calendar integration columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_calendar_access_token text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_calendar_refresh_token text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_calendar_token_expiry timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_calendar_connected boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_calendar_sync_enabled boolean DEFAULT true;

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS google_calendar_event_id text;
ALTER TABLE public.availability ADD COLUMN IF NOT EXISTS google_calendar_event_id text;
```

### 2. **Google Cloud Console Setup**

#### A. Sukurk Google Cloud Project:
1. Eik į: https://console.cloud.google.com/
2. Sukurk naują projektą arba pasirink esamą
3. Įjunk **Google Calendar API**:
   - APIs & Services → Library
   - Ieškoti "Google Calendar API"
   - Spausk "Enable"

#### B. Sukurk OAuth 2.0 Credentials:
1. APIs & Services → Credentials
2. Spausk "+ CREATE CREDENTIALS" → OAuth client ID
3. Application type: **Web application**
4. Name: `Tutlio Calendar Integration`
5. **Authorized redirect URIs**:
   ```
   https://tutlio.lt/api/google-calendar-callback
   https://tutlio-stage.vercel.app/api/google-calendar-callback
   http://localhost:3000/api/google-calendar-callback
   ```
   (Pridėk visas aplinkos)

6. Spausk "CREATE"
7. Nukopijuok **Client ID** ir **Client Secret**

#### C. OAuth Consent Screen:
1. APIs & Services → OAuth consent screen
2. User Type: **External** (jei nėra Google Workspace)
3. Užpildyk informaciją:
   - App name: `Tutlio`
   - User support email: tavo email
   - Developer contact: tavo email
4. Scopes: Pridėk:
   - `https://www.googleapis.com/auth/calendar.events`
5. Test users: Pridėk savo email (development mode)
6. Publish app (kai bus production ready)

### 3. **Environment Variables**

Pridėk šias env variables į **Vercel** ir **local .env**:

```env
# Google Calendar OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=https://tutlio.lt/api/google-calendar-callback

# App URL (jau turėtų būti)
APP_URL=https://tutlio.lt
VITE_APP_URL=https://tutlio.lt
```

### 4. **Vercel Deployment**
Po env variables pridėjimo:
```bash
# Redeploy vercel
vercel --prod
```

---

## 🎯 Kaip veikia:

### **Korepetitoriaus perspektyva:**

1. **Prijungimas:**
   - Eina į Calendar puslapį
   - Spaudžia "Prijungti Google Calendar"
   - Autentifikuojasi per Google OAuth
   - Sugrąžinamas atgal į Calendar su success message

2. **Automatinė sinchronizacija:**
   - Kai sukuria laisvą laiką (availability) → atsiranda Google Calendar kaip "🟢 Laisvas laikas"
   - Kai student užbukina pamoką → Google Calendar atnaujinamas:
     - Laisvas laikas sutrumpėja
     - Atsiranda pamokos įvykis "📚 [Dalykas] - [Studentas]"
   - Kai pamoka atšaukiama → Google Calendar įvykis ištrinamas, laisvas laikas grįžta

3. **Pamokos detalės Google Calendar:**
   ```
   Pavadinimas: 📚 Matematika - Jonas Jonaitis

   Aprašymas:
   Pamoka su Jonas Jonaitis

   📧 Email: jonas@example.com
   📚 Klasė: 10
   📖 Tema: Algebrinės lygtys
   💶 Kaina: €25

   🔗 Susitikimo nuoroda: https://meet.google.com/xxx
   ```

4. **Laisvo laiko įvykiai:**
   ```
   Pavadinimas: 🟢 Laisvas laikas

   Aprašymas:
   Galite rezervuoti pamoką šiuo metu per Tutlio platformą.
   ```

5. **Pertraukos logika:**
   - Jei korepetitorius turi nustatyta `break_between_lessons = 15 min`
   - Ir pamoka 10:00-10:45, kita pamoka 11:00-12:00
   - Google Calendar rodys:
     - 10:00-10:45: Pamoka su Student A
     - 10:45-11:00: (pertrauka įskaičiuota į laisvą laiką)
     - 11:00-12:00: Pamoka su Student B

### **Svarbūs punktai:**

⚠️ **One-way sync (Tutlio → Google Calendar)**
- Google Calendar pakeitimai NEATSISPINDĖS Tutlio
- Tik Tutlio pakeitimai atsinaujins Google Calendar
- Vartotojai įspėjami UI

✅ **Automatinis sync:**
- Nauja sesija → automatiškai pridedama į Google Calendar
- Sesija atnaujinama → Google Calendar atnaujinamas
- Sesija atšaukiama → Google Calendar ištrina įvykį

🔄 **Manual sync:**
- Mygtukas "✓ Google Calendar" → perkrauna visą kalendorių

🔌 **Disconnect:**
- Mygtukas su X ikona
- Ištrina visus Google Calendar įvykius
- Pašalina tokens iš DB

---

## 🧪 Testavimas:

### Local Development:
1. Pridėk env variables į `.env`:
   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar-callback
   APP_URL=http://localhost:3000
   VITE_APP_URL=http://localhost:3000
   ```

2. Paleisk dev server:
   ```bash
   npm run dev
   ```

3. Eik į `/calendar`

4. Spausk "Prijungti Google Calendar"

5. Sukurk availability slot

6. Patikrinik savo Google Calendar - turėtų atsirasti įvykiai

### Production:
1. Deploy į Vercel su env variables
2. Testuok su realiu Google account

---

## 🐛 Troubleshooting:

### "Google OAuth not configured"
- Patikrink ar env variables nustatytos Vercel

### "Invalid redirect URI"
- Patikrink ar Google Cloud Console redirect URIs atitinka tiksliai

### "Token refresh failed"
- User turi reconnect Google Calendar

### "Events not syncing"
- Patikrinik browser console errors
- Patikrinik Vercel function logs

### `POST .../api/google-calendar-sync net::ERR_CONNECTION_REFUSED` / "Failed to fetch"
- **Lokaliai:** API veikia tik per Vite dev serverį. Paleisk **`npm run dev`** (ne `npm run build` + `vite preview`). Tada atidaryk http://localhost:3000 – kalendoriaus sync ir rezervacijos turėtų veikti.
- Jei naudoji `npm start` (vercel dev), taip pat turėtų veikti, nes Vercel dev aptarnauja `/api/*` funkcijas.

---

## 📝 Papildomi patobulinimai ateičiai (optional):

- [ ] Batch sync optimization (sukurti daug įvykių vienu metu)
- [ ] Webhook iš Google Calendar (dvipusė sinchronizacija)
- [ ] Sync queue su background jobs (ne realtime)
- [ ] Error notification system (jei sync fails)
- [ ] Settings page su sync options (kokius įvykius rodyti)
- [ ] Spalvų customizacija (skirtingos spalvos skirtingiems dalykams)

---

## ✅ Baigta!

Viskas paruošta! Dabar tik reikia:
1. ✅ Paleisti schema.sql Supabase
2. ✅ Sukurti Google Cloud credentials
3. ✅ Pridėti env variables į Vercel
4. ✅ Redeploy

Po šių žingsnių visa Google Calendar integracija veiks! 🎉
