# PRO klasė: kainodara, komentarai ir sąskaitos

2026-09-07. PRO klasės pakeitimai ir migracijos įdiegti. Galutinio bendro leidimo, optimizavimo ir mokyklos atnaujinimų patikra: [naudojimo auditas](usage-optimization-audit-2026-09-07.md).

## Elgsena

- Mokinio kortelėje pasirinktas rankinis savaitinių pamokų dažnis turi prioritetą prieš vienos naujos pasikartojančios pamokos grafiką. Rezervavimas iš mokinio kortelės taip pat užkrauna dinaminės kainodaros taisykles. Individuali dalyko kaina išlieka aukštesnio prioriteto.
- Tos pačios šeimos skirtingi vaikai išlieka atskiri mokiniai. Šeimos susitarimą administratorius gali pritaikyti pasirinkdamas dažnį kiekvienam vaikui arba individualią kainą. Automatinis brolių / seserų pamokų sumavimas nepridėtas.
- Administratoriaus komentaras išsaugomas visuose atidarytos mokinio kortelės susietuose korepetitorių įrašuose. Naujam PRO klasės komentarui pagal nutylėjimą įjungtas matomumas korepetitoriui; esamo privataus komentaro matomumas nekeičiamas.
- Korepetitoriaus dėstymo pastaba matoma sąraše ir laiko paieškos rezultatuose. Ilgas tekstas persikelia į kitą eilutę. Nepavykus išsaugoti profilio, dialogas neuždaromas kaip sėkmingai išsaugotas.
- Sąskaitų sąraše yra atskiri klientų ir korepetitorių CSV. Taikomi sąrašo filtrai. Užkraunami visi rezultatų puslapiai, ne tik pirmas tūkstantis. CSV yra UTF-8 su BOM, kabutėmis, kabliataškio skirtuku ir apsauga nuo formulių vykdymo.
- Apmokėta bandomoji PRO klasės pamoka gauna organizacijos SF: tiesioginis Stripe pamokos mokėjimas ir bandomosios vienos pamokos paketas. Paketo rankinio mokėjimo patvirtinimas naudoja tą patį kelią. SF ir eilutė kuriamos atominiu SQL kvietimu, PDF saugomas `invoices` saugykloje ir prisegamas mokėtojui siunčiamame laiške. Pakartotiniai kvietimai naudoja tą pačią SF ir išsaugotus PDF baitus.

## Patikra

- 41 testas / 11 failų: kainodara, individualios kainos prioritetas, mokinio kortelė, korepetitorių paieška, paketų mokėjimai, SF eksportų atskyrimas, filtrai ir 1001 SF eksportas.
- Po galutinės PDF pakartojimo pataisos: papildomai pakartoti 12 testų / 2 failai, visi praėjo.
- `npm run lint`: praėjo.
- `npm run lint:api`: pradinės tipų klaidos `api/school-contract-complete.ts` ir `api/school-homework.ts` pataisytos; galutinio leidimo patikra praėjo.
- Vietinis PostgreSQL vykdiklis PGlite: migracija įvykdyta; pakartotiniai kvietimai nesudubliuoja SF / eilutės / numerio; neapmokėtos, netinkamos organizacijos pamokos atmetamos; `anon` ir `authenticated` negali kviesti SF išrašymo funkcijos. Patikrintas ir bandomosios paketo SF susiejimas.
- Tikri React puslapiai izoliuotoje Vite aplinkoje: mokinio kortelėje pasirinktas 2 k./sav. dažnis, išsaugojimas abiem korepetitorių įrašams, kortelės pakartotinis atidarymas, bendro komentaro išsaugojimas ir matomumas korepetitoriaus puslapyje. Patikrinti sąskaitų ir korepetitorių sąrašai kompiuterio bei telefono pločio languose.
- Naršyklėje paspaudus CSV mygtukus patikrintas sugeneruotas Blob turinys: klientų faile tik PK-001, korepetitorių faile tik RT-001. Automatizuota naršyklė atšaukė fizinį atsisiuntimą į diską, todėl šis paskutinis žingsnis nepatvirtintas.
- Testų el. pašto ir Stripe išoriniai kvietimai imituoti. Tikri klientų laiškai nesiųsti, tikri mokėjimai neatlikti. Gavus leidimą diegti atliktas tik skaitomas DB auditas ir pritaikytos patikrintos schemos migracijos.

## Pakartojimas

```powershell
npx --no-install vite --config tests/browser/proklase/vite.config.ts
# http://127.0.0.1:3017/?view=students
# ?view=tutors, ?view=invoices, ?view=tutor-students

npm install --prefix tmp/proklase-sql --no-save --package-lock=false @electric-sql/pglite@0.3.14
node scripts/test-proklase-trial-invoice-sql.mjs
```

Naršyklės testų aplinka naudoja tik testinius duomenis; mokinio pakeitimus laiko vietiniame `proklase-qa-students` localStorage rakte. Failai nėra prijungti prie produkcinio App maršrutų ar build įėjimo.

Pritaikytos migracijos `20260907215717_proklase_paid_trial_invoice.sql` ir `20260907215738_payment_invoice_query_indexes.sql`. SF srautui naudojami organizacijos `invoice_profiles` rekvizitai ir Resend konfigūracija. Tikras apmokėjimas su pristatymu į el. pašto dėžutę bei fizinis CSV failo išsaugojimas šiame QA nebuvo vykdyti.
