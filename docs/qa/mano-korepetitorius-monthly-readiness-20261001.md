# Mano korepetitoriaus mėnesinių sąskaitų patikra 2026 10 01

Rugsėjo sąskaitų siuntimą galima ruošti po šiame patikrinime parengtų kodo pataisų publikavimo ir šešių nebaigtų pamokų peržiūros. Produkcijos organizacijai jau įjungtas `org_payer_fee_split`. Nustatymų lango ir sąskaitų siuntimo pataisos yra lokaliame kode; produkcija dar nepublikuota.

## Produkcijos pasirengimas

Organizacijoje įjungtos mėnesinės sąskaitos, išjungtas apmokėjimas po vieną pamoką, užpildyti privalomi MB sąskaitų rekvizitai ir nustatyta serija `MK`. Stripe paskyros kortelių mokėjimai ir išmokos aktyvūs; privalomų papildomų rekvizitų nėra. Šios Stripe ir sąskaitų būsenos buvo tik perskaitytos.

Flagas pakeistas iš nenustatyto į `true`; patvirtinta, kad kiti organizacijos feature nustatymai nepakeisti. `payer_fee_split` konfigūracija dar nenustatyta, todėl galioja numatytoji mokėtojo dalis: po 100 % platformos, Stripe procentinio ir Stripe fiksuoto mokesčių. Norimas dalis administratorius turi išsaugoti prieš generuodamas sąskaitas. Jau atidarytas Stripe Checkout išlaiko ankstesnę sumą.

Rugsėjo duomenų patikroje rasta 92 baigtos, neapmokėtos, nepaketinės pamokos už **2 495,50 €**, priklausančios 35 mokiniams ir 8 korepetitoriams. Mokėtojų adresų netrūksta; nėra nulinių ar neigiamų kainų. Pagal esamą modelį tai 35 mokėjimo užklausos, grupuojamos pagal mokėtoją ir korepetitorių.

Dar 6 pamokos už **155 €** turi `active` būseną, nors jų laikas rugsėjį jau pasibaigė. Jų baigties negalima nustatyti iš vien laiko, todėl tikros pamokos automatiškai neperrašytos. Administracija turi patvirtinti rezultatą prieš siųsdama mėnesio sąskaitas. Laikai lentelėje yra Lietuvos laiku.

| Data | Pradžia | Pabaiga | Kaina |
| --- | --- | --- | --- |
| 2026-09-01 | 18:00 | 19:00 | 28 € |
| 2026-09-01 | 19:00 | 20:00 | 28 € |
| 2026-09-07 | 18:00 | 19:00 | 28 € |
| 2026-09-09 | 14:00 | 15:00 | 15 € |
| 2026-09-10 | 16:30 | 17:30 | 28 € |
| 2026-09-10 | 17:30 | 18:30 | 28 € |

## Parengtos pataisos

- Mokesčių paskirstymo valdikliai prieinami kiekvienai organizacijai su `org_payer_fee_split`, įskaitant Mano korepetitorių. Anksčiau UI papildomai tikrino tik Mokslo vaisių organizacijos ID.
- Šeimos mokėjimo laiške pridedami visi atskirai vaikams išrašyti S.F. PDF. Nepilnas šeimos PDF rinkinys blokuoja siuntimą ir pakartotinį siuntimą.
- Nepavykęs Stripe, pamokų susiejimas, PDF arba laiškas grąžina aiškią mokėtojo klaidą. Dalinis siuntimas neberodomas kaip visiška sėkmė. UI skaičiuoja išsiųstas mokėjimo užklausas ir prieš kartojimą reikalauja naujos peržiūros.
- Nesukurta mokėjimo užklausa atlaisvina pamokas kartojimui. Jei teisinė sąskaita jau išrašyta, ji išlieka sąraše taisymui arba laiško pakartojimui. Organizacijai nebekuriama nepilna atsarginė `BB-*` sąskaita, kai nepavyko teisinės S.F. generavimas.
- Priminimo sumos naudoja sąskaitos pamokų kainų snapshot ir teisingą Stripe mokėjimo sumą. Dar atidaryto Checkout atveju laiškas nurodo būtent to Checkout sumą.
- Mokinio sąskaitos peržiūra atitinka API: tik pasibaigusios `completed` arba `no_show` pamokos, neapmokėtos, nemokamomis nepažymėtos ir dar nepriskirtos paketui ar sąskaitai.

## Bandymų rezultatai ir ribos

Galutinis tikslinių regresinių testų rinkinys: **113 testų, 21 failas, visi praėjo**. `npm run lint`, `npm run lint:api`, `npm run build` ir `git diff --check` praėjo. Build pateikė įprastus sourcemap ir didelių bundle dydžių perspėjimus.

