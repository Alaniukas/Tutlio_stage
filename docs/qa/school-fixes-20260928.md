# Mokyklos pataisų patikra, 2026-09-28

Kodas paruoštas vietiniame checkout. Produkcijos aplikacija nebuvo deployinta; commit ir push neatlikti. Vėliau įgyvendinto šeimos portalo ir jo Demo patikros būsena pateikta [šeimos portalo QA](school-family-rollout-20260928.md); tikros mokyklos paleidimas neatliktas. [Sutarti pakeitimai klientui](../laisvi-vaikai-pasiulymas-2026-09-28.md). Laiškas klientui dar neišsiųstas.

## Pritaikytos migracijos

Vartotojo prašymu migracijos pritaikytos aktyviam Supabase projektui `cuhciqwmqfuajeeqjjbm`. Tai produkcijos DB. Pritaikyta tik ši konkreti schema, be bendro visų laukiančių migracijų push. Tikrų mokyklų verslo duomenys ir feature flag'ai nekeisti; UI QA rašo tik Demo Mokyklos duomenis.

| Migracija | SHA-256, sutampantis su DB migracijų įrašu |
| --- | --- |
| `20260928160000_school_group_contract_membership.sql` | `e69c2b59f1bb683846908f9c623a2b4e0ea2d6e6f3d9dfcdfb562b197c256845` |
| `20260928160100_school_recording_access_denials.sql` | `d5b72d6ed69c9e7442ed6a1316f91bfe81c854e634deb49b17563f468e2e3caf` |
| `20260928180000_school_session_billing_review.sql` | `7c4a146c80311e2669a6476542fc7d31448f00c6bd9dcbdcdba4ec2ea6fef572` |
| `20260928180100_school_billing_audit_sequence_acl.sql` | `c45e4972315b28da2aef61a12e2bea55efda01deae65487e1888be6b5aa53d8c` |
| `20260928180200_school_compact_reminder_recipient_parity.sql` | `44257515a629ed92038b24c509d7695937320da6d953b4f27339cd7d7748c51c` |

SQL pirmiausia vykdytas transakcijoje su ROLLBACK, tada pritaikytas su COMMIT ir įrašytas į `supabase_migrations.schema_migrations`. Galutinė patikra patvirtino minimumo CHECK (2 arba 3), administratoriaus teisių triggerį ir abiejų naujų lentelių RLS. Prieigos blokavimo lentelės neskaito anon / authenticated. Sąskaitų audito lentelės service role gali SELECT / INSERT, tačiau negali UPDATE / DELETE; jos sekai leidžiami USAGE / SELECT, UPDATE uždraustas. Pritaikyta ankstesnė migracija nebuvo perrašyta: papildomam sekos ACL panaudota atskira 180100 migracija.

180200 migracija suderina cron atranką su pasirenkamų trumpų kvietimų API: kai vaikas neturi savo, mokėtojo ar antrinio tėvo pašto, pasirenkamas susietas registruotas tėvas, leidęs priminimus. Atrankos funkcija vykdoma tik service role, anon / authenticated neturi EXECUTE. Laiko langai, limitai ir esami gavėjų keliai išliko. Šis pasirinkimas nėra įjungtas tikrai organizacijai.

## Tikri naršyklės darbo srautai

Frontend `http://127.0.0.1:3101`, API `http://localhost:3102`. API procese `TUTLIO_DEV_SUPPRESS_EMAIL=1`: POST `send-email` sustabdomas prieš tikrą siuntimą. Prisijungta esama Demo administratoriaus paskyra. Finansinių mokėjimų ir tikrų sąskaitų siuntimo QA neatlieka.

