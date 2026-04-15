# 🧪 Pilna Testavimo Instrukcija - Visi Pakeitimai

## 📋 Turinys
1. [Prieš Pradedant](#prieš-pradedant)
2. [Meeting Link Laisvam Laikui](#1-meeting-link-laisvam-laikui)
3. [Grupinės Pamokos](#2-grupinės-pamokos)
4. [Instrukcijų Puslapiai](#3-instrukcijų-puslapiai)
5. [Visos Klaidos ir Pataisymai](#4-visos-klaidos-ir-pataisymai)
6. [Žinomos Problemos](#5-žinomos-problemos)

---

## Prieš Pradedant

### Paleidimas

1. **Paleiskite migraciją**:
   ```bash
   # Supabase lokaliai:
   supabase db push

   # ARBA per Supabase Dashboard → SQL Editor:
   # Įkelkite ir paleiskite:
   # 1. supabase/migrations/20260320000001_add_group_lessons.sql
   # 2. supabase/migrations/20260320000002_add_meeting_link_to_availability.sql
   ```

2. **Perkraukite puslapį** kad užsikrautų nauji kodai

3. **Patikrinkite ar veikia**:
   - Puslapio konsolėje (F12) neturėtų būti error'ų
   - Navigacija turėtų rodyti "Instrukcijos" mygtuką

---

## 1. Meeting Link Laisvam Laikui

### ✅ 1.1. Navigacijos Pakeitimai

**Kas pasikeitė:**
- ❌ **"Nustatymai" pašalinta** iš viršutinės navigacijos (tutor)
- ✅ **"Instrukcijos" pridėta** tarp "Finansai" ir "Pamokų nustatymai"
- ✅ **"Nustatymai" liko** profile dropdown (paspaudus ant avataro)

**Testuoti:**
1. Prisijunkite kaip **korepetitorius**
2. Viršutinėje navigacijoje turėtumėte matyti (iš kairės į dešinę):
   - Pagrindinis
   - Kalendorius
   - Mokiniai
   - Laukimo eilė
   - Finansai
   - **Instrukcijos** ⬅️ NAUJAS
   - Pamokų nustatymai
3. Spauskite ant savo avataro (dešinėje)
   - ✅ Dropdown'e turėtų būti "Nustatymai"
   - ✅ Spauskite "Nustatymai" - turėtų veikti

**Mokinių navigacija:**
4. Prisijunkite kaip **mokinys**
5. Turėtumėte matyti:
   - Pradžia
   - Pamokos
   - Rezervuoti
   - Eilė
   - **Instrukcijos** ⬅️ NAUJAS
   - Nustatymai (mokiniai neturi dropdown, tai čia lieka)

**Organizacijų navigacija:**
6. Prisijunkite kaip **organizacijos admin**
7. Turėtumėte matyti:
   - Apžvalga
   - Korepetitoriai
   - Mokiniai
   - Pamokos
   - Statistika
   - **Instrukcijos** ⬅️ NAUJAS
   - Pamokų nustatymai
   - Finansai

---

### ✅ 1.2. Meeting Link Laisvame Laike

**Testuoti:**

1. **Eikite į Calendar**
2. **Spauskite ant "Laisvas laikas"** (žalias background event)
   - ✅ Turėtų atsidaryti "Redaguoti laisvą laiką" modalas

3. **Patikrinti dalykų pažymėjimą**:
   - ✅ Viršuje turėtų rašyti **"Pasirinkta: N"** jei yra pažymėtų dalykų
   - ✅ Arba "Jei nepasirinksite jokio..." jei nieko nepažymėta
   - ✅ Pažymėkite kelis dalykus
   - ✅ Turėtų atsinaujinti skaičius

4. **Meeting link laukas**:
   - ✅ Turėtų būti naujas laukas **"Prisijungimo nuoroda (nebūtina)"**
   - ✅ Įveskite nuorodą: `https://zoom.us/j/123456789`
   - ✅ Spauskite "Išsaugoti"

5. **Patikrinti ar išsaugojo**:
   - Uždarykite modalą
   - Dar kartą spauskite ant to paties laisvo laiko
   - ✅ Meeting link turėtų būti ten kur įvedėte

6. **Patikrinti DB** (per Supabase dashboard):
   ```sql
   SELECT id, start_time, end_time, meeting_link, subject_ids
   FROM availability
   WHERE tutor_id = 'your-tutor-id'
   ORDER BY created_at DESC
   LIMIT 5;
   ```
   - ✅ `meeting_link` stulpelis turėtų turėti jūsų įvestą nuorodą

---

### ✅ 1.3. Priskirti Mokinį su Meeting Link

**Testuoti:**

1. **Spaudžiate ant "Laisvas laikas"** (kuris turi meeting link)
2. **Spauskite "Pridėti mokinį"**

3. **Patikrinti laukus**:
   - ✅ Pasirenkate mokinį
   - ✅ Pasirenkate dalyką
   - ✅ Trukmė (minutėmis) - laukas yra
   - ❌ **"Dalyko pavadinimas / tema" lauko NETURI būti** (pašalintas!)
   - ✅ **"Prisijungimo nuoroda"** - turėtų būti automatiškai užpildyta iš laisvo laiko
   - ✅ Po nuorodos turėtų būti tekstas: "Nuoroda paimta iš laisvo laiko nustatymų. Galite ją pakeisti."

4. **Redaguoti nuorodą**:
   - ✅ Pakeiskite nuorodą į kitą (pvz. `https://meet.google.com/abc-def-ghi`)
   - ✅ Pasirinkite laiką
   - ✅ Spauskite "Sukurti pamoką"

5. **Patikrinti sukurtą pamoką**:
   - Eikite į Calendar
   - Turėtumėte matyti naują pamoką
   - Spauskite ant pamokos
   - ✅ Meeting link turėtų būti tas kurį redagavote
   - ✅ Topic turėtų būti dalyko pavadinimas (NE custom)

6. **Patikrinti DB**:
   ```sql
   SELECT id, topic, meeting_link, subject_id
   FROM sessions
   WHERE id = 'naujos-sesijos-id';
   ```
   - ✅ `meeting_link` = jūsų redaguota nuoroda
   - ✅ `topic` = dalyko pavadinimas
   - ✅ `subject_id` = pasirinkto dalyko ID

---

### ✅ 1.4. Edge Cases - Meeting Link

**Scenario 1: Laisvas laikas neturi meeting link**

1. Sukurkite laisvą laiką be meeting link
2. Priskiriate mokinį per tą laiką
3. Pasirinkote dalyką kuris turi meeting link
4. ✅ Meeting link turėtų būti iš dalyko
5. ✅ Tekstas po nuoroda: "Nuoroda paimta iš dalyko nustatymų. Galite ją pakeisti."

**Scenario 2: Nei laisvas laikas, nei dalykas neturi meeting link**

1. Laisvas laikas be meeting link
2. Dalykas be meeting link
3. ✅ Laukas turėtų būti tuščias
4. ✅ Galite įvesti rankiniu būdu

**Scenario 3: Laisvas laikas turi, dalykas neturi**

1. Laisvas laikas su meeting link
2. Dalykas be meeting link
3. ✅ Meeting link turėtų būti iš laisvo laiko

---

## 2. Grupinės Pamokos

### ✅ 2.1. Sukurti Grupinį Dalyką

**Testuoti:**

1. **Eikite į Settings → Lesson Settings**
2. **Spauskite "Pridėti naują dalyką"**

3. **Užpildykite formą**:
   - Pavadinimas: `Grupinė Matematika`
   - Trukmė: `60` min
   - Kaina: `30` EUR
   - Spalva: Pasirinkite bet kurią
   - Meeting link: (nebūtina)
   - Klasės: (nebūtina)

4. **Pažymėkite "Grupinė pamoka"**:
   - ✅ Turėtų būti checkbox su Users ikona
   - ✅ Pažymėjus turėtų atsirasti:
     - **SVARBU įspėjimas** geltonoje dėžutėje su AlertTriangle ikona
     - Tekstas: "SVARBU! Visos šio dalyko pamokos bus grupinės."
     - Laukas **"Maks. mokinių"**

5. **Įveskite max studentų**:
   - Įveskite: `5`
   - ✅ Skaičius turėtų būti ≥ 2

6. **Išsaugokite**

7. **Patikrinti dalykų sąraše**:
   - ✅ Prie dalyko pavadinimo turėtų būti **badge "Grupinė (5)"**
   - ✅ Badge violetinės spalvos su Users ikona

8. **Patikrinti DB**:
   ```sql
   SELECT id, name, is_group, max_students
   FROM subjects
   WHERE tutor_id = 'your-tutor-id'
   AND is_group = true
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   - ✅ `is_group` = `true`
   - ✅ `max_students` = `5`

---

### ✅ 2.2. Redaguoti Grupinį Dalyką

**Testuoti:**

1. Spauskite ant sukurto grupinio dalyko (redagavimas)
2. ✅ "Grupinė pamoka" checkbox turėtų būti pažymėtas
3. ✅ "Maks. mokinių" laukas turėtų rodyti `5`
4. ✅ SVARBU įspėjimas turėtų būti rodomas
5. Pakeiskite max studentų į `3`
6. Išsaugokite
7. ✅ Badge turėtų pasikeisti į "Grupinė (3)"

---

### ✅ 2.3. Sukurti Grupinę Pamoką (Tutor)

**Scenario A: Kalendoriuje**

1. **Eikite į Calendar**
2. **Spauskite ant laisvo laiko arba tuščio slot**
3. **"Sukurti pamoką" modalas**:
   - Pasirinkite mokinį
   - Pasirinkite **grupinį dalyką** (Grupinė Matematika)
   - Pasirinkite laiką
   - Kaina automatiškai užpildoma
   - ✅ Spauskite "Sukurti"

4. **Patikrinti sukurtą pamoką DB**:
   ```sql
   SELECT id, subject_id, student_id, available_spots, start_time
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   - ✅ `subject_id` = grupinio dalyko ID
   - ✅ `available_spots` = `4` (max_students - 1, nes vienas mokinys jau priskirtas)

**Scenario B: Per "Laisvas laikas" → "Pridėti mokinį"**

1. Spauskite ant laisvo laiko
2. "Pridėti mokinį"
3. Pasirinkite mokinį ir grupinį dalyką
4. ✅ Sukuriama pamoka
5. ✅ Patikrinti DB - available_spots turėtų būti 4

**Scenario C: Recurring grupinės pamokos**

1. Sukurkite recurring pamoką su grupiniu dalyku
2. Pasirinkite "Kartoti kas savaitę iki..."
3. ✅ Visos sukurtos pamokos turėtų turėti available_spots = 4

---

### ✅ 2.4. Mokinys Registruojasi į Grupinę Pamoką

**Setup:**
- Reikia turėti student booking page (invite link) arba test student paskyros

**Testuoti:**

1. **Student Booking Page** (kaip mokinys):
   - Atidarykite `/book/INVITE_CODE`
   - Arba prisijunkite kaip mokinys ir eikite į "Rezervuoti"

2. **Pasirinkite grupinį dalyką**:
   - ✅ Dropdown'e turėtumėte matyti "Grupinė Matematika"
   - ✅ Pasirinkite datą

3. **Patikrinti laisvus laikus**:
   - ✅ Turėtumėte matyti laiką, kuriame jau yra 1 mokinys (sukurtas korepetitoriaus)
   - ✅ Laikas turėtų būti **laisvas** (ne užimtas), nes available_spots > 0

4. **Užsiregistruokite**:
   - Spauskite ant laiko
   - Užpildykite payer info (jei reikia)
   - ✅ Turėtų leisti užsiregistruoti

5. **Patikrinti sukurtą pamoką DB**:
   ```sql
   SELECT id, student_id, subject_id, available_spots, start_time
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   ORDER BY created_at;
   ```
   - ✅ Turėtų būti **2 įrašai** (vienas korepetitoriaus, vienas mokinio)
   - ✅ Skirtingi `student_id`
   - ✅ **Abiejų** `available_spots` turėtų būti **3** (buvo 4, sumažėjo į 3)

6. **Konsolės patikrinimas**:
   - Atidarykite browser console (F12)
   - ✅ Neturėtų būti error'ų apie available_spots

---

### ✅ 2.5. Trečias Mokinys Registruojasi

**Testuoti:**

1. Prisijunkite kaip **kitas mokinys** (arba panaudokite kitą invite code)
2. Pasirinkite tą patį grupinį dalyką ir datą
3. ✅ Tas pats laikas turėtų būti laisvas
4. Užsiregistruokite
5. **Patikrinti DB**:
   ```sql
   SELECT student_id, available_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   ORDER BY student_id;
   ```
   - ✅ Turėtų būti **3 įrašai**
   - ✅ **Visų** `available_spots` = **2**

---

### ✅ 2.6. Pilna Grupė (Visi 5 Mokiniai)

**Testuoti:**

1. Tęskite registruoti mokinius kol pasieksite max_students (5)
2. **4-tas mokinys**:
   - ✅ Turėtų leisti registruotis
   - ✅ available_spots = 1
3. **5-tas mokinys**:
   - ✅ Turėtų leisti registruotis
   - ✅ available_spots = 0

4. **6-tas mokinys bando registruotis**:
   - Pasirenkate datą ir dalyką
   - ✅ Laikas **neturėtų būti rodomas** kaip laisvas (užimtas)
   - Jei kažkaip paspaudėte:
     - ✅ Turėtų rodyti alert: **"Šioje grupinėje pamokoje nebėra laisvų vietų."**
     - ✅ Pamoka **nesukuriama**

5. **Patikrinti DB**:
   ```sql
   SELECT COUNT(*) as total_students, MIN(available_spots) as min_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   AND status != 'cancelled';
   ```
   - ✅ `total_students` = `5`
   - ✅ `min_spots` = `0`

---

### ✅ 2.7. Atšaukimas Grupinėje Pamokoje

**Testuoti:**

1. **Mokinys atšaukia grupinę pamoką**:
   - Prisijunkite kaip vienas iš mokinių grupinėje pamokoje
   - Eikite į "Pamokos"
   - Spauskite ant grupinės pamokos
   - Spauskite "Atšaukti pamoką"
   - Įveskite priežastį (min 5 simboliai)
   - ✅ Turėtų leisti atšaukti

2. **Patikrinti DB**:
   ```sql
   SELECT student_id, status, available_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   ORDER BY status, student_id;
   ```
   - ✅ Viena sesija turėtų turėti `status = 'cancelled'`
   - ✅ **Kitų sesijų** (status = 'active') `available_spots` turėtų būti **1** (buvo 0, padidėjo į 1)

3. **Naujas mokinys gali užsiregistruoti**:
   - Prisijunkite kaip naujas mokinys
   - Pasirinkite tą patį laiką
   - ✅ Laikas turėtų būti **laisvas** (nes available_spots = 1)
   - ✅ Turėtų leisti užsiregistruoti
   - ✅ Po registracijos available_spots vėl = 0

---

### ✅ 2.8. Korepetitorius Atšaukia Grupinę Pamoką

**Testuoti:**

1. Prisijunkite kaip **korepetitorius**
2. Eikite į Calendar
3. Spauskite ant grupinės pamokos (kurioje yra keletas mokinių)
4. Spauskite "Atšaukti pamoką"
5. ✅ Turėtų leisti atšaukti

6. **Patikrinti DB**:
   ```sql
   SELECT student_id, status, available_spots
   FROM sessions
   WHERE subject_id = 'grupinio-dalyko-id'
   AND start_time = 'ta-pati-start-time'
   ORDER BY student_id;
   ```
   - ✅ Atšauktos sesijos status = 'cancelled'
   - ✅ **Kitų** (active) sesijų available_spots padidėjo +1

---

### ✅ 2.9. Individual Pricing su Grupine Pamoka

**Testuoti:**

1. **Sukurkite individual pricing**:
   - Eikite į Students
   - Pasirinkite mokinį
   - Spauskite "Individualus kainodaras"
   - Pasirinkite grupinį dalyką
   - Nustatykite kitą kainą (pvz. 25 EUR vietoj 30 EUR)
   - Išsaugokite

2. **Sukurkite pamoką**:
   - Eikite į Calendar
   - Sukurkite pamoką tam mokiniui su grupiniu dalyku
   - ✅ Kaina turėtų būti **25 EUR** (individuali)
   - ✅ Pamoka vis tiek turėtų būti **grupinė** (available_spots set)

3. **Patikrinti DB**:
   ```sql
   SELECT id, price, available_spots, subject_id
   FROM sessions
   WHERE student_id = 'mokinio-su-individual-pricing-id'
   AND subject_id = 'grupinio-dalyko-id'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   - ✅ `price` = `25` (individuali)
   - ✅ `available_spots` = `4` arba kitas skaičius (ne null)

---

## 3. Instrukcijų Puslapiai

### ✅ 3.1. Korepetitoriaus Instrukcijos

**Testuoti:**

1. Prisijunkite kaip **korepetitorius** (regular, ne organizacija)
2. Navigacijoje spauskite **"Instrukcijos"**
3. ✅ Turėtumėte pamatyti:
   - Antraštė: "Instrukcijos Korepetitoriams"
   - Pilna apžvalga video viršuje (didelė kortelė, mėlyna)
   - 9 funkcijų instrukcijos kortelės:
     1. Pagrindinis Puslapis
     2. Kalendorius
     3. Mokinių Valdymas
     4. Laukimo Eilė
     5. Finansai ir Mokėjimai
     6. Pamokų Nustatymai
     7. Grupinės Pamokos
     8. Pamokų Paketai
     9. Nustatymai ir Profilis
   - "Reikia Daugiau Pagalbos?" sekcija apačioje

4. **Spauskite ant bet kurios kortelės**:
   - ✅ Turėtų išsiskleisti (expand)
   - ✅ Turėtų rodyti YouTube iframe
   - ✅ Chevron ikona turėtų pasikeisti (down → up)

5. **Spauskite dar kartą**:
   - ✅ Turėtų susiskleisti (collapse)

6. **Patikrinti nuorodas apačioje**:
   - ✅ info@tutlio.lt - mailto link
   - ✅ Vidaus taisyklės - link į /terms-of-service
   - ✅ Privatumo politika - link į /privacy-policy

---

### ✅ 3.2. Organizacijos Instrukcijos

**Testuoti:**

1. Prisijunkite kaip **organizacijos admin**
2. Navigacijoje spauskite **"Instrukcijos"**
3. ✅ Turėtumėte pamatyti:
   - Antraštė: "Instrukcijos Organizacijoms"
   - Pilna apžvalga video: "Tutlio Organizacijoms - Pilna Apžvalga"
   - 8 funkcijų instrukcijos:
     1. Apžvalga
     2. Korepetitorių Valdymas
     3. Mokinių Valdymas
     4. Pamokų Valdymas
     5. Statistika ir Ataskaitos
     6. Pamokų Nustatymai
     7. Finansai ir Mokėjimai
     8. Grupinės Pamokos

4. **Funkcionalumas**:
   - ✅ Expand/collapse veikia
   - ✅ YouTube iframes rodomi
   - ✅ Nuorodos apačioje veikia

---

### ✅ 3.3. Mokinio Instrukcijos

**Testuoti:**

1. Prisijunkite kaip **mokinys**
2. Navigacijoje spauskite **"Instrukcijos"**
3. ✅ Turėtumėte pamatyti:
   - Antraštė: "Instrukcijos Mokiniams"
   - Pilna apžvalga video: "Tutlio Mokiniams - Pilna Apžvalga"
   - 8 funkcijų instrukcijos:
     1. Pradžia
     2. Pamokos
     3. Pamokų Rezervavimas
     4. Laukimo Eilė
     5. Pamokų Paketai
     6. Grupinės Pamokos
     7. Mokėjimai
     8. Nustatymai

4. **Funkcionalumas**:
   - ✅ Expand/collapse veikia
   - ✅ YouTube iframes rodomi
   - ✅ Nuorodos apačioje veikia

---

### ✅ 3.4. YouTube Video Integracijos

**Testuoti:**

1. **Patikrinti placeholder URL**:
   - Visi video placeholder URL yra: `https://www.youtube.com/embed/YOUR_..._VIDEO_ID`
   - ✅ YouTube iframe turėtų rodyti message "Video unavailable"
   - Tai **normalu** - reikia pakeisti į tikrus video ID

2. **Kaip pakeisti į tikrus video**:
   ```typescript
   // Pavyzdys Instructions.tsx:
   const OVERVIEW_VIDEO = {
     title: 'Tutlio Platforma - Pilna Apžvalga',
     videoUrl: 'https://www.youtube.com/embed/TIKRAS_VIDEO_ID', // ⬅️ Pakeiskite čia
     description: '...',
   };
   ```

3. **Patikrinti responsive design**:
   - ✅ Desktop - video turėtų užimti pilną plotį (max 5xl)
   - ✅ Mobile - video turėtų būti responsive (aspect-video)
   - ✅ Kortelės turėtų būti stackable

---

## 4. Visos Klaidos ir Pataisymai

### ✅ 4.1. Waitlist Email Fix (Ankstesnis)

**Kas buvo pataisyta:**
- Mokinių query dabar select'ina `email` field
- Email siunčiamas kai pridedamas į eilę

**Testuoti:**
1. Eikite į Waitlist
2. Pridėkite mokinį į eilę
3. ✅ Console turėtų rodyti: "Sending waitlist confirmation email to..."
4. ✅ Mokinys turėtų gauti email

---

### ✅ 4.2. Waitlist Future Sessions Only (Ankstesnis)

**Kas buvo pataisyta:**
- Waitlist dabar rodo tik **būsimas** atšauktas pamokas

**Testuoti:**
1. Sukurkite pamoką praeityje ir atšaukite
2. Sukurkite pamoką ateityje ir atšaukite
3. Eikite į Waitlist
4. ✅ Turėtumėte matyti **tik ateities** pamoką
5. ✅ Praeities pamoka **nerodoma**

---

### ✅ 4.3. Subject_id Missing in Sessions (Pataisyta)

**Kas buvo pataisyta:**
- Visos session creation vietos dabar įtraukia `subject_id`

**Testuoti:**
1. Sukurkite pamoką bet kuriuo būdu (Calendar, assign student, recurring)
2. Patikrinti DB:
   ```sql
   SELECT id, subject_id, student_id, start_time
   FROM sessions
   ORDER BY created_at DESC
   LIMIT 5;
   ```
3. ✅ **Visos** sesijos turėtų turėti `subject_id` (ne null)

---

## 5. Žinomos Problemos

### ⚠️ 5.1. Available_spots Sinchronizacija

**Problema:**
- Available_spots sinchronizuojamas frontend'e per kelis DB updates
- Teoriškai galima race condition jei 2 mokiniai vienu metu rezervuoja paskutinę vietą

**Workaround:**
- Praktikoje tikimybė maža
- Būtų galima patobulinti su DB trigger arba transaction

**Testuoti:**
- Bandykite vienu metu registruoti 2 mokinius į paskutinę vietą
- ✅ Turėtų leisti tik vienam

---

### ⚠️ 5.2. Grupinės Pamokos "All or Nothing"

**Dizaino sprendimas:**
- Jei dalykas `is_group = true`, **VISOS** jo pamokos grupinės
- Negalima vienos pamokos padaryti individualios, kitos grupinės

**Workaround:**
- Jei reikia mix, sukurkite du dalykus:
  - "Matematika (individuali)"
  - "Matematika (grupinė)"

---

### ⚠️ 5.3. Google Calendar Sync

**Elgsena:**
- Grupinės pamokos sinchronizuojamos kaip atskiri events kiekvienam mokiniui
- Korepetitorius matys kelis events tuo pačiu laiku

**Tai yra normalus behavior** - kiekvienas mokinys turi atskirą event.

---

## 6. Performance Patikrinimas

### ✅ 6.1. Puslapio Greitis

**Testuoti:**

1. Atidarykite **Chrome DevTools** (F12)
2. **Network tab**:
   - Perkraukite puslapį
   - ✅ Initial load turėtų būti < 3s
   - ✅ Calendar page load < 2s
   - ✅ Instructions page load < 1s

3. **Performance tab**:
   - Record → atlikti veiksmus → Stop
   - ✅ FCP (First Contentful Paint) < 1.5s
   - ✅ LCP (Largest Contentful Paint) < 2.5s

---

### ✅ 6.2. Database Performance

**Testuoti:**

1. **Supabase Dashboard → Database → Query Performance**
2. Atlikite kelis veiksmus:
   - Load Calendar
   - Load Student booking page
   - Create group lesson
3. ✅ Patikrinkite slow queries
4. ✅ Index'ai turėtų būti panaudoti:
   - `idx_sessions_available_spots`
   - Kiti performance indexes iš migration 20260319000003

---

## 7. Rollback Planas

### Jei Kas Nors Neveikia

**Database rollback:**
```sql
-- Remove group lesson columns
ALTER TABLE subjects DROP COLUMN IF EXISTS is_group;
ALTER TABLE subjects DROP COLUMN IF EXISTS max_students;
ALTER TABLE sessions DROP COLUMN IF EXISTS available_spots;

-- Remove meeting_link from availability
ALTER TABLE availability DROP COLUMN IF EXISTS meeting_link;
```

**Code rollback:**
```bash
git log --oneline  # Raskite commit prieš pakeitimus
git revert <commit-hash>  # Arba
git reset --hard <commit-hash>  # Jei dar nepushinta
```

---

## 8. Checklist Prieš Production

- [ ] Visos migracijos paleistos
- [ ] Navigacija veikia visoms rolėms (tutor, student, company)
- [ ] Meeting link išsaugomas ir naudojamas
- [ ] Grupinės pamokos sukuriamos su available_spots
- [ ] Available_spots mažėja/didėja booking/cancel
- [ ] Pilna grupė blokuoja naujus booking
- [ ] Instrukcijų puslapiai veikia (tutor, student, company)
- [ ] YouTube iframes placeholder veikia
- [ ] Visos subject_id laukai užpildyti
- [ ] Performance acceptable
- [ ] Console be error'ų
- [ ] Mobile responsive veikia

---

## 9. Kontaktai ir Pagalba

**Jei radote bug:**
1. Browser console screenshot (F12)
2. Supabase logs (jei yra backend error)
3. Aprašykite:
   - Ką darėte
   - Ką tikėjotės matyti
   - Ką iš tiesų matėte
   - Device/browser info

**El. paštas:** info@tutlio.lt

---

## 10. Sekantys Žingsniai

Po testavimo:
1. ✅ Patvirtinkite, kad viskas veikia
2. 📹 Įkelkite YouTube video į placeholders
3. 🚀 Deploy į production
4. 📧 Informuokite vartotojus apie naują funkciją

---

**Paskutinis atnaujinimas:** 2026-03-20
**Versija:** 1.0.0
