# Mokyklos šeimos portalo paruošimas, 2026-09-28

**Būsena: suplanuoti Demo darbo srautai patikrinti; programa neišleista.** Visos penkios migracijos pritaikytos ir jų SHA patikrintos. Laikini Demo požymiai atkurti, tikros mokyklos nauji požymiai išjungti. TypeScript ir build praėjo. Neįrodytos naršyklės atsisiuntimo ir tikro Drive vaizdo ribos aprašytos žemiau.

## Įgyvendinimo apimtis

`school_family_portal` įjungia atskiras vaiko ir metinės sutarties tėvų tapatybes, privačią medžiagą, dienos medžiagos suvestinę, konsultacijų privatumo taisykles ir grupių įrašų planų prieigą. Kai požymio nėra arba jis `false`, naujos portalo šakos netaikomos. Organizacijos pavadinimai ir laiškų ženklinimas imami iš tikslinės mokyklos.

Tėvų prieiga remiasi patvirtintu `school_family_guardians` ryšiu ir gyva pasirašyta, nearchyvuota bei nenutraukta metine sutartimi. Pasirašytojo el. paštas, vardas ir asmens kodo kontrolinė suma turi atitikti užfiksuotą įrodymą. Administracijos patvirtintas ryšys naudojamas tik pagal numatytas rankinio patvirtinimo taisykles. Bendra vaiko ir tėvo Auth tapatybė nesuteikia privačių konsultacijos užrašų prieigos. Metinės sutarties nutraukimas tėvų savitarnoje nepridėtas; esamas papildomų pamokų sutarčių atsisakymo / nutraukimo srautas išlieka atskiras.

Konsultacijos rezervacija gali būti skirta šeimai arba konkrečiam vaikui. Šeimos apžvalgoje rodomos abiejų tipų rezervacijos; pasirinkto vaiko vaizde rodomos tik jam skirtos rezervacijos. Administracija mato autorizuotos rezervacijos metaduomenis. Privatūs užrašai laikomi atskiroje lentelėje, ne rezervacijos eilutėje, ir grąžinami atskiru API. Juos skaito tik tinkamas atskirą tapatybę turintis tėvas arba paskirtas specialistas. Specialistas kuria ir redaguoja savo užrašą; tėvas tik skaito. Vaiko paskyra ir vien administratoriaus teisė prieigos nesuteikia. Galutinė užrašų užklausa naudoja vartotojo JWT ir RLS; API visiems atsakymams nustato `Cache-Control: private, no-store`.

Medžiagos prieiga tikrinama pagal gyvą vaiko / patvirtinto tėvo ryšį, grupę arba aktyvų individualų dalyką ir tikrą failo versiją bei Drive aplanką. Prieš įjungiant portalą reikia užfiksuoti senų medžiagos nuorodų prieigos bazę. Nauji arba nežinomi failai po perėjimo laikomi privačiais. Drive įrašų 30 dienų matomumo riba riboja prieigą per Tutlio; šis pakeitimas **fiziškai netrina Drive failų**.

Dienos medžiagos suvestinė užšaldoma vienam organizacijos gavėjui vienai Vilniaus kalendorinei dienai. Vaikas su savo el. paštu gauna savo medžiagą; be jo naudojamas patvirtintas tėvas. Vieno failo redakcijos sujungiamos į vieną naujausią nuorodą. Kartojimas naudoja tą patį teikėjo idempotentiškumo raktą; neaiškus rezultatas po 23 valandų lieka `review` rankinei patikrai. Prieiga tikrinama iš naujo prieš siuntimą, o vienas vykdymas pasirenka iki 20 tinkamų užduočių.

## Organizacijos požymiai

