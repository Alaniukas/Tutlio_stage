# 📝 Pakeitimų Santrauka

## 🎯 Atlikti Darbai

### 1. Meeting Link Laisvam Laikui ✅

**Database:**
- ✅ `supabase/migrations/20260320000002_add_meeting_link_to_availability.sql`
  - Pridėtas `meeting_link TEXT` stulpelis į `availability` lentelę

**Backend:**
- Jokių backend pakeitimų nereikėjo

**Frontend:**
- ✅ `src/components/Layout.tsx`
  - Pašalinta "Nustatymai" iš viršutinės navigacijos
  - Pridėta "Instrukcijos" tarp "Finansai" ir "Pamokų nustatymai"
  - "Nustatymai" liko profile dropdown
  - Importas: `HelpCircle` ikona

- ✅ `src/components/StudentLayout.tsx`
  - Pridėta "Instrukcijos" į student navigation
  - Importas: `HelpCircle` ikona

- ✅ `src/components/CompanyLayout.tsx`
  - Pridėta "Instrukcijos" į company navigation
  - Importas: `HelpCircle` ikona

- ✅ `src/pages/Calendar.tsx`
  - **State variables:**
    - `slotEditMeetingLink` - naujas state meeting link'ui
    - `editingSlot` interface - pridėtas `meetingLink?` field

  - **Background events:**
    - Pridėtas `ruleMeetingLink` į event object (line 403)

  - **handleSelectEvent:**
    - Nustato `setSlotEditMeetingLink` kai atidaro slot edit modal

  - **Slot Edit Modal:**
    - Pridėtas meeting link input laukas
    - Rodo "Pasirinkta: N" kai yra pažymėtų dalykų
    - Išsaugo meeting link kai update'ina availability

  - **Assign Student Modal:**
    - **PAŠALINTAS** "Dalyko pavadinimas / tema" laukas
    - Meeting link dabar paimamas iš availability (arba dalyko jei availability neturi)
    - Pakeistas onChange handler - naudoja `editingSlot?.meetingLink`
    - Pridėtas helpful description text

  - **fetchData:**
    - Subjects select dabar įtraukia `is_group, max_students`

  - **handleAssignStudent:**
    - Pridėtas `subject_id` į session insert
    - Pridėtas `available_spots` logika grupinėms pamokoms
    - Pridėtas group lesson decrement logic po session creation

---

### 2. Grupinės Pamokos ✅

**Database:**
- ✅ `supabase/migrations/20260320000001_add_group_lessons.sql`
  - `subjects.is_group BOOLEAN DEFAULT FALSE`
  - `subjects.max_students INTEGER`
  - `sessions.available_spots INTEGER`
  - Index: `idx_sessions_available_spots`

**API:**
- ✅ `api/tutor-slots.ts`
  - Select dabar įtraukia `available_spots`

- ✅ `api/cancel-session.ts`
  - Pridėta group lesson logika
  - Kai atšaukiama grupinė pamoka, incrementa available_spots kitose sesijose tuo pačiu laiku
  - Fetch subject, check is_group
  - Fetch other sessions at same time
  - Increment available_spots by 1 on each

**Frontend:**
- ✅ `src/pages/LessonSettings.tsx`
  - **Subject interface:**
    - Pridėtas `is_group?: boolean`
    - Pridėtas `max_students?: number | null`

  - **newSubject state:**
    - Inicializuojamas su `is_group: false, max_students: null`

  - **Create/Edit Subject Form:**
    - Checkbox "Grupinė pamoka" su Users ikona
    - SVARBU įspėjimas geltonoje dėžutėje
    - "Maks. mokinių" input field (rodomas tik kai is_group = true)

  - **Subjects List:**
    - Badge "Grupinė (N)" violetinėje spalvoje

- ✅ `src/pages/Calendar.tsx`
  - **Session Creation (recurring):**
    - Fetch subject data prieš kuriant sessions
    - Pridėtas `subject_id` į session objects
    - Pridėtas `available_spots: subject?.is_group ? subject.max_students : null`

  - **Session Creation (single):**
    - Fetch subject data
    - Pridėtas `subject_id`
    - Pridėtas `available_spots` logic

  - **Assign Student:**
    - Pridėtas group lesson handling
    - Decrement available_spots on other sessions

- ✅ `src/pages/StudentBooking.tsx`
  - **Session interface:**
    - Pridėtas `subject_id?: string | null`
    - Pridėtas `available_spots?: number | null`

  - **doBooking function:**
    - Check for group lesson before booking
    - Check available_spots > 0
    - Show alert jei nėra vietų
    - Pridėtas `subject_id` į session insert
    - Pridėtas `available_spots` calculation
    - Decrement available_spots on other group sessions

  - **calculateSlots function:**
    - Modified overlap check
    - Allow booking if group lesson with available_spots > 0
    - Block if available_spots = 0 or individual lesson

**Tests:**
- ✅ `tests/features/group-lessons.test.ts`
  - Unit tests grupinėms pamokoms
  - Vitest framework
  - Test scenarios:
    1. Create group subject
    2. Create session with available_spots
    3. Second student books same slot
    4. Cancel increments available_spots
    5. Show group slots in booking page
    6. Prevent booking when spots = 0

