# Mokyklos mėnesinių sąskaitų patikra, 2026-09-08

Patikrintas vietinis kodas, kanoninio docs/legal/extra-lessons-laisvi-vaikai.docx XML ir src/lib/extraLessonsLegalBody.ts. Produkcijos duomenys nekeisti, sąskaitos ir laiškai negeneruoti.

## Sutarties taisyklės ir skaičiavimas

DOCX ir teksto kopija sutampa: §2 ir §5.1 nustato faktinių apmokamų užsiėmimų skaičių × vieneto kainą. §4.3: mokinys moka ir nedalyvavęs grupėje, jeigu užsiėmimas faktiškai įvyko ir vieta rezervuota. §4.4: individualus atšaukimas bent prieš 24 val. nemokamas, vėlesnis apmokamas. §4.5: dėl mokytojo / teikėjo neįvykęs užsiėmimas nemokamas. §6.5 / §7.3: nutraukus mokama tik už iki tol suteiktas paslaugas. §5.2: terminas – penkios darbo dienos nuo išrašymo.

- Kanoninių organizacijų sutartys atpažįstamos pagal užšaldytą filled_body su konkrečiomis kainos ir atšaukimo sąlygomis; joms taikomas faktinis modelis. Nežinoma redakcija sulaikoma. Kitų organizacijų individualūs šablonai išlaiko ankstesnį bazinio kiekio modelį.
- Grupės ir individualūs dalykai atskiriami pagal paslaugą bei organizaciją. Persidengiančios tos pačios paslaugos sutartys sulaikomos; nuosekliai viena kitą pakeičiančios atskiriamos pagal galiojimą.
- Kanoninės sutarties bazinis kiekis yra orientyras, ne minimalus mokestis. Mažesnis mokinio schedule_slots pogrupis reiškia mažiau jam sukurtų / rezervuotų ir apmokestinamų eilučių.
- Įvykimo įrodymas: completed arba mokinio no_show su mokytojo prisijungimu ar aiškiu statuso patvirtinimu. Grupei tinka kito mokinio eilutės įrodymas tai pačiai grupei ir pradžios laikui. Vien automatinis completed po laiko pabaigos nepakanka.
- Individualiems mokinio atšaukimams naudojami cancelled_by ir tikslus cancelled_at. Mokytojo atšaukimas ir tutor_no_show nemokami.
- Neaiškūs statusai, trūkstamas atšaukimo laikas, atšaukta grupės vieta be įvykimo įrodymo, trūkstamos suplanuotų paslaugų eilutės, jau apmokėtos / paketo pamokos ir užsiėmimo viduryje gautas nutraukimas sulaiko visą sutarties mėnesio sąskaitą.
- Prieš sutarties priėmimą, prieš 14 dienų vartus ir po nutraukimo paslaugos nepriskiriamos. Nutrauktos kanoninės sutartys įtraukiamos už ankstesnį galiojusį laikotarpį. Taikomos Vilniaus mėnesio ribos ir penkių darbo dienų terminas, įskaitant Lietuvos šventes.
- Sąskaitoje išsaugomi billing_model ir billed_session_ids. Senos fiksuoto modelio kanoninės sąskaitos automatiškai nekeičiamos ir nebesiunčiamos: reikia apskaitos peržiūros.
- Sąrašai puslapiuojami. Grupė vieno vykdymo metu skaitoma vieną kartą visiems jos mokiniams. Skaitymo / įrašymo klaidos grąžina nesėkmingą vykdymą. Po 240 s grąžinamas aiškus tęstinumo poreikis.

## Saugus laiškų kartojimas

Migracija 20260908085040_school_monthly_invoice_delivery.sql prideda serverio school_monthly_invoice_deliveries lentelę: RLS, jokių anon / authenticated teisių. Prieš siuntimą saugomas galutinis sugeneruotas Resend turinys. Kartojamas tik tas pats turinys ir school-monthly-invoice/<invoiceId> raktas. Administratorius negali pakeisti privilegijuoto siuntimo turinio.

Resend deduplikacija galioja 24 val., todėl automatinis neaiškaus rezultato kartojimas ribojamas 23 val. Po šio lango reikia tikrinti faktinį pristatymą. Tiekėjo sėkmė išsaugoma prieš sąskaitos žymą: žymos klaida pataisoma nesiunčiant laiško dar kartą. Istorinės sąskaitos be žymos migracijoje pažymimos peržiūrai, nes senasis kelias neturėjo deduplikacijos.

retry-school-monthly-invoice-emails kartoja saugius siuntimus nekuriant sąskaitų iš naujo. Nepatvirtintas siuntimas grąžina 503, peržiūra – 409. Kliento siuntimo raktai nepriimami. Senos kanoninės fiksuoto modelio sąskaitos blokuojamos ir šiame kelyje.

Šaltiniai: https://resend.com/docs/dashboard/emails/idempotency-keys ir Darbo kodekso 123 straipsnis https://e-seimas.lrs.lt/portal/legalAct/lt/TAD/10c6bfd07bd511e6a0f68fd135e6f40c/asr.

## Patikra ir likę veiksmai

46 testai sėkmingi aštuoniuose billing / outbox / laiškų / puslapiavimo rinkiniuose; npm run lint:api sėkmingas. node scripts/test-school-invoice-delivery-sql.mjs sėkmingai įvykdė tikrą migraciją izoliuotame PGlite PostgreSQL: istorinių siuntimų peržiūra, RLS, klientams draudžiamas turinio skaitymas / keitimas, unikalus siuntimo įrašas, patvirtinimo saugojimas, FK kaskada.

Prieš paleidimą būtina pritaikyti migraciją ir peržiūrėti realius duomenis: nežinomas sutarčių redakcijas, nepatvirtintus statusus, senas fiksuotas sąskaitas ir neaiškius istorinius siuntimus. Kelios to paties dalyko sutartys vienu metu reikalauja aiškaus pamokos–sutarties ryšio arba patikslinimo. Nutraukimo užsiėmimo viduryje dalinis atsiskaitymas automatiškai nespėjamas.

Papildomai: read-only patikra nustatė vieną teisėtą senesnę grupinę redakciją su individualaus atšaukimo sąlyga netaikoma. Ji atpažįstama tik esant grupės tipui užšaldytame užsakyme ir sutampančioms faktinio grupinio apmokestinimo sąlygoms. billing cron palaiko dryRun=true, organizationId ir tik sausam vykdymui periodStart / periodEnd (vienas prasidėjęs mėnuo, pradžia 1 dieną, pabaiga ne vėliau nei šiandien). Sausas vykdymas nerašo sąskaitų ir nesiunčia laiškų; autentifikacija privaloma.