Atskira testinė Supabase aplinka `foinlxldehhbcwcbnndd` nepasiekiama: jos DNS vardas nerandamas, o Supabase projekto patikra grąžino `Project not found`. Todėl pilnas bandymas toje cloud testinėje DB nebuvo atliktas. Vietoje jos naudota izoliuota atminties DB ir Storage imitacija, tikri programos API handleriai, tikras PDF generatorius bei tikras Stripe testinis Connect.

| Mokėtojo dalis visiems trims mokesčiams | Pamokų suma | Stripe testinio Checkout suma |
| --- | --- | --- |
| 100 % | 70,00 € | 73,00 € |
| 50 % | 70,00 € | 71,48 € |
| 0 % | 70,00 € | 70,00 € |

Visais trimis atvejais PDF ir laiško turinys atitiko sąskaitą. Patikrintas tų pačių pamokų pakartotinio įtraukimo blokavimas, stabilios mokėjimo nuorodos naudojimas ir pasibaigusio Checkout atnaujinimas, neapmokėto Stripe patvirtinimo atmetimas, rankinio apmokėjimo sinchronizacija bei kartotinio patvirtinimo nedubliavimas.

Papildomai Stripe testinis Checkout už **71,48 €** apmokėtas naršyklėje testine kortele. Tikras mokėjimo patvirtinimo handleris pažymėjo mokėjimo užklausą, visas jos pamokas ir S.F. apmokėtomis bei įrašė mokesčių apskaitą. Kartotinis patvirtinimas nedubliavo įrašų. Tikrinant PDF vizualiai tekstas, lietuviškos raidės, sumos ir išdėstymas buvo tvarkingi.

Papildomas šeimos scenarijus su dviem vaikais sugeneravo du atskirus teisingus PDF už 30 € ir 40 €, abu pridėti vienam mokėtojui. Vietinis webhook patikrinimas su tikro testinio apmokėjimo duomenimis atmetė neteisingą parašą, o teisingai pasirašytas įvykis sinchronizavo apmokėjimą ir mokesčių apskaitą. Pakartotas įvykis nedubliavo patvirtinimo laiškų. Iš viso praėjo šeši atskiri integraciniai scenarijai; tikrinant naršyklę patvirtinta numatyta grįžimo nuoroda, tačiau frontend sėkmės puslapis nebandytas, nes lokali svetainė nebuvo paleista.

Sintetinių duomenų [PDF pavyzdys](../../output/pdf/mano-korepetitorius-monthly-test-20261001.pdf) ir [integracinės patikros rezultatai](../../tmp/_mano-smoke-results.json) išsaugoti lokaliame projekte. Laikini bandymų failai į Git netraukiami.

Laiškai per bandymus buvo perimti, tikriems klientams nesiųsti. Tikros produkcijos sąskaitos, pamokų būsenos ir mokėjimai nepakeisti. Esama mėnesinių mokesčių aritmetika išlaikyta: standartinė organizacija sumuoja kiekvienos pamokos mokesčius, įskaitant fiksuotą dalį ir centų apvalinimą.

## Veiksmai prieš siuntimą

2026-10-01 vartotojo prašymu organizacijai suteikta dar viena licencija: `tutor_license_count` padidintas nuo 8 iki 9. Naudojamos 8, viena laisva. Kiti feature nustatymai ir korepetitorių limitas nepakeisti. Organizacija neturi automatinės Stripe licencijų prenumeratos ar nustatyto `platform_monthly_fee_eur`, todėl šis suteikimas papildomo automatinio mokesčio nesukūrė.

Prognozuojami Tutlio komisiniai nuo 92 rugsėjo pamokų už 2 495,50 € yra **49,91 €**, taikant esamą 2 % application fee ir kiekvienos pamokos centų apvalinimą. Jei šešios pamokos už 155 € bus patvirtintos kaip apmokestinamos, prognozė padidės 3,10 € iki **53,01 €**. Šios pamokos dar neapmokėtos; Tutlio komisiniai gaunami tik jas sėkmingai apmokėjus per Stripe. Stripe procesoriaus mokestis nėra Tutlio komisiniai.

1. Gavus vartotojo leidimą commitinti šias pataisas `simo-local`, patikrinti švarų darbinį aplanką, pushinti į `origin/simo-local` ir publikuoti produkciją pagal `AGENTS.md`.
2. Finansų puslapyje išsaugoti norimas mokėtojo ir organizacijos mokesčių dalis.
3. Patvirtinti šešių lentelėje nurodytų pamokų baigtį ir atnaujinti rugsėjo sąskaitų peržiūrą.
4. Administracijai paleisti sąskaitų siuntimą ir tikrinti galimus atskirų mokėtojų siuntimo rezultatus.