| Požymis | Numatytoji reikšmė | Paskirtis ir paruošimas |
| --- | --- | --- |
| `school_family_accounts_setup` | `false` | Leidžia administracijai patikrinti metinės sutarties tėvą ir paruošti atskiras vaikų paskyras prieš portalo įjungimą. |
| `school_family_portal` | `false` | Įjungia šeimos portalą ir naujas privatumo taisykles. Registras žymi `requiresSetup`; prieš įjungiant tikrinami ryšiai ir senų failų prieigos bazė. |
| `school_compact_notifications` | `false` | Savarankiškai valdo periodinį kvietimą prieš užsiėmimą: vienas vaiko laiškas, o be jo el. pašto vieno tinkamo tėvo laiškas. Tai nėra pirmojo kvietimo po sutarties priėmimo pakeitimas. |
| `school_lesson_recordings` | `false` | Esamas privatus Drive įrašų modulis; reikia atskiro serverio Drive paruošimo ir mokyklos įrašų nustatymų. |

## Schema ir etapinis paruošimas

Aktyvus Supabase projektas `cuhciqwmqfuajeeqjjbm` yra produkcijos DB. Kiekviena migracija pirmiausia patikrinta atskiroje transakcijoje su ROLLBACK, tada pritaikyta su COMMIT; bendras laukiančių migracijų `push` neatliktas. [Tik skaitymo ataskaita](../../tmp/school-family-qa-20260928/family-postflight-report.json) ir originalūs SQL patvirtino visas penkias kontrolines sumas, ACL/RLS, funkcijų teises ir aktyvius privatumo triggerius.

| Pritaikyta migracija | SHA-256, sutampanti su DB įrašu |
| --- | --- |
| `20260928190000_school_family_account_workflow.sql` | `009e650e1ad5a8c14b0eeda60bfdd24b829da5ac02a58ebab0ea2f4255afe591` |
| `20260928190100_school_recording_plan_entitlements.sql` | `45f47f3e1b5333790d26580539f34fce5fc8867b953eb2d15468d950ae8b72b3` |
| `20260928190200_school_family_consultation_privacy.sql` | `6968d500cd9866278f38cbca88165a6796c6f4dd02f369153b3f87556cd82da7` |
| `20260928190300_school_material_publications_digest.sql` | `d56ad2581139cc83ff984a984580ed793750f906d4711b21c2d45d90d4124e16` |
| `20260928190400_school_family_signup_claim_guard.sql` | `74c3caca4f14d1fea45eb3a462d55d8821e86d939050c3f72d008a43eb50dedb` |

Laisvi vaikai (`2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17`) neturi įjungtų `school_family_accounts_setup`, `school_family_portal` ar `school_compact_notifications`. Indrės prieigos blokavimų liko 0, Auth paskyros jos paštui nėra; jos kontaktai ir prieiga nekeisti. Visų ankstesnių organizacijos požymių pradinės kopijos nėra, todėl pilna jų lygybė neteigiama.

Paruošimas vyksta su išjungtu portalu: patikrinti sutarties tėvą, paruošti atskiras vaiko tapatybes ir senų medžiagos nuorodų prieigos bazę. Esamų paskyrų slaptažodžių neperrašyti. Po to būtina pilna `school_family_portal_readiness` patikra. Demo ataskaita turi `baselineReady=true`, 5 tinkamus vaikus ir **2 laukiančius senus, su naujais trimis QA vaikais nesusijusius įrašus**. Įprastas įjungimas dėl jų lieka užblokuotas; laikinas Demo įjungimas buvo tik koordinuotas testas ir nereiškia, kad visos mokyklos paruošimo patikra praėjo.

Verslo duomenų QA apima tik Demo `c3a00000-7e57-4000-8000-000000000001` naujus tris vaikus, dvi tėvų tapatybes, savo užsiėmimus / failus ir naują QA specialistą. Esamas mokytojas neperrašytas. [Manifestai ir įrodymai](../../tmp/school-family-qa-20260928/) ignoruojami Git; slaptažodžiai ir raktai čia nededami. Įprastas vietinis API veikia su `TUTLIO_DEV_SUPPRESS_EMAIL=1`; tikri laiškai ir mokėjimai neatlikti. Demo `school_family_accounts_setup` ir `school_family_portal` atkurti į pradinę neegzistuojančią reikšmę, `school_lesson_recordings=true` paliktas kaip prieš patikrą.