| Srautas | Veiksmas ir nepriklausoma patikra |
| --- | --- |
| Septintas grupės narys | `QA 7 nariai 2026-09-28`: per UI pridėtas 7-as vaikas prie 6 narių, išsaugota, perkrauta ir vėl atverta forma. DB turi 7 narius, senos `enrolled_at` datos išliko, sukurtos 7 užsiėmimo eilutės be dublių. |
| Grupės minimumo išsaugojimas | Tos pačios Demo grupės administratorius UI pakeitė minimumą 3 → 2. Po puslapio perkrovimo formoje ir DB liko 2, visi 7 nariai išliko. |
| Individualus sutarties sustabdymas / atnaujinimas | Atskirai `QA Sutarties narystė 2026-09-28` su 4 priimtomis, pasirašytomis EXTRA sutartimis ir minimumu 2. Sustabdžius Luko QA sutartį per UI, grupėje liko 3 nariai; jų datos ir grafikai išliko. Atnaujinus sutartį per UI, DB patvirtino visų 4 narių tikslias pradines datas ir `schedule_slots`. |
| Tikra minimumo riba ir automatinis atnaujinimas | Per UI sustabdytos dvi QA sutartys: su 2 nariais ir minimumu 2 grupė liko aktyvi, DB turėjo 2 būsimų užsiėmimų eilutes. Pakeitus minimumą į 3, grupė ir likusios aktyvios sutartys automatiškai sustabdytos, DB neliko būsimų užsiėmimų, 2 nariai išliko sąraše. Pakeitus minimumą į 2, grupė ir tos sutartys automatiškai atnaujintos, atsirado 2 užsiėmimai. Dvi individualiai sustabdytos sutartys liko sustabdytos iki jų atskiro atnaujinimo. Galiausiai per UI atnaujintos abi: 4 nariai, 4 užsiėmimai be dublių. |
| Įrašų prieigos valdymas | `/school/recordings` administratorius pašalino tik testinės `demo-mokykla.extra.parent@tutlio.lt` paskyros prieigą, matė ją sąraše ir atkūrė. Perkrovus pašalintų prieigų sąrašas tuščias, DB patvirtino 0 tos paskyros blokavimo įrašų. |
| Lankomumo ir neapmokestinimo auditas | Naujas Demo užsiėmimas `6a534f1b-0bc7-4b9f-add9-5803456814f1`, Lukas, Matematika, 2026-09-28 10:00, 15 €, be paketo. UI patvirtinta „Dalyvavo“; DB išsaugojo completed / `status_confirmed_at`, apmokėjimas liko pending. UI sukurtas neapmokestinimo sprendimas su priežastimi, atkūrimo sprendimas ir galutinis testinio užsiėmimo neapmokestinimas; DB turi 3 atskirus audito įrašus. Lankomumas nepakeistas, ankstesni audito įrašai neperrašyti. |
| Tikra sąskaitos peržiūra | UI sugeneruota 15 € peržiūra su tikru API PDF atsakymu. Dėl kitų 4 nepatvirtintų Demo užsiėmimų siuntimas teisingai liko užblokuotas. Tikrų sąskaitų, jų numerių ir PDF saugyklos eilučių neatsirado. PDF peržiūros kortelė patikrinta; atskiras PDF viewer nepatikrintas. |
| Sąskaitos laiško vaizdas | Naršyklėje peržiūrėtas tikro `send-email` handlerio HTML, sugeneruotas su mock Resend ir fiktyvia raudoną spalvą turinčia mokykla. Sąskaitos akcentai liko žalsvai mėlyni, sumos / nuolaida / terminas ir mokėjimo mygtukas matomi. Tai šablono patikra, laiškas neišsiųstas. Logotipo ir apmokėjimo URL šiame sanitizuotame pavyzdyje negaliojantys. |

Pirmoji sąskaitos QA sesijos grupinė versija teisingai nebuvo įtraukta iki sutarties pirmojo ketvirtadienio, 2026-10-01. Testui ji pakeista į atskirą individualų užsiėmimą, neliečiant esamų vaiko sutarčių. Taip lankomumo / audito testas neapėjo sutarties laikotarpio taisyklės.

Minimumo ribos bandymas paliko visas 4 pradines narystės datas ir tą patį efektyvų ketvirtadienio 13:00 grafiką. Redagavimo forma, išsaugant vienintelį grupės laiką, dviem nuolatiniams nariams normalizavo `schedule_slots` į NULL („visi grupės laikai“). Todėl galutinė neapdorotų masyvų lygybės žyma nėra teigiama; tai formos normalizavimas, ne grafiko ar narystės datos praradimas. Pirmas sustabdymo / atnaujinimo bandymas prieš minimumo keitimą patvirtino ir tikslių masyvų atkūrimą.

Sąskaitos UI patikrai laikinai įjungtas Demo `school_consultations` ir sukurtas fiktyvus Demo sąskaitos profilis. Po patikros flag'o ankstesnė būsena atkurta, tik sukurtas QA profilis pašalintas, jo numerių skaitiklis nepakitęs (1), sąskaitų ir PDF saugyklos bazė nepakitusi. Naujas testinis užsiėmimas paliktas neapmokestinamas. Nė vienas tikros organizacijos profilis ar sutartis nekeistas.

## Įrodymai šiame checkout