---

### 3. Instrukcijų Puslapiai ✅

**Pages:**
- ✅ `src/pages/Instructions.tsx`
  - Korepetitoriams
  - Overview video + 9 funkcijų videos
  - Collapsible cards
  - YouTube iframe integration

- ✅ `src/pages/StudentInstructions.tsx`
  - Mokiniams
  - Overview video + 8 funkcijų videos
  - Collapsible cards

- ✅ `src/pages/company/CompanyInstructions.tsx`
  - Organizacijoms
  - Overview video + 8 funkcijų videos
  - Collapsible cards

**Routes:**
- ✅ `src/App.tsx`
  - Imports: `Instructions, StudentInstructions, CompanyInstructions`
  - Routes:
    - `/instructions` (tutor protected)
    - `/student/instructions` (student protected)
    - `/company/instructions` (company protected)

**Features:**
- Expand/collapse functionality su useState
- YouTube iframe su aspect-video
- Help section su nuorodomis
- Responsive design
- Placeholder video URLs (reikia pakeisti į tikrus)

---

## 📁 Pakeisti Failai

### Database Migrations (2)
1. `supabase/migrations/20260320000001_add_group_lessons.sql`
2. `supabase/migrations/20260320000002_add_meeting_link_to_availability.sql`

### API Files (2)
1. `api/tutor-slots.ts`
2. `api/cancel-session.ts`

### Components (3)
1. `src/components/Layout.tsx`
2. `src/components/StudentLayout.tsx`
3. `src/components/CompanyLayout.tsx`

### Pages (7)
1. `src/pages/Calendar.tsx`
2. `src/pages/LessonSettings.tsx`
3. `src/pages/StudentBooking.tsx`
4. `src/pages/Instructions.tsx` (NEW)
5. `src/pages/StudentInstructions.tsx` (NEW)
6. `src/pages/company/CompanyInstructions.tsx` (NEW)
7. `src/App.tsx`

### Tests (1)
1. `tests/features/group-lessons.test.ts` (NEW)

### Documentation (3)
1. `TESTING_INSTRUCTIONS.md` (NEW)
2. `FULL_TESTING_INSTRUCTIONS.md` (NEW)
3. `CHANGES_SUMMARY.md` (NEW - šis failas)

---

## 🔢 Statistika

**Iš viso pakeistų failų:** 16
**Naujų failų:** 6
**Database migrations:** 2
**Naujų funkcijų:** 3 (Meeting Link, Group Lessons, Instructions)
**Code Lines Changed:** ~2000+ lines

---

## 🚀 Deployment Checklist

- [ ] Run migrations:
  ```bash
  # Supabase lokaliai
  supabase db push

  # ARBA per Dashboard → SQL Editor
  ```

- [ ] Test visas funkcijas pagal FULL_TESTING_INSTRUCTIONS.md

- [ ] Pakeisti YouTube placeholder URLs į tikrus video IDs:
  ```typescript
  // Instructions.tsx, StudentInstructions.tsx, CompanyInstructions.tsx
  videoUrl: 'https://www.youtube.com/embed/TIKRAS_VIDEO_ID'
  ```

- [ ] Deploy to production

- [ ] Informuoti vartotojus apie naujas funkcijas

---

## 📊 Feature Matrix

| Funkcija | Tutor | Student | Company | Status |
|----------|-------|---------|---------|--------|
| Meeting Link (Availability) | ✅ | - | ✅ | Done |
| Meeting Link (Assign) | ✅ | - | ✅ | Done |
| Group Lessons (Create) | ✅ | - | ✅ | Done |
| Group Lessons (Book) | - | ✅ | - | Done |
| Group Lessons (Cancel) | ✅ | ✅ | ✅ | Done |
| Instructions Page | ✅ | ✅ | ✅ | Done |
| Navigation Update | ✅ | ✅ | ✅ | Done |

---

## 🐛 Fixed Bugs

1. ✅ Waitlist email not sending (ankstesnis fix)
2. ✅ Waitlist showing past sessions (ankstesnis fix)
3. ✅ Missing subject_id in sessions
4. ✅ Meeting link not editable for availability
5. ✅ "Dalyko pavadinimas" field confusing users

---

## ⚠️ Breaking Changes

**Jokių breaking changes!** Visi pakeitimai backward compatible:
- Nauji stulpeliai su default values
- Optional fields frontend'e
- Existing functionality nepaveikta

---

## 🔮 Ateities Patobulinimai

1. **Available_spots Sinchronizacija:**
   - Galima pridėti DB trigger vietoj frontend logic
   - Transaction support

2. **Group Lesson UI:**
   - Rodyti "3 / 5 vietos likusios" student booking page
   - Real-time updates (websockets?)

3. **Instructions Videos:**
   - Screen recording
   - Upload to YouTube
   - Update video IDs

4. **Analytics:**
   - Track group lesson usage
   - Popular subjects
   - Booking patterns

---

**Dokumentas sukurtas:** 2026-03-20
**Versija:** 1.0.0
**Autorius:** Claude Sonnet 4.5