## Atlikti vietiniai bandymai

Šie rezultatai yra vietinių Vitest / PGlite bandymų, ne gyvos produkcijos ar Demo UI įrodymas. El. pašto teikėjas bandymuose pakeistas valdomu imitatoriumi; tikri laiškai nesiųsti.

| Apimtis | Rezultatas | Ką patvirtina |
| --- | --- | --- |
| `tests/api/school-material-digest.test.ts` | 15 / 15 praėjo. | Naujausių redakcijų sujungimas, gavėjų prieiga ir atšaukimas, vienas teikėjo kvietimas lygiagrečioms užduotims, užšaldyto siuntimo kartojimas, dalinio įrašymo atkūrimas, `review` riba, užduočių eilės pralaidumas. Naudojamos PGlite lentelės ir tikros migracijos rezervavimo funkcijos. |
| `tests/api/process-school-materials.test.ts` | 5 / 5 praėjo. | Esamų siuntimų kartojimas bet kuriuo paros metu, vienos klaidos izoliavimas, naujos suvestinės paruošimas nustatytu laiku, siuntimo slopinimas ir administratoriaus peržiūros ribos. |
| Konsultacijų API, DB, grynos logikos, UI ir JWT kliento bandymai | 24 / 24 praėjo. | Šeimos / vaiko rodiniai, gyvas tėvo ryšys, autorystė, vaiko / administratoriaus draudimas, tiesioginis RLS, paskyrimo ir sutarties įrodymo atšaukimas, ankstesnio org srauto išlaikymas, pasenusių UI atsakymų atmetimas ir vartotojo JWT naudojimas. |
| Užrašų `no-store` regresija esamame konsultacijų API faile | 10 / 10 API bandymų pakartotinai praėjo po antraštės pakeitimo. | `private, no-store` yra leidžiamo skaitymo ir atmesto rašymo atsakyme. Tai tie patys API bandymai, įskaičiuoti į 24, ne papildomi 10. |
| Senųjų school tėvų srautų ir sutarčių teisių regresijos | 19 testų praėjo, pagal pagrindinio agento patvirtinimą. | Pataisyti senų API / sutarčių tėvų autorizacijos apėjimai įjungto portalo atveju. |
| Pakartotinės failų / tų pačių pavadinimų regresijos | 36 testai praėjo, pagal pagrindinio agento patvirtinimą. | Failų pavadinimai nepakeisti. Šis rinkinys persidengia su kitomis regresijomis; skaičiai nesumuojami. |
| Frontend ir API TypeScript, `git diff --check` | Galutinės `npm run lint` ir `npm run lint:api` patikros praėjo; pakeitimų formato patikra taip pat praėjo. | Tai nepakeičia gyvos sąsajos patikros. |
| Produkcinis build į atskirą QA aplanką | Exit 0, Vite 6.4.3, 7 046 moduliai, 25,24 s, PWA 54 įrašai. | `vite build --outDir tmp/school-family-qa-20260928/build`; [ataskaita](../../tmp/school-family-qa-20260928/build-verification.json). Programos deploy neatliktas. |

Konsultacijų 24 bandymų sudėtis: API 10, tiesioginis PGlite SQL / RLS 2, gryna logika ir 13 kalbų paritetas 2, užrašų dialogas 4, portalo vaizdai 4, JWT klientas 2.

## Gyva Demo patikra

