# 🎓 Grupinių Pamokų Įdiegimo Instrukcijos

## ⚡ KĄ REIKIA PADARYTI

### 1️⃣ **Paleisti DB Migraciją**

Atidarykite terminalą projektodirektorijoje ir vykdykite:

```bash
# Prisijunkite prie Supabase (jei dar ne)
npx supabase login

# Link'inkite projektą (jei dar ne)
npx supabase link --project-ref YOUR_PROJECT_REF

# Pritaikykite migracijas
npx supabase db push
```

**Arba rankiniu būdu Supabase Dashboard:**

1. Eikite į Supabase Dashboard → SQL Editor
2. Atidarykite failą: `supabase/migrations/20260323000001_add_hidden_from_calendar.sql`
3. Nukopijuokite visą SQL kodą
4. Įklijuokite į SQL Editor ir spaustkite "Run"

**Ką tai padaro:**
- Prideda `hidden_from_calendar` stulpelį į `sessions` lentelę
- Sukuria indeksus greitesniam query

---

### 2️⃣ **Deploy į Production** (jei naudojate Vercel)

```bash
# Commit pakeitimai
git add .
git commit -m "feat: add group lessons and auto-hide cancelled sessions"

# Push į GitHub
git push origin main
```

Vercel automatiškai deploy'ins naują versiją.

---

### 3️⃣ **Testuoti Lokaliai** (rekomenduojama prieš deploy)

```bash
# Paleiskite dev serverį
npm run dev
```

Atverkite `http://localhost:5173` ir vykdykite testus iš `TESTING_GROUP_LESSONS.md`

---

## 📋 KAS BUVO PAKEISTA

### ✅ Bazė Duomenų (Supabase)
- Pridėtas `sessions.hidden_from_calendar` boolean laukas
- Pridėtas `sessions.cancelled_at` timestamp (jei nebuvo)
- Sukurti indeksai performance'ui

### ✅ Frontend (Calendar.tsx)
1. **Auto-hide logika**: Atšauktos pamokos automatiškai slepiamos po 12h (client-side)
2. **Group merging**: Grupinės pamokos rodomo kaip vienas event'as kalendoriuje
3. **Group modal**: Naujas UI grupinėms pamokoms su visų mokinių sąrašu
4. **Multi-student selection**: Checkboxai grupinėms pamokoms kuriant
5. **Recurring group lessons**: Veikia pasikartojančios grupinės pamokos
6. **"Ištrinti" mygtukas**: Rankinė pamokų šalinimas iš kalendoriaus

### ✅ Nauji State Kintamieji
- `selectedStudentIds: string[]` - kelių mokinių pasirinkimas
- `selectedGroupSessions: Session[]` - grupinių pamokų sesijos
- `isGroupSession: boolean` - ar tai grupinė pamoka

### ✅ Atnaujinti Funkcijos
- `fetchData()` - filtruoja hidden sesijas ir auto-hide old cancelled
- `handleCreateSession()` - kuria multiple sessions grupinėms pamokoms
- `mergeGroupSessions()` - merge'ina sesijas kalendoriaus rodymui
- `handleSelectEvent()` - aptinka grupines pamokas

---

## 🔍 KAIP VEIKIA GRUPINĖS PAMOKOS

### Kuriant Grupinę Pamoką:
1. Pasirenkate dalyką su `is_group = true`
2. Sistema rodo checkboxus vietoj dropdown
3. Galite pasirinkti iki `max_students` mokinių
4. Spaudžiate "Sukurti pamoką"
5. **Sistema sukuria PO ATSKIRĄ SESIJĄ** kiekvienam mokiniui DB
6. **Kalendoriuje rodo VIENĄ** merged event'ą

### Žiūrint Grupinę Pamoką:
1. Spaudžiate ant merged event'o
2. Modal rodo:
   - "Grupinė pamoka" header
   - Visų mokinių sąrašą
   - Kiekvieno mokėjimo statusą
   - Bendrus veiksmus (atšaukti/įvykusi/etc)

