# Nuolaidos priedo vizualus darbo srauto testas

Data: 2026-09-28. Tikrinta per tikrą naršyklės UI, vietinį API, Demo Mokyklos DB įrašus, privatų failų bucket ir DOCX → PDF konverterį.

## Rezultatas

Abu dokumentų patvirtinimo eiliškumai praėjo. Abu tikri priėmimo eilės darbai užbaigti: `status=completed`, `confirmation_sent=true`, `invite_sent=true`, `last_error=null`.

| Scenarijus | Tarpinė būsena | Galutinė būsena |
|---|---|---|
| A: pirmiausia 25 % priedas | Priedas patvirtintas, sutartis dar išsiųsta. Nuolaida netaikoma. | Sutartis pasirašyta ir priedas patvirtintas. Nuolaida taikoma. |
| B: pirmiausia sutartis, paskui 10 € priedas | Sutartis pasirašyta, priedas laukia. Nuolaida netaikoma. | Priedas patvirtintas per jau panaudotą pagrindinės sutarties asmeninę nuorodą. Nuolaida taikoma. |
| Priedas jau pasirašytai A sutarčiai | Administratoriaus dialogas nurodo, kad siunčiamas tik priedas. | Tikras laiško turinys turi vieną galiojantį PDF priedą ir vieną priedo patvirtinimo veiksmą. Papildomas 5 % pasiūlymas paliktas nepatvirtintas testui. |

Patikrintas visas srautas:

1. Demo administratoriaus prisijungimas ir išsiųstos sutarties meniu **Sukurti nuolaidos priedą**.
2. Grupės pasirinkimas, procentinė ir fiksuota nuolaida, tikras pasiūlymo įrašymas.
3. Tikras laiško HTML ir du PDF priedai prieš sutarties pasirašymą. Asmeninės nuorodos rodo dokumentų puslapius; laiške nėra laikinų saugyklos nuorodų.
4. A priedo patvirtinimas prieš sutartį, po to sutarties užsakymo pateikimas.
5. B sutarties užsakymo pateikimas prieš priedą. Priedas lieka matomas ir patvirtinamas PDF apdorojimo ekrane bei po sutarties pasirašymo.
6. Tikras galutinis PDF, finalizavimo RPC ir priėmimo darbinis procesas.
7. B priedo patvirtinimas naudojant `contractToken` po pagrindinės sutarties finalizavimo. Patvirtinto priedo atsisiuntimas per tėvų puslapio mygtuką pavyko.
8. Jau pasirašytos sutarties nuolaidos pasiūlymas ir vieno PDF laiškas.

Naršyklės klaidų administratoriaus, A/B sutarčių ir A/B priedų puslapiuose nerasta.

## Vaizdiniai įrodymai

### Išsiųstai sutarčiai siunčiami abu dokumentai

![Abiejų dokumentų laiškas B scenarijuje](C:/Users/1olim/Downloads/Tutlio/tmp/visual-discount-qa/screenshots/19-combined-b-email.png)

### Priedas lieka matomas apdorojant sutartį

![B sutartis apdorojama, priedas dar laukia](C:/Users/1olim/Downloads/Tutlio/tmp/visual-discount-qa/screenshots/12-main-b-processing-pending-annex.png)

### Abu dokumentai patvirtinti

![A sutartis ir 25 procentų priedas patvirtinti](C:/Users/1olim/Downloads/Tutlio/tmp/visual-discount-qa/screenshots/10-main-a-signed-annex-accepted.png)

![B sutartis ir 10 eurų priedas patvirtinti](C:/Users/1olim/Downloads/Tutlio/tmp/visual-discount-qa/screenshots/16-main-b-signed-annex-accepted.png)

Papildomi dialogų, tarpinių būsenų ir vieno priedo laiško vaizdai saugomi `tmp/visual-discount-qa/screenshots/`.

## Tikri duomenų ir dokumentų patikrinimai

Naudoti tik du nauji fiktyvūs mokiniai, viena nauja grupė ir dvi naujos sutartys Demo Mokykloje (`c3a00000-7e57-4000-8000-000000000001`). Sutartys ir paslauga aiškiai pažymėtos kaip testinės, paslaugos neteikiamos. Kitų organizacijų įrašai nekeisti.

- A sutartis: `PP-NUOLAIDA-QA-2809-A`; B sutartis: `PP-NUOLAIDA-QA-2809-B`.
- Pasirašytos sutartys turi tikrą `accepted_at`, priimtas sąlygas, 64 simbolių SHA ir išsaugotą galutinį PDF.
- A priedo įrodymuose pagrindinė sutartis patvirtinimo metu dar nepriimta; B priedo įrodymuose ji jau priimta. Abiejų priedų įrodymų versija `2026-09-28-v2`.
- Tikri A/B pasiūlymų PDF ir galutiniai PDF renderinti ir vizualiai peržiūrėti. Sutartys turi po 7 puslapius, nuolaidos priedai po 1. Nukirsto teksto, persidengimų ar sugadintų ženklų nerasta.
- A galutinis PDF sutampa su tikru užfiksuoto patvirtinimo laiško priedu. Abiejų galutinių sutarčių akcepto laikas sutampa su išsaugotais duomenimis.
- B patvirtintas priedas realiai atsisiųstas per viešą puslapį: 20 893 baitai, vienas puslapis, statusas **PRIEDAS PATVIRTINTAS**, akceptas 2026-09-28 19:12:17 (Vilnius).

Nuolaidų skaičiavimas tikrintas be sąskaitų kūrimo, naudojant produkcinę skaičiavimo funkciją ir tikrai materializuotos vienos pamokos duomenis:

| Scenarijus | Iki abiejų patvirtinimų | Po abiejų patvirtinimų |
|---|---|---|
| A, 25 % | 12 € | 12 € − 3 € = 9 € |
| B, 10 € | 12 € | 12 € − 10 € = 2 € |

Atskirai apskaičiuotas keturių pamokų mėnesio pavyzdys pagal gyvus sutarties duomenis: 48 € → 36 € (A), 48 € → 38 € (B). Tai pavyzdinis skaičiavimas, ne DB įrašyta sąskaita.

QA grupės pradinis minimalus dalyvių skaičius 3 teisėtai sustabdė A paslaugą po pirmos sutarties. Per tikrą lokalų grupės API tik šiai naujai QA grupei nustatyta 2. Po antros sutarties natyvi taisyklė atnaujino grupę ir abi testines pamokas. Rankinis paslaugų atnaujinimas nenaudotas.

## Vizualiame teste rasti ir pataisyti defektai

### Per anksti įrašyta akcepto data nepatvirtintame PDF

Pasiūlymo PDF turėjo paruošimo laiką akcepto datos lauke. Pataisyti `extraLessonsContractShared.ts` ir `extraLessonsPdf.ts`: data pildoma tik po aiškaus sąlygų priėmimo. Tikras naujas B pasiūlymas rodo `—`, pasirašyti A/B dokumentai išlaiko tikrą priėmimo laiką.

### Pirmas patvirtinimo laiškas grąžino 503 dėl laikrodžių skirtumo

Tikroje DB naujo siuntimo rezervacijos laikas buvo bent 288 ms vėlesnis už Node serverio laiką. `schoolAcceptanceDelivery.ts` laikė bet kokį neigiamą amžių neaiškiu rezultatu ir sustabdė siuntimą prieš el. pašto tiekėją.

Pridėta 60 sekundžių tolerancija šiam laikrodžių skirtumui. Netaisyklinga data, didesnis ateities laikas ir 23 valandų pakartotinio siuntimo riba išlieka tikrinami. Abu tikri darbiniai procesai po pataisos užbaigti, patvirtinimo ir pirmos pamokos laiškai paruošti.

## Automatinė patikra po pataisų

- 17 nuolaidų / PDF srauto testų failų: **106 testai praėjo**.
- `school-acceptance-delivery.test.ts`: **10 testų praėjo**, įskaitant 288 ms ir 60 s skirtumą, didesnio skirtumo atmetimą, netaisyklingą datą, 23 h ribą ir pakartotinio siuntimo saugumą.
- Iš viso šiose patikrose: **116 testų, 18 failų**.
- `npm run lint`: praėjo.
- `npm run lint:api`: praėjo.
- Šio vizualaus testo pataisų `git diff --check`: praėjo.

## Testo ribos

- El. pašto tiekėjo transportas perimtas tik po tikro laiško HTML ir PDF priedų paruošimo. Užfiksuoti tikri tiekėjui siunčiami duomenys; išoriniai laiškai nesiųsti. Gavimas tikroje pašto dėžutėje šiame teste nepatikrintas.
- Tikras `enqueue_school_acceptance` SQL kvietimas šiame vizualiame teste pakeistas tokiu pačiu realiu eilės įrašu, kurio `available_at` perkeltas 7 dienoms. Tai neleido produkcijos cron paimti QA darbo. Priėmimo handleris, įrodymų užšaldymas, saugykla, finalizavimo RPC ir darbinio proceso šaltinis vykdyti tikri. Bendras eilės darbų paėmimo RPC nekviestas.
- PDF maketai patikrinti renderinant tikrus failus ir atsisiunčiant priedą. Integruoto PDF `iframe` atvaizdavimas Codex naršyklėje atskirai nepatvirtintas.
- Sąskaitos ir Stripe mokėjimai nekuriami. Nuolaidų skaičiavimas patikrintas tik skaitant duomenis.
- Commit, push ir deploy neatlikti.

## Testinių įrašų išjungimas

Baigus vaizdinę patikrą išjungti tik šio testo nauji įrašai: 2 sutartys archyvuotos ir jų paslaugos sustabdytos, grupė sustabdyta, 2 būsimos QA pamokos atšauktos ir paslėptos, 2 nauji mokiniai atskirti, nepatvirtintas 5 % pasiūlymas atšauktas. Pakeitimai atkuriami, ankstesni laukai išsaugoti lokaliai.

Galutinė patikra 2026-09-28 19:21:31 (Vilnius) praėjo: 0 aktyvių būsimų QA pamokų, 0 sąskaitų, 0 nebaigtų eilės darbų, 0 nepatvirtintų pasiūlymų. Abiejų pasirašytų sutarčių ir abiejų patvirtintų priedų statusai, akcepto datos, SHA ir PDF keliai nepakito. Įrašai netrinti, išjungiant pranešimai nesiųsti. Įrodymas: `tmp/discount-visual-qa-states/retirement-final-verified.json`.

## Nevieši lokalūs įrodymai

`tmp/visual-discount-qa/captures/` saugo tikrus HTML, PDF, tiekėjo duomenis ir darbų rezultatų santraukas. `tmp/discount-visual-qa-states/` saugo DB būsenų bei nuolaidų skaičiavimo santraukas. PDF peržiūrų ataskaitos yra `tmp/visual-discount-qa/pdf-review/`.

Šie failai ignoruojami Git. Žali laiškų duomenys turi asmenines testinių dokumentų nuorodas, todėl jų nepridėti prie viešo PR.