| Scenarijus | Būsena / įrodymas |
| --- | --- |
| Atskiros šeimos tapatybės ir aktyvavimas | Trys vaiko ir dvi tėvų paskyros atskiros. Tikras `sf1` API aktyvavo visas 5; pakartotinis kvietimas nepakeitė Auth metaduomenų, kontaktų ar aktyvavimo / prisijungimo žymų, esamų paskyrų atkūrimų 0. [Aktyvavimo ataskaita](../../tmp/school-family-qa-20260928/activation-report.json), [pakartotinio kvietimo ataskaita](../../tmp/school-family-qa-20260928/reinvite-report.json), [UI ekranas](../../tmp/school-family-qa-20260928/activation-redeemed.png). |
| Tėvų šeimos apžvalga, vaiko pasirinkimas ir namų darbai | Tikrame UI pagrindinis tėvas matė du savo vaikus, perjungė pasirinktą vaiką ir įkėlė namų darbo failą. [Šeimos apžvalga](../../tmp/school-family-qa-20260928/parent-family-overview.png), [įkėlimas](../../tmp/school-family-qa-20260928/parent-homework-uploaded.png). |
| Vaikas be el. pašto | .102 prisijungė įprastu mokinio vartotojo vardu, matė savo medžiagą ir įkeltą namų darbą; tik tėvams skirta mokytojo pastaba nerodyta. [UI ekranas](../../tmp/school-family-qa-20260928/student-username-materials-no-parent-note.png). |
| Gyva API / JWT / RLS prieiga | **53 / 53 patikros praėjo**: vaiko / tėvo auditorija, kitos šeimos ir svetimo aplanko draudimas, failų baitai / SHA, privatūs užrašai ir tėvo rašymo draudimas. Su tikrais JWT vaikai ir administratorius gavo 0 užrašų, pirmas tėvas 2, kitos šeimos tėvas 1, specialistas 3. [Ataskaita](../../tmp/school-family-qa-20260928/identity-material-notes-report.json). |
| Įkelto namų darbo proxy | **13 / 13 papildomų patikrų praėjo**: tėvas1 ir vaikas .102 gavo tikslius pradinio failo baitus / SHA, tėvas2 ir vaikas .101 bei suklastoti svetimo aplanko ryšiai gavo 403. Sąrašai pateikė autorizuoto proxy nuorodas. [Ataskaita](../../tmp/school-family-qa-20260928/upload-proxy-report.json) turi `nativeDownloadOnDiskVerified=false`; naršyklės išsaugojimas neteigiamas. Šių patikrų nesumuojame su ankstesnėmis 53 kaip bendro unikalių scenarijų skaičiaus. |
| Senos viešos namų darbų nuorodos | UI prieš ir po perėjimo matė seną mokytojo failą; naujas privatus failas ir įkėlimas po perėjimo paslėpti. [Prieš](../../tmp/school-family-qa-20260928/legacy-before-private.png), [po](../../tmp/school-family-qa-20260928/legacy-after-private.png). |
| Konsultacijų administratoriaus UI | Matė 3 rezervacijas be privačių užrašų valdiklių. [Ekranas](../../tmp/school-family-qa-20260928/admin-bookings-no-notes.png). |
| Konsultacijų tėvo UI | Privatus užrašas atsivėrė tik skaitymui, be redagavimo. Pasirinkus vaiką .101, konsultacijų vaizdas rodė tik jam skirtą rezervaciją. [Užrašas](../../tmp/school-family-qa-20260928/parent-private-note-readonly.png), [vaiko filtras](../../tmp/school-family-qa-20260928/parent-child-consultation-filter.png). |
| Specialisto redagavimas ir nauja versija tėvui | Specialistas prisijungė įprastu būdu, rezervacijoje .202 per UI išsaugojo savo .302 užrašo sintetinį QA tekstą. DB išliko tikslus tekstas ir autorius .401. Tėvas per UI matė naują versiją tik skaitymui. [Specialisto ekranas](../../tmp/school-family-qa-20260928/specialist-private-note-saved.png), [tėvo ekranas](../../tmp/school-family-qa-20260928/parent-specialist-note-after-edit.png), [API / DB ataskaita](../../tmp/school-family-qa-20260928/specialist-ui-save-report.json): tėvas1 ir specialistas 200, vaikas .101, administratorius ir tėvas2 403. |
| Dienos medžiagos suvestinė | Tikras `process-school-materials` handleris ir DB reserve / claim RPC praėjo su ribotu Demo transportu bei imituojamu teikėju. Sukurti 3 QA gavėjų įrašai: .101 tik vaiko paštui, .102 pirmam tėvui, .103 kitos šeimos tėvui. Patvirtinti nekintantis vienos dienos turinys, tas pats raktas / turinys po vieno neaiškaus rezultato, jokių naujų teikėjo kvietimų trečiu vykdymu ir jokio pakartotinio jau priskirtų įrašų rezervavimo kitai dienai. [Ataskaita](../../tmp/school-family-qa-20260928/digest-api-sql-verification.json), [QA HTML pavyzdys](../../tmp/school-family-qa-20260928/digest-23acd357-c18b-44ce-b0f5-0d85f5604c5f.html). **Tikro Resend siuntimo nebuvo**; DB `sent` ir `qa-fake-*` yra tik šio imituojamo Demo bandymo rezultatai. Globalus cron ir neapribota auditorijos atranka nekviesti. |
| Tikros mokyklos ribos ir Demo atkūrimas | Apsaugotas pradinės kopijos / CAS skriptas atkūrė tik laikinus Demo požymius; patikra po atkūrimo rodo setup ir portal absent/null, recordings=true kaip prieš QA. [Atkūrimo ataskaita](../../tmp/school-family-qa-20260928/demo-restoration-report.json). Galutinė [postflight ataskaita](../../tmp/school-family-qa-20260928/family-postflight-report.json), 20:23 +03, ir tikrintuvas patvirtino 5 SHA, išjungtus tikros mokyklos naujus požymius, 0 nepakitusių Indrės blokavimų, atskiras savo QA tapatybes ir Demo readiness 5 / 2. [Būsena prieš atkūrimą](../../tmp/school-family-qa-20260928/family-pre-restore-postflight-report.json) išsaugota. |

