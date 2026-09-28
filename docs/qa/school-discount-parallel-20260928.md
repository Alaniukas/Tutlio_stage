# Nuolaidos priedas prieš užsiėmimų sutarties patvirtinimą

## Pakeistas srautas

- `/school/contracts` → išsiųsta papildomų užsiėmimų sutartis → **Daugiau veiksmų** → **Sukurti nuolaidos priedą**.
- Nuolaidos pasiūlymo PDF paruošiamas iš karto. Jis pažymėtas kaip nepatvirtintas pasiūlymas ir neturi išgalvotų patvirtinimo duomenų.
- **Išsaugoti ir siųsti sutartį su priedu** siunčia vieną laišką su dviem PDF priedais ir dviem asmeninėmis patvirtinimo nuorodomis.
- Tėvai gali patvirtinti dokumentus bet kuria tvarka. Nuolaida taikoma tik patvirtinus užsiėmimų sutartį ir nuolaidos priedą, priedo galiojimo laikotarpiu.
- Pagrindinės sutarties nuorodoje priedas matomas prieš pateikiant užsakymą, ruošiant galutinį PDF ir po sutarties patvirtinimo.
- Jau patvirtintai sutarčiai siunčiamas nuolaidos priedas su jo PDF; pagrindinės sutarties pakartotinai patvirtinti nereikia.
- Jei naujo PDF paruošti arba atsisiųsti laiškui nepavyksta, ankstesnis laukiantis pasiūlymas lieka galiojantis ir naujas laiškas nesiunčiamas.

Naujos DB migracijos nereikia. Naudojami esami `school_discount_agreements`, `school_contract_completion_tokens` ir privataus `school-contracts` bucket įrašai. Organizacijos ir funkcijos prieigos ribos išlieka tokios pat.

## Lokali automatinė patikra

Testai naudoja imituojamą DB, saugyklą ir el. paštą. Patikrinta:

- išsiųstos ir patvirtintos sutarties nuolaidos srautai;
- grupės be dalyko ir individualios sutarties užsiėmimas dar nesukūrus pamokų;
- vienas laiškas su abiem PDF ir ilgiau galiojančiomis asmeninėmis nuorodomis;
- abu dokumentų patvirtinimo eiliškumai;
- prieigos ribojimas pagal sutartį, mokinį ir organizaciją;
- negaliojantys, pakeisti, archyvuoti, nutraukti ir atšaukti pasiūlymai;
- pasibaigusios pagrindinės sutarties nuorodos atnaujinimas;
- vienalaikio patvirtinimo metu išsaugomas vienas galutinis priedas;
- dokumentų paruošimo nesėkmė išsaugo ankstesnį pasiūlymą;
- esamos sąskaitų nuolaidų taisyklės ir Node ESM importai.

Pasiūlymo ir patvirtinto priedo PDF maketai peržiūrėti su ilgu užsiėmimo pavadinimu ir 500 simbolių pastaba.

Galutinė patikra: **15 testų failų, 89 testai praėjo**. `npm run lint` taip pat praėjo; užduoties failų `git diff --check` klaidų nerado.

`npm run lint:api` paskutinėje patikroje nepraėjo dėl kitų darbo aplanko pakeitimų:

- `api/_lib/mvProvisionFamilyAccounts.ts:420` - `school_family_portal` skaitomas iš `unknown` tipo.
- `api/_lib/schoolRecordingSlotAccess.ts:60-64` - Supabase select rezultato `ParserError` tipas.

Nuolaidos srauto failuose TypeScript klaidų nerasta. Šie nesusiję failai šios užduoties metu netaisyti.

## Rankinis QA prieš publikavimą

Naudoti tik **Demo Mokyklą**. Pradinės automatinės patikros metu tikri laiškai nesiųsti ir produkcijos duomenys nekeisti.

2026-09-28 papildomai atliktas tikras naršyklės darbo srauto testas su naujais fiktyviais Demo Mokyklos įrašais. Abu patvirtinimo eiliškumai ir jau pasirašytos sutarties priedas patikrinti. Tikri laiškai paruošti ir perimti lokaliai; gavimas pašto dėžutėje netikrintas. Rasti ir pataisyti pasiūlymo PDF akcepto datos bei laikrodžių skirtumo defektai. Naujausia patikra: 116 testų, frontend ir API TypeScript praėjo. Išsami ataskaita: [vizualus darbo srauto testas](./school-discount-visual-workflow-20260928.md).

1. Pasirinkti išsiųstą, dar nepatvirtintą papildomų užsiėmimų sutartį, kurios PDF paruoštas.
2. Atidaryti **Sukurti nuolaidos priedą**, įrašyti 25 % nuolaidą bei jos galiojimo datas ir išsiųsti.
3. Demo mokėtojo pašte patikrinti vieną laišką: du PDF priedai ir dvi asmeninės nuorodos. Abu PDF turi atsidaryti prieš patvirtinimą.
4. Patvirtinti nuolaidos priedą pirmiausia. Tėvų ekrane turi likti priminimas ir nuoroda patvirtinti užsiėmimų sutartį.
5. Atidaryti pagrindinės sutarties nuorodą, patikrinti matomą patvirtintos nuolaidos priedą ir pateikti užsakymą.
6. Kitoje Demo sutartyje pakartoti priešinga tvarka: pirmiausia pateikti pagrindinės sutarties užsakymą. Nuolaidos patvirtinimas turi būti prieinamas ir galutinio PDF ruošimo ekrane.
7. Jau patvirtintoje sutartyje patikrinti įprastą nuolaidos pasiūlymą: papildomai pagrindinės sutarties patvirtinti neprašoma.

Commit ir publikavimas reikalauja atskiro vartotojo leidimo.
