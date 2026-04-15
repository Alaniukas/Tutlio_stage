# Testing Instructions - Grupinės Pamokos ir Meeting Link Pataisymai

## Pradžia

1. **Paleiskite migraciją**:
   ```bash
   # Supabase lokaliai (jei naudojate):
   supabase db push

   # Arba tiesiai į produkciją per Supabase dashboard:
   # Įkelkite failus:
   # - supabase/migrations/20260320000001_add_group_lessons.sql
   # - supabase/migrations/20260320000002_add_meeting_link_to_availability.sql
   ```

2. **Perkraukite puslapį** kad užsikrautų nauji kodai

---

## 1. Meeting Link Laisvam Laikui

### Testuoti:

1. **Redaguoti laisvą laiką**:
   - Eikite į Calendar
   - Spauskite ant bet kokio "Laisvas laikas" (žalias background event)
   - Turėtų atsidaryti "Redaguoti laisvą laiką" modalas

2. **Patikrinti meeting link lauką**:
   - ✅ Turėtų būti laukas "Prisijungimo nuoroda (nebūtina)"
   - ✅ Galite įvesti nuorodą (pvz. `https://zoom.us/j/123456789`)
   - ✅ Spauskite "Išsaugoti"

3. **Patikrinti dalykų pažymėjimą**:
   - ✅ Viršuje turėtų rašyti "Pasirinkta: N" jei yra pažymėtų dalykų
   - ✅ Pažymėkite kelis dalykus (checkboxus)
   - ✅ Išsaugokite ir dar kartą atidarykite - turėtų būti tie patys pažymėti

4. **Priskirti mokinį prie laisvo laiko**:
   - Spauskite "Pridėti mokinį"
   - Pasirinkite mokinį ir dalyką
   - ✅ **"Dalyko pavadinimas/tema" lauko NETURI būti** (buvo pašalintas)
   - ✅ "Prisijungimo nuoroda" turėtų būti automatiškai užpildyta iš laisvo laiko (jei nustatėte)
   - ✅ Galite redaguoti nuorodą
   - ✅ Sukurkite pamoką - nuoroda turėtų būti išsaugota

---

## 2. Grupinės Pamokos

### 2.1. Sukurti Grupinį Dalyką

1. **Eikite į Settings → Lesson Settings**
2. **Sukurkite naują dalyką**:
   - Pavadinimas: "Grupinė Matematika"
   - Trukmė: 60 min
   - Kaina: 30 EUR
   - ✅ **Pažymėkite "Grupinė pamoka"** (checkbox su Users ikona)
   - ✅ Turėtų atsirasti SVARBU įspėjimas geltonoje dėžutėje
   - ✅ Turėtų atsirasti "Maks. mokinių" laukas
   - Įveskite: 5
   - Išsaugokite

3. **Patikrinti dalykų sąraše**:
   - ✅ Prie dalyko pavadinimo turėtų būti badge "Grupinė (5)"

### 2.2. Sukurti Grupinę Pamoką

1. **Eikite į Calendar**
2. **Sukurkite naują pamoką**:
   - Pasirinkite mokinį
   - Pasirinkite "Grupinė Matematika" (grupinį dalyką)
   - Pasirinkite laiką
   - Sukurkite pamoką

