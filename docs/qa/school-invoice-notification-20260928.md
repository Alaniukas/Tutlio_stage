# Mokyklos sąskaitos ir pranešimai: #6 / #7

Data: 2026-09-28. Šis dokumentas aprašo įgyvendintą elgseną ir automatinių testų ribas. Tikro naršyklės darbo srauto įrodymai pridedami bendrame mokyklos QA dokumente.

## Sąskaitos gavėjas ir išvaizda (#6)

- Mėnesinė mokyklos sąskaita siunčiama tik `students.payer_email`. Vaiko el. paštas nėra atsarginis gavėjas. Mokėtojo adresas rodomas administratoriui prieš formuojant sąskaitą; jo nesant siuntimas blokuojamas prieš sąskaitos numerio rezervavimą.
- Siuntimo serveris patikrina gyvą mokėtojo adresą pagal konkrečios organizacijos sąskaitą. Leidžiamas vienas gavėjas. Pakartotinai naudojamas anksčiau užfiksuotas laiškas su vaiko ar pasikeitusiu adresu nesiunčiamas: reikalinga peržiūra, užfiksuotas turinys neperrašomas tuo pačiu siuntimo raktu.
- Laiškas turi atskirą žalsvai mėlyną sąskaitos paletę (`#0f766e`, `#115e59`), net jei organizacijos pagrindinė spalva raudona. Išlieka tikslinės organizacijos pavadinimas, logotipas, siuntėjo vardas, parašas ir kontaktai.
- Mokėtojo duomenys laikomi vaiko kortelėje; ši užduotis nekūrė atskiro šeimos sąskaitų gavėjų modelio. Jei vaikas ir mokėtojas naudoja tą patį adresą, leidžiamas įrašytas mokėtojo adresas.

## Lankomumo ir apmokestinimo peržiūra (#7)

Rankinėje mėnesinės sąskaitos formoje pirmiausia įkeliama kiekvieno pasirinkto vaiko laikotarpio užsiėmimo peržiūra. Administratorius gali patvirtinti „Dalyvavo“ / „Nedalyvavo“ per esamą autentifikuotą `confirm-session-status` srautą. Tai tikras lankomumo keitimas; paketo turintiems užsiėmimams išlieka esami paketo skaitiklių efektai. QA naudojamas atskiras Demo užsiėmimas be paketo.

„Neįtraukti į sąskaitą“ yra atskiras sprendimas: 3–1000 simbolių priežastis, administratorius, vaikas, organizacija ir užsiėmimo tapatybė išsaugomi papildomame audito įraše. „Atšaukti neįtraukimą“ sukuria naują įrašą. Abu veiksmai nekeičia lankomumo ar jau išrašytų sąskaitų. Dar nepasibaigusių užsiėmimų ir jau apmokestintų užsiėmimų taip koreguoti negalima.

Grupės vaiko neatvykimas savaime neatleidžia nuo mokesčio, jei paslauga įvyko ir vaikui buvo rezervuota vieta. Peržiūra naudoja ir kitų tos pačios grupės užsiėmimo dalyvių patvirtinimą kaip įvykimo įrodymą. Mokytojo neatvykimas ir kiti neapmokestinami atvejai vertinami pagal esamas kanoninio apmokestinimo taisykles.

Rankiniam skaičiavimui taikoma sutarties paslaugų pradžia, 14 dienų pradžios pasirinkimas, tikslus nutraukimo / atsisakymo laikas ir sustabdymo intervalas. Persidengiančios ar nepilnos sutartys ir nutraukimas užsiėmimo metu paliekami peržiūrai. Prieš išrašant reikia patvirtinti neaiškius užsiėmimus arba aiškiai jų neįtraukti su priežastimi. Naujas sprendimas, lankomumo ar gavėjo pasikeitimas panaikina ankstesnės peržiūros tinkamumą.

## Automatinis EXTRA cron ir rankinė sąskaita yra skirtingi srautai

| Srautas | Skaičiavimo pagrindas | Neįtraukimo elgsena |
| --- | --- | --- |
| `bill-school-extra-lessons`: sutartyje užfiksuotas `fixed` modelis | Sutarties bazinis mėnesio allotmentas ir pagal jos taisykles apmokestinami papildomi užsiėmimai. Lankomumo peržiūra savaime nepaverčia sutarties kintamo užsiėmimų skaičiaus modeliu. | Jei yra rankinis neįtraukimas, visa to sutarties laikotarpio automatinė sąskaita sustabdoma peržiūrai. Bazinis mokestis tyliai nemažinamas. |
| Tas pats cron: sutartyje užfiksuotas `actual` modelis | Kanoniniame priimtame teisiniame tekste apibrėžti faktiškai apmokestinami užsiėmimai. | Pritaikomi audituoti neįtraukimai. Trūkstant įvykimo duomenų ar patikimo audito / jau išrašytų sąskaitų būsenos, sąskaita sulaikoma. |
| `school-monthly-invoice-admin`: rankinė sąskaita | Pasirinkto vaiko patvirtinti, dar neapmokestinti laikotarpio užsiėmimai, jų kainos ir galiojančios nuolaidos; PDF peržiūra prieš išrašant. | Neįtraukti užsiėmimai pašalinami iš eilučių. Išrašymas blokuojamas, kol lieka neaiškių įvykimo ar sutarties duomenų. |