### Auto-Hide Mechanizmas:
- Kai kraunasi kalendorius → tikrina ar yra `status='cancelled'` AND `cancelled_at < NOW() - 12 hours`
- Jei taip → automatiškai update'ina `hidden_from_calendar = true`
- Fetch'ina tik `WHERE hidden_from_calendar = false`
- Finance puslapyje ignoruoja šį filtrą (rodo visas)

---

## ⚠️ ŽINOMI APRIBOJIMAI (TODO ATEITYJE)

### 🔨 Neveikia / Neįgyvendinta:
1. **"Pridėti mokinį" mygtukas** - kol kas tik alert placeholder
   - Reikia: modal'o su student selection
   - Reikia: pasirinkimo "tik ši / visos būsimos" (recurring)

2. **Group Edit** - redaguoti visą grupę iš karto
   - Dabar: redaguoja tik pirmą sesiją
   - Reikia: update all sessions in group

3. **Group Cancel su Choice** - atšaukti su pasirinkimu
   - Dabar: atšaukia tik pirmą
   - Reikia: dialog "Atšaukti tik šią / visas būsimas"

4. **Recurring Template Optimization**
   - Dabar: kuria po template kiekvienam mokiniui
   - Galima: vienas shared template su student list

### ✅ Veikia Pilnai:
- ✅ Grupinių pamokų kūrimas (individual)
- ✅ Grupinių pamokų kūrimas (recurring)
- ✅ Merge'inimas kalendoriuje
- ✅ Auto-hide po 12h
- ✅ Rankinė "Ištrinti"
- ✅ Email'ai visiems mokiniams
- ✅ Mokėjimo tracking per student
- ✅ Checkbox UI su limit'ais

---

## 🧪 GREITAS TESTAS

```bash
# 1. Patikrinkite ar migracija pritaikyta
psql YOUR_DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'hidden_from_calendar';"

# Turėtų grąžinti: hidden_from_calendar
```

**Arba per Supabase Dashboard:**
1. Table Editor → sessions table
2. Scroll dešinėn
3. Turėtų matyti `hidden_from_calendar` stulpelį

---

## 📞 Jei Kažkas Neveikia

### Problema: "Migracija nesusideda"
**Sprendimas:**
```sql
-- Rankiniu būdu pridėkite stulpelį:
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hidden_from_calendar BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_sessions_hidden_from_calendar ON sessions(hidden_from_calendar) WHERE hidden_from_calendar = false;
```

### Problema: "Kalendorius nerodo merged event'ų"
**Patikrinkite:**
- Ar dalykas turi `is_group = true`?
- Ar sesijos turi tą patį `start_time`, `end_time`, ir `subject_id`?
- Console log: `mergedSessions` - turėtų rodyti merged objektus

### Problema: "Checkboxai neatsiranda"
**Patikrinkite:**
- Ar pasirinkote grupinį dalyką?
- Ar `subjects` array turi `is_group` ir `max_students` laukus?
- Console log: `selectedSubjectId` ir `subjects.find(s => s.id === selectedSubjectId)`

### Problema: "TypeScript error'ai"
**Sprendimas:**
```bash
# Išvalykite ir rebuild
rm -rf node_modules
npm install
npm run build
```

---

## ✅ KĄ DARYTI TOLIAU

### Greitai (Kritiniai bug'ai):
- [ ] Implementuoti "Pridėti mokinį" funkcionalumą
- [ ] Group edit/cancel su choice dialogs

### Vėliau (Nice-to-have):
- [ ] Group statistics dashboard
- [ ] Group lesson payment bulk actions
- [ ] Optimize recurring template creation
- [ ] Add group lesson filters in calendar

---

**Visa kodo bazė atnaujinta ir ready deploy! 🚀**

Jei turite klausimų - rašykite.