## Patikros ribos

Suplanuoti šeimos, medžiagos ir konsultacijų UI scenarijai bei Demo požymių atkūrimas baigti. Sutarties / parašo įrodymo ar specialisto atšaukimo regresijos praėjo vietiniuose SQL bandymuose; jų atskiro gyvo UI scenarijaus ši ataskaita neteigia. Tikros mokyklos pilna readiness patikra neatlikta, jos portalas neįjungtas; Demo readiness 5 / 2 nėra tikros mokyklos paruošimo įrodymas.

Du IAB naršyklės atsisiuntimo įvykio laukimai baigėsi timeout. Tikras autorizuoto failo API grąžino teisingus baitus ir SHA, tačiau **nepatvirtintas naršyklės failo išsaugojimas**. Tikro Drive vaizdo peržiūra nepatikrinta: QA aplinkoje nėra reikiamų Drive kredencialų / aplankų. Grupės planų ir 30 dienų ribų logiką dengia automatiniai bandymai; fizinis Drive failų trynimas nepridėtas.

Įprastų užsiėmimų senas `sessions.tutor_comment` lieka ankstesnio neapdoroto DB stulpelio modelio dalis. Rodomumo požymių negalima laikyti atskiromis konfidencialaus stulpelio teisėmis. Konfidencialus specialisto turinys turi būti rašomas tik į naują atskirą `school_consultation_notes` lentelę, kurios RLS patikrintas; jo negalima perkelti į seną komentarą.

## Išleidimo riba

[AGENTS.md](../../AGENTS.md) nurodo: **„Nedeployink ir necommitink be aiškaus leidimo“**. Commit, push ir programos deploy neatlikti. Schemos pritaikymas ir sėkmingas build nėra programos išleidimas. Produkcijos deploy lieka neatliktas iki aiškaus vartotojo leidimo. Tikros mokyklos portalo įjungimui papildomai būtinas pilnas šeimų ir medžiagos paruošimas bei jos readiness patikra be laukiančių įrašų.