Jau išrašytų sąskaitų užsiėmimų ID apsaugo nuo pakartotinio apmokestinimo. Senesnės sutartinės `fixed` sąskaitos be bazinių užsiėmimų ID konservatyviai užrakina savo paslaugos ir laikotarpio apimtį. Išrašytai sąskaitai taisyti reikia atskiro koregavimo srauto; ši forma jos neperrašo. Esamas sąskaitų išrašymo konkurencijos mechanizmas šioje užduotyje neperprojektuotas.

## Administratoriaus teisės ir duomenų apimtis

| Veiksmas | Serverio reikalavimas |
| --- | --- |
| Įkelti lankomumą / sąskaitos peržiūrą | Aktyvi savo organizacijos administratoriaus paskyra, `finance.view`, esamas mokyklos funkcijos prieinamumo tikrinimas. |
| Neįtraukti / grąžinti užsiėmimą; išrašyti ir siųsti sąskaitą | Papildomai `finance.edit`. |
| Keisti lankomumą | Papildomai `sessions.edit`; esamas `confirm-session-status` endpointas atskirai patikrina užsiėmimo organizaciją. |

Organizacija, vaikas, mokytojo organizacija ir pasirinktas laikotarpis tikrinami serveryje. Vien paslėpti UI mygtukai nėra autorizacija. Tėvų ir mokinių paskyros negali vykdyti šių administravimo veiksmų.

Auditas: `20260928180000_school_session_billing_review.sql` ir papildoma `20260928180100_school_billing_audit_sequence_acl.sql`. `service_role` gali skaityti ir pridėti sprendimus, bet negali jų atnaujinti / ištrinti; sekai suteikiami tik `USAGE, SELECT`. Iki būtinos audito lentelės migracijos skaičiavimas nepraeina su nepatikrinta būsenos informacija. Pritaikymo ir ACL patikrinimo įrodymai laikomi bendrame QA.

## Pranešimai ir likę apribojimai

- Sutaisytas tėvų pranešimų nustatymų praleidimas: `session_comment_added` priklauso `lesson_updates`, o mišrus gavėjų sąrašas filtruojamas po vieną. Tėvų pasirinkimas nepanaikina atskiros vaiko kopijos. Organizacijos nustatymai taikomi ir dar neaktyvavusių paskyros tėvų adresams vaiko kontaktuose.
- Mėnesinė sąskaita yra finansinis dokumentas; pasirenkamų pamokos pranešimų atsisakymas jos neišjungia.
- Kasdienė įrašų ir namų darbų suvestinė vėliau įgyvendinta kartu su šeimos portalu: pritaikytos penkios papildomos migracijos, atlikta Demo darbo srautų ir suvestinės handlerio / DB patikra su imituojamu teikėju. Tikri suvestinės laiškai nesiųsti. Šeimos modelis, senos medžiagos prieiga ir patikros ribos aprašyti [šeimos portalo QA](school-family-rollout-20260928.md).
- Programos deploy ir tikros mokyklos portalo įjungimas neatlikti; nauji tikrų mokyklų požymiai išjungti. Įjungimui būtinas pilnas patvirtintų tėvų, vaikų paskyrų ir medžiagos paruošimas bei readiness patikra be laukiančių įrašų.

## Patikrinimas

- 14 tikslinių sąskaitų, apmokestinimo, gavėjų, vertimų ir UI testų rinkinių: **95 / 95** testai praėjo.
- `npm run lint` ir `npm run lint:api`: praėjo.
- Nauji 34 lankomumo / sąskaitos peržiūros UI tekstai patikrinti visoms 13 palaikomų senųjų lokalizacijų.
- Tikras `send-email` šablonas sugeneruotas su fiktyvia raudonai pažymėta mokykla ir užmockintu Resend. Vietinis vizualus failas: `tmp/school-fixes-20260928-invoice-email.html`; tik QA vardai, negaliojantys mokyklos logotipo / apmokėjimo adresai.
- Automatiniai testai naudoja fiktyvią DB ir siuntimo tiekėją. Šiame agente **nebuvo gyvų DB pakeitimų, tikrų el. laiškų, mokėjimų, commit ar deploy**. Migracijų pritaikymas ir tikras Demo naršyklės srautas dokumentuojami atskirai; realios Laisvi vaikai finansinės sąskaitos nebuvo kuriamos šiame QA.
