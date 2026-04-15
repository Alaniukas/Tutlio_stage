# Grupinių Pamokų Testavimo Planas

## ✅ Testas 1: DB Migracija
**Tikslas:** Patikrinti ar `hidden_from_calendar` laukas sukurtas

**Veiksmai:**
1. Prisijungti prie Supabase Dashboard
2. Eiti į SQL Editor
3. Vykdyti: `SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'hidden_from_calendar';`

**Tikėtinas rezultatas:** Turėtų grąžinti `hidden_from_calendar`

---

## ✅ Testas 2: Sukurti Grupinę Pamoką (Individuali)
**Tikslas:** Patikrinti ar galima sukurti grupinę pamoką su keliais mokiniais

**Veiksmai:**
1. Eiti į Lesson Settings
2. Sukurti naują dalyką:
   - Pavadinimas: "Matematika - Grupinė"
   - ✅ Pažymėti "Grupinė pamoka"
   - Max mokinių: 5
   - Kaina: 15€
   - Trukmė: 60min
3. Eiti į Calendar → "Sukurti pamoką"
4. Pasirinkti dalyk

ą "Matematika - Grupinė"
5. Turėtų rodyti: **(Grupinė - 5 vietų)** violetine spalva
6. Pasirinkti 3 mokinius iš checkboxų
7. Nustatyti laiką rytojui
8. Spausti "Sukurti pamoką"

**Tikėtinas rezultatas:**
- Alert: "Sėkmingai sukurtos 3 grupinės pamokos!"
- Kalendoriuje matomas VIENAS event'as su 3 mokinių vardais
- DB turėtų būti 3 atskiros sesijos tuo pačiu laiku

---

## ✅ Testas 3: Grupinė Pamoka Kalendoriuje
**Tikslas:** Patikrinti merge logiką

**Veiksmai:**
1. Po Testo 2, kalendoriuje turėtų būti vienas merged event
2. Event'as turėtų rodyti: "Matematika - Grupinė: Jonas, Petras, Marija"
3. Subtitle: "3/5 vietų"

**Tikėtinas rezultatas:** Vienas event'as, ne 3 overlapping

---

## ✅ Testas 4: Atidaryti Grupinę Pamoką
**Tikslas:** Patikrinti modal UI grupinėms pamokoms

**Veiksmai:**
1. Spausti ant grupinės pamokos kalendoriuje
2. Turėtų atidaryti modal'ą

**Tikėtinas rezultatas:**
- Header: "Grupinė pamoka"
- Subtitle: "3 mokiniai • Matematika - Grupinė"
- Sąrašas visų 3 mokinių su:
  - Vardu
  - Mokėjimo statusu (✓ Apmokėjo / Neapmokėjo)
- Mygtukai: "Atšaukti", "Įvykusi", "Žymėti apmokėta", "Pridėti mokinį"

---

## ✅ Testas 5: Atšauktos Pamokos Auto-Hide
**Tikslas:** Patikrinti ar atšauktos pamokos dingsta po 12h

**Veiksmai:**
1. Sukurti paprastą pamoką
2. Atšaukti ją
3. DB: Rankiniu būdu pakeisti `cancelled_at` į 13h atgal:
   ```sql
   UPDATE sessions
   SET cancelled_at = NOW() - INTERVAL '13 hours'
   WHERE id = 'SESSION_ID';
   ```
4. Refresh kalendorių

**Tikėtinas rezultatas:** Atšaukta pamoka NERODOMA kalendoriuje (auto-hidden)

---

## ✅ Testas 6: "Ištrinti" Mygtukas
**Tikslas:** Rankinė atšauktos pamokos šalinimas

**Veiksmai:**
1. Sukurti pamoką
2. Atšaukti ją
3. Atidaryti atšauktą pamoką (turėtų būti rodoma nes dar < 12h)
4. Spausti "🗑️ Ištrinti iš kalendoriaus"

**Tikėtinas rezultatas:**
- Modal'as uždarytas
- Pamoka DINGO iš kalendoriaus
- DB: `hidden_from_calendar = true`

---

## ✅ Testas 7: Pasikartojanti Grupinė Pamoka
**Tikslas:** Recurring group lessons

**Veiksmai:**
1. "Sukurti pamoką"
2. Pasirinkti grupinį dalyką
3. Pasirinkti 2 mokinius
4. Nustatyti laiką
5. ✅ Pažymėti "Pasikartojanti pamoka"
6. Nustatyti "Kartotis iki": +4 savaitės
7. Sukurti

**Tikėtinas rezultatas:**
- DB: 8 sesijos (2 mokiniai × 4 savaitės)
- Kalendoriuje: 4 merged events (po vieną kiekvienai savaitei)
- Kiekvienas merged event rodo tuos pačius 2 mokinius

---

## ✅ Testas 8: Email'ai Grupinėms Pamokoms
**Tikslas:** Patikrinti ar visi mokiniai gauna email'us

**Veiksmai:**
1. Sukurti grupinę pamoką su 2 mokiniais (turinčiais email'us)
2. Patikrinti email inbox'us

**Tikėtinas rezultatas:**
- Abu mokiniai gauna "booking_confirmation" email
- Jei payer=parent, tėvai gauna payment email (jei neapmokėta)

---

## ✅ Testas 9: Mokinių Pasirinkimo Limitas
**Tikslas:** Negalima pasirinkti daugiau nei max_students

**Veiksmai:**
1. Sukurti dalyką su max_students = 3
2. Bandyti pasirinkti 4 mokinius

**Tikėtinas rezultatas:**
- Po 3 mokinių pasirinkimo, kiti checkboxai tampa disabled
- Rodoma: "Pasirinkta: 3 / 3"

---

## ✅ Testas 10: Finance Reporting
**Tikslas:** Atšauktos/hidden pamokos matomos finance

**Veiksmai:**
1. Sukurti pamoką ir "Ištrinti iš kalendoriaus"
2. Eiti į Finance puslapį

**Tikėtinas rezultatas:** Hidden pamokos VIS TIEK matomos finance (historical data)

---

## 🔧 Testuoti Vėliau (Papildomos funkcijos)
- ➕ Pridėti mokinį į egzistuojančią grupinę pamoką
- ✏️ Redaguoti visą grupę iš karto
- ❌ Atšaukti grupę su pasirinkimu (tik ši / visos būsimos)
- 📊 Grupinių pamokų statistika Dashboard

---

## 🐛 Žinomi Bug'ai / TODO
1. "Pridėti mokinį" mygtukas dar neveikia (alert placeholder)
2. Group cancel/edit dar neturi "choice" dialog'ų
3. Recurring templates dabar kuria po template kiekvienam mokiniui (veikia, bet gali būti optimizuota)
