# ⚡ Quick Start Guide

## 🚀 Greitas Paleidimas

### 1. Paleiskite Migraciją (5 min)

```bash
# Supabase lokaliai:
cd C:\Users\37062\Desktop\Tutlio-local
supabase db push
```

**ARBA per Supabase Dashboard:**
1. Eikite į https://supabase.com/dashboard
2. Pasirinkite savo projektą
3. SQL Editor → New Query
4. Copy-paste turinį iš:
   - `supabase/migrations/20260320000001_add_group_lessons.sql`
   - RUN
   - `supabase/migrations/20260320000002_add_meeting_link_to_availability.sql`
   - RUN

---

### 2. Perkraukite Puslapį

```
Ctrl + Shift + R  (hard reload)
```

---

### 3. Greitas Testavimas (10 min)

#### A. Navigacija
- ✅ Viršutinėje navigacijoje turėtų būti "Instrukcijos" (ne "Nustatymai")
- ✅ Spauskite avatar → "Nustatymai" dropdown'e

#### B. Meeting Link
- ✅ Calendar → spausti "Laisvas laikas" → matyti meeting link lauką
- ✅ Įvesti nuorodą → išsaugoti → dar kartą atidaryti → matosi

#### C. Grupinės Pamokos
- ✅ Settings → Lesson Settings → sukurti dalyką → pažymėti "Grupinė pamoka"
- ✅ Įvesti max studentų: 5
- ✅ Saugoti → matyti badge "Grupinė (5)"

#### D. Instrukcijos
- ✅ Spausti "Instrukcijos" → matyti puslapį su video placeholders
- ✅ Spausti ant kortelės → expand/collapse veikia

---

### 4. Jei Kas Nors Neveikia

**Console Errors:**
```
F12 → Console → screenshot → siųsti
```

**Database Issues:**
```sql
-- Patikrinti ar stulpeliai egzistuoja
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'subjects'
AND column_name IN ('is_group', 'max_students');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sessions'
AND column_name = 'available_spots';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'availability'
AND column_name = 'meeting_link';
```

**Rollback:**
```sql
ALTER TABLE subjects DROP COLUMN IF EXISTS is_group;
ALTER TABLE subjects DROP COLUMN IF EXISTS max_students;
ALTER TABLE sessions DROP COLUMN IF EXISTS available_spots;
ALTER TABLE availability DROP COLUMN IF EXISTS meeting_link;
```

---

## 📚 Pilna Testavimo Instrukcija

Žiūrėkite: **FULL_TESTING_INSTRUCTIONS.md**

- Meeting Link: Sections 1.1 - 1.4
- Grupinės Pamokos: Sections 2.1 - 2.9
- Instrukcijos: Sections 3.1 - 3.4

---

## 📝 Kas Padaryta

Žiūrėkite: **CHANGES_SUMMARY.md**

- 16 pakeistų failų
- 6 nauji failai
- 2 DB migrations
- 3 naujos funkcijos

---

## 🎬 Sekantis Žingsnis

### YouTube Videos

1. **Įrašykite video** (screen recording):
   - Tutor overview (~5 min)
   - Company overview (~5 min)
   - Student overview (~3 min)
   - Kiekvienai funkcijai (~1-2 min)

2. **Upload į YouTube**:
   - Unlisted arba public
   - Gaukite video ID (pvz. `dQw4w9WgXcQ`)

3. **Update kode**:
   ```typescript
   // src/pages/Instructions.tsx
   const OVERVIEW_VIDEO = {
     title: 'Tutlio Platforma - Pilna Apžvalga',
     videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // ⬅️ Čia
     description: '...',
   };

   const VIDEO_SECTIONS: VideoSection[] = [
     {
       id: 'dashboard',
       title: 'Pagrindinis Puslapis',
       videoUrl: 'https://www.youtube.com/embed/KITAS_VIDEO_ID', // ⬅️ Čia
       description: '...',
     },
     // ... kiti
   ];
   ```

4. **Commit ir push**:
   ```bash
   git add .
   git commit -m "feat: add YouTube video IDs to instructions"
   git push
   ```

---

## ✅ Production Checklist

- [ ] Migrations paleistos production DB
- [ ] Greitas testavimas OK
- [ ] Console be error'ų
- [ ] Mobile responsive OK
- [ ] YouTube videos uploaded ir IDs updated
- [ ] Informuoti vartotojus:
  - Email apie naujas funkcijas
  - Video instrukcijas
  - Grupinių pamokų galimybę

---

## 📞 Kontaktai

Problemos? **info@tutlio.lt**

---

**Sukurta:** 2026-03-20
**Estimated time:** 15-20 min first test
**Full testing:** 1-2 hours