3. **Patikrinti duombazėje** (per Supabase dashboard arba SQL):
   ```sql
   SELECT id, subject_id, available_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   - ✅ `available_spots` turėtų būti 4 (max_students - 1)

### 2.3. Antrasis Mokinys Registruojasi

**Svarbu**: Šiam testui reikia turėti invite link arba test student paskyrą.

1. **Student Booking Page**:
   - Atidarykite student booking puslapį su invite kodu
   - Arba prisijunkite kaip mokinys (jei turite test paskyrą)

2. **Pasirinkite grupinį dalyką**:
   - Pasirinkite "Grupinė Matematika"
   - Pasirinkite datą

3. **Patikrinti laisvus laikus**:
   - ✅ Turėtų matyti laiką, kuriame jau yra 1 mokinys
   - ✅ Galite užsiregistruoti tą patį laiką

4. **Užsiregistruokite**:
   - Spauskite ant laiko
   - Užpildykite payer info (jei reikia)
   - Patvirtinkite

5. **Patikrinti duombazėje**:
   ```sql
   SELECT student_id, start_time, available_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   ORDER BY created_at;
   ```
   - ✅ Turėtų būti 2 įrašai su skirtingais student_id
   - ✅ Abiejų `available_spots` turėtų būti 3

### 2.4. Atšaukimas

1. **Mokinys atšaukia grupinę pamoką**:
   - Prisijunkite kaip mokinys
   - Eikite į Sessions
   - Atšaukite grupinę pamoką

2. **Patikrinti duombazėje**:
   ```sql
   SELECT student_id, status, available_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   ORDER BY student_id;
   ```
   - ✅ Viena sesija turėtų turėti `status = 'cancelled'`
   - ✅ Kitos sesijos `available_spots` turėtų būti 4 (padidėjo)

### 2.5. Pilna Grupė

1. **Užpildykite grupę iki max_students**:
   - Sukurkite 5 mokinius vienam laikui (arba pabandykite užsiregistruoti kaip 5 mokiniai)

2. **6-tas mokinys bando užsiregistruoti**:
   - ✅ Turėtų matyti alert: "Šioje grupinėje pamokoje nebėra laisvų vietų."
   - ✅ Laikas neturėtų būti rodomas kaip laisvas

---

## 3. Laisvo Laiko + Grupinės Pamokos Kombinacija

1. **Sukurkite laisvą laiką**:
   - Availability Manager → Add availability
   - Nustatykite laiką (pvz. 10:00-12:00 Pirmadienis)
   - Pažymėkite tik grupinį dalyką
   - Įveskite meeting link (pvz. zoom.us/...)
   - Išsaugokite

2. **Priskirti mokinį per laisvą laiką**:
   - Calendar → Spauskite ant to laisvo laiko
   - "Pridėti mokinį"
   - Pasirinkite mokinį ir grupinį dalyką
   - ✅ Meeting link turėtų būti iš laisvo laiko
   - ✅ Nėra "Dalyko pavadinimas" lauko
   - ✅ Trukmė automatiškai iš dalyko
   - Sukurkite

3. **Patikrinti sukurtą pamoką**:
   ```sql
   SELECT subject_id, meeting_link, available_spots, topic
   FROM sessions
   WHERE id = 'naujausios-sesijos-id';
   ```
   - ✅ `subject_id` = grupinio dalyko ID
   - ✅ `meeting_link` = iš laisvo laiko
   - ✅ `available_spots` = max_students - 1
   - ✅ `topic` = dalyko pavadinimas (ne custom)

---

## 4. Edge Cases

### 4.1. Individual Pricing su Group Lesson
1. Sukurkite individual pricing mokiniui su grupiniu dalyku
2. ✅ Turėtų veikti normaliai - kaina individuali, bet pamoka vis tiek grupinė

### 4.2. Recurring Group Sessions
1. Sukurkite pasikartojančią grupinę pamoką (recurring)
2. ✅ Kiekviena savaitė turėtų turėti atskirą available_spots counter
3. ✅ Vienos savaitės atšaukimas neturėtų paveikti kitų savaičių

### 4.3. Package Lessons su Group
1. Mokinys turi pamokų paketą grupiniam dalykui
2. ✅ Galėtų rezervuoti grupinę pamoką su paketu
3. ✅ Available_spots vis tiek mažėja

---

## 5. Rollback Planas

Jei kas nors neveikia, galite grįžti atgal:

1. **Database rollback**:
   ```sql
   -- Remove group lesson columns
   ALTER TABLE subjects DROP COLUMN IF EXISTS is_group;
   ALTER TABLE subjects DROP COLUMN IF EXISTS max_students;
   ALTER TABLE sessions DROP COLUMN IF EXISTS available_spots;
   ALTER TABLE availability DROP COLUMN IF EXISTS meeting_link;
   ```

2. **Code rollback**:
   ```bash
   git revert HEAD  # arba konkretus commit
   ```

---

## 6. Žinomi Apribojimai

1. **Grupinės pamokos yra "all or nothing"**:
   - Jei dalykas yra grupinis, VISOS jo pamokos yra grupinės
   - Negalima vienos pamokos padaryti individualios, kitos grupinės

2. **Available_spots sinchronizacija**:
   - Vyksta frontend'e per keletą DB užklausų
   - Teoriškai galima race condition (du mokiniai vienu metu rezervuoja paskutinę vietą)
   - Praktikoje tikimybė maža, bet galima patobulinti su DB trigger'iais

3. **Google Calendar sync**:
   - Grupinės pamokos sinchronizuojamos kaip atskiri events kiekvienam mokiniui
   - Korepetitorius matys kelis events tuo pačiu laiku

---

## 7. Sekantys Žingsniai

Po testavimo:
1. ✅ Patvirtinkite, kad viskas veikia
2. Pranešite apie bug'us ar pagerinimus
3. Toliau dirbame su **Instrukcijų page** (dar nedaryta)

---

## Kontaktai Problemoms

Jei kažkas neveikia:
1. Pažiūrėkite browser console errors
2. Pažiūrėkite Supabase logs
3. Pateikite:
   - Kokį veiksmą darėte
   - Ką tikėjotės matyti
   - Ką iš tiesų matėte
   - Console error (jei yra)