- `tmp/school-group-qa-20260928/`: pirminio 6 → 7 srauto ekranai ir DB ataskaitos.
- `tmp/school-fixes-qa-20260928/minimum-2-reloaded.png`.
- `tmp/school-fixes-qa-20260928/contract-suspended.png`, `contract-group-three-after-suspend.png`, `contract-resumed.png`.
- `tmp/school-fixes-qa-20260928/group-two-minimum-2-active.png`, `group-two-minimum-3-suspended.png`, `group-two-minimum-2-resumed.png`, `group-four-final-restored.png`, `group-final-report.json`.
- `tmp/school-fixes-qa-20260928/recording-access-revoked.png`, `recording-access-restored.png`.
- `tmp/school-fixes-qa-20260928/invoice-session-excluded.png`, `invoice-preview-15-send-blocked.png`, `invoice-excluded-report.json`, `invoice-restored-report.json`, `invoice-final-report.json`.
- `tmp/school-fixes-qa-20260928/invoice-email-teal-full.png`.
- `tmp/school-contract-membership-qa-20260928/`: QA manifestas ir DB narystės ataskaitos.
- `tmp/school-invoice-review-qa-20260928/`: laikino Demo flago ir sesijos manifestas.
- `tmp/school-invoice-profile-qa-20260928/`: laikino sąskaitos profilio manifestas ir patikros bazė.
- `tmp/school-fixes-20260928-compact-manifest.json`: paskutinės kvietimų gavėjų migracijos SHA.
- `tmp/school-fixes-20260928-postflight.sql`: penkių migracijų SHA / ACL / RLS, prieigos blokavimų ir QA atkūrimo tik skaitymo patikra.
- `tmp/school-fixes-qa-20260928/migration-postflight-report.json`: galutinis DB patikros rezultatas; 5 SHA sutampa, Demo flag'o nebėra, laikino sąskaitos profilio nebėra, Indrės ir testinio kontakto blokavimų 0.

Šie laikini QA failai ignoruojami Git. Pataisų kodas ir regresijos testai lieka įprastuose projekto failuose.

## Automatinės patikros

- Grupės / sutarčių / cron / SQL / UI: 104 testai 17 rinkinių praėjo.
- Įrašų prieigos / stream / SQL / lokalizacijos / ESM: 107 testai 10 rinkinių praėjo.
- Sąskaitų / gavėjų / audito / pranešimų pasirinkimų / UI: 95 testai 14 rinkinių praėjo.
- Root bendra laiškų, vertimų, pranešimų pasirinkimų ir ESM patikra: 47 testai 8 rinkinių praėjo. Rinkiniai iš dalies persidengia; šie skaičiai nesumuojami į unikalių testų skaičių.
- Papildoma registruoto tėvo gavėjo API / laiško patikra: 31 testas 2 rinkinių praėjo. Cron atrankos tikro SQL (PGlite) ir API patikra: 26 testai 2 rinkinių praėjo.
- Frontend ir API TypeScript patikros (`npm run lint`, `npm run lint:api`) praėjo.

Detalesnis sąskaitų srautų ir teisių aprašymas: [sąskaitų QA](school-invoice-notification-20260928.md).

## Kas dar derinama

Indrės realios prieigos nekeista. DB patvirtino 0 jos prieigos blokavimo įrašų. Jos el. paštui Auth paskyros nerasta; seną bendrą vaiko nuorodą atšaukti tik vienam jos turėtojui neįmanoma. Sprendimas įtrauktas į klausimus klientui.

`school_compact_notifications` lieka atskiras pasirenkamas nustatymas periodiniams užsiėmimo kvietimams: vaiko paštas, o jo nesant vienas tinkamas tėvas. Vėlesnis šeimos portalo modelis, vieno kvietimo ir kasdienės medžiagos suvestinės politika jau įgyvendinti; pritaikytos penkios papildomos migracijos ir atlikta Demo darbo srautų patikra. Suvestinė tikrinta per tikrą handlerį ir DB su imituojamu laiškų teikėju, tikri laiškai nesiųsti. Dabartinė apimtis, įrodymai ir ribos pateikti [šeimos portalo QA](school-family-rollout-20260928.md). Programos deploy neatliktas, tikrų mokyklų nauji požymiai išjungti. Prieš jų įjungimą dar būtinas pilnas patvirtintų tėvų, atskirų vaikų paskyrų ir senos medžiagos prieigos paruošimas bei readiness patikra be laukiančių įrašų. Metinės sutarties nutraukimas lieka kreipiantis į mokyklą, ne tėvų savitarnoje.

Tikro Drive vaizdo paleidimas lokaliai nepatikrintas: QA API trūksta `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64`. Įrašų prieigos sąrašo ir Range proxy autorizaciją dengia automatiniai testai; tikras vaizdo end-to-end lieka aplinkai su Drive prieigos duomenimis.
