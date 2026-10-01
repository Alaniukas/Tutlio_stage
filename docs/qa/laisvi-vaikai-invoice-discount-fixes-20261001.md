# Laisvi vaikai mėnesinių sąskaitų ir nuolaidų pataisų patikra

2026-10-01 paruoštos vietinės pataisos pagal kliento pokalbio ekrano kopijas. Mėnesinės sąskaitos peržiūra išsaugo darbo kontekstą, mokyklos Finansų mygtukas pirmiausia atidaro peržiūrą, o individualios sutarties nuolaidos priedas gali būti kuriamas ir tada, kai senas dalyko įrašas jau ištrintas. Produkcijos kodas nedeployintas, commit ir push neatlikti. Šios patikros metu tikros mokyklos duomenys nekeisti ir laiškai nesiųsti.

## Dabartinė produkcijos duomenų būsena

Tik SELECT užklausos atliktos 2026-10-01 apie 13:45–13:49 Europe/Kiev (10:45–10:49 UTC), aktyviame Supabase projekte `cuhciqwmqfuajeeqjjbm`. Organizacija: `2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17`. Laikotarpis: 2026 m. rugsėjis pagal Europe/Vilnius.

| Patikra | Dabartinis rezultatas |
| --- | --- |
| Įvykę užsiėmimų įrašai | 777 `completed`, visi turi `status_confirmed_at`. |
| Neatvykimo įrašai | 79 `no_show`, visi turi `status_confirmed_at`. |
| Atšaukti užsiėmimų įrašai | 39 `cancelled`, visi turi `cancelled_by` ir `cancelled_at`. |
| Rugsėjo mėnesinės sąskaitos | 120 `actual` sąskaitų 60 mokinių, bendra suma 2 410 €. Visos turi `invoice_email_sent_at` ir apmokestintų užsiėmimų ID. Tai DB siuntimo žyma, ne atskira laiško pristatymo į gavėjo paštą patikra. |
| Apmokestinimas iki užsakymo pradžios | 0 iš 397 sąskaitų užsiėmimų nuorodų. |
| Tas pats užsiėmimas keliose sąskaitose | 0 užsiėmimų ID su daugiau nei viena sąskaita. |
| Rugsėjo 3 d. istorija | DB išlikę 18 `completed` eilučių. Sąskaitos peržiūra jų nerodo, jeigu atitinkamos sutarties paslaugos prasideda vėliau. Istorija netrinama. |

Ekrano kopijose rodytas beveik visuotinis nepatvirtintas lankomumas neatitinka dabartinės DB būsenos. Istorinio pokalbio skaičiaus „tik 13“ priežastis vien iš dabartinių duomenų neįrodoma. Kode rasta atskira sąrašo problema: jis pašalindavo vaikus, kurių užsiėmimai jau pateko į sąskaitą arba kuriems pasirinktu laikotarpiu nėra apmokestinamos sumos. Dabar peržiūra juos išlaiko ir rodo atitinkamą būseną.

## Pataisyta elgsena

- Mokyklos Finansų mėnesinių sąskaitų veiksmas atidaro mokyklos sąskaitų peržiūrą. Sąskaita ar laiškas sukuriami tik po atskiro siuntimo veiksmo.
- Iš bendro mokėtojų sąrašo atidarius vaiko peržiūrą galima grįžti į tą patį sąrašą, išlaikant mėnesį ir apmokėjimo terminą. Po lankomumo ar apmokestinimo pakeitimo bendras sąrašas ir jo peržiūros tokenai atnaujinami.
- Iki sutarties paslaugų pradžios arba po paslaugų pabaigos esantys `outside_contract` užsiėmimai nepatenka į viešą lankomumo peržiūros atsakymą ir nėra apmokestinami. Jų DB istorija išlieka.
- Bendras laikotarpio sąrašas išlaiko visus vaikus, turinčius to laikotarpio užsiėmimų, įskaitant jau išrašytų sąskaitų ir nulinės apmokestinamos sumos atvejus. Neparuoštos sąskaitos negali būti siunčiamos.
- Grupinio užsiėmimo įvykimo įrodymai kraunami per visus DB atsakymo puslapius. Kito tos pačios grupės dalyvio patvirtintas įvykimas nepasimeta dėl atsakymo eilučių ribos.
- Bendras siuntimas atrenka tik aiškiai pateiktus vaikų ID arba vaikų ID iš peržiūros tokenų. Vėliau atsiradęs, neperžiūrėtas vaikas nepatenka į siuntimą.
- Jei po peržiūros vienas pasirinktas vaikas tampa neparuoštas siuntimui, jis grąžinamas `skipped` sąraše su priežastimi, net jei kitos sąskaitos sėkmingai išsiųstos. Aiškiai pasirinkto vaiko pasikeitęs mokėtojas taip pat pateikiamas kaip neišsiųstas atvejis.
- Individualūs užsiėmimai, nesutampantys su jokia žinoma sutarties paslauga, neapmokestinami kaip tiesioginės pamokos, jeigu pasirašyta individuali sutartis remiasi ištrintu ar trūkstamu dalyku. Jiems taikomas `contract_review`. Kita, aiškiai sutampanti galiojanti dalyko sutartis lieka apmokestinama įprastai.
- Nuolaidos priedui individualios paslaugos pagrindas yra pasirinkta pasirašyta sutartis. Trūkstami istoriniai dalyko ar mokytojo metaduomenys neturi panaikinti sutarties pasirinkimo ar priedo kūrimo galimybės. Nuolaida lieka susieta su tikslia sutartimi.

Lankomumas nenustatomas iš praėjusio laiko. Pasirašytų užsakymų kopijos neperrašomos ir dalykų ryšiai nekeičiami pagal panašius vardus.

## Individualių sutarčių duomenys kuriems reikia atskiros peržiūros

Keturi iš devynių pasirašytų individualių užsiėmimų sutarčių remiasi neegzistuojančiais `subjects` ID. Tai išlieka atskiras duomenų sutvarkymo klausimas; šios pataisos jų nepriskiria kitam dalykui automatiškai.

| Mokinys | Sutarties ID | Neegzistuojantis dalyko ID |
| --- | --- | --- |
| Granickis Tauras | `813f62ef-bfb2-4f63-ac77-cdbbe4e34319` | `94d86a49-6d41-4c28-a318-b6d534aa12cc` |
| Vitkutė Etmė | `09598450-2ec4-4ab5-b0cc-d5f35cf8f4fc` | `5879517c-05e7-4a42-b6e6-ad5039028079` |
| Petraitytė Gertrūda Liuka | `b468a641-4c16-4828-a0e7-bb5801fb1e15` | `5879517c-05e7-4a42-b6e6-ad5039028079` |
| Miliūnas Danielius | `558a6874-0562-4cb4-babf-cbc5d97a3556` | `4f3f8741-3acc-4431-bd3e-45d4c4fa4eaf` |

Tauro sutartyje užfiksuotas dalykas „Rusų kalba Tauras Granickis“, mokytoja Olga Pekorienė, 20 € už užsiėmimą, pradžia 2026-09-07. Dabartinės jo individualios serijos naudoja kitą dalyką: `2b04cfb2-8207-4f03-bdfc-42996f69323b`, „Olga Pekorienė Rusų kalba Individuali Tauras Granickis“, su tos pačios mokyklos mokytoja `0181cf71-2398-4070-9b37-84e0ed7d30b9`. Dvi ankstyvos individualios eilutės apskritai turi `subject_id = NULL`. Šie faktai paaiškina nesutampantį ryšį, tačiau savaime nėra leidimas keisti pasirašytą užsakymą ar perskaičiuoti jau išrašytas sąskaitas.

## Patikra ir likę veiksmai

| Patikra | Rezultatas |
| --- | --- |
| `school-invoice-session-review`, `school-monthly-invoice-admin`, `school-canonical-billing`, `school-extra-lessons-billing`, `school-payer-invoice-groups` | 48 testai iš 5 failų praėjo. Apima istorijos slėpimą, DB atsakymo ribą, ištrinto dalyko blokavimą, kitą galiojantį dalyką, teisingą sutarties peržiūros priežastį, jau išrašytą sąskaitą, naują neperžiūrėtą vaiką, dalinį siuntimą ir pasikeitusį mokėtoją. |
| Dialogo ir Finansų tiksliniai testai | 16 testų praėjo. Apima grįžimą iš PDF peržiūros, mėnesio / termino / slinkties išsaugojimą, naujus tokenus po pakeitimo, dalinio ir visiškai užblokuoto siuntimo klaidas, neaiškią pakeitimo baigtį ir nesėkmingą atnaujinimą po siuntimo. |
| `npm run lint` ir `npm run lint:api` | Praėjo. |
| Bendra regresijos patikra | 102 testai iš 13 failų praėjo (101 bendrame paleidime, tada papildytas ir pakartotas 12 dialogo testų rinkinys). Įtraukti individualių nuolaidų, sąskaitų API, kanoninio apmokestinimo, sutarčių laikotarpių, siuntimo, vertimų ir API ESM importų testai. |
| Naršyklė | Vietinis dialogas su netikrais duomenimis: mokėtojų sąrašas → vaiko lankomumas → sąskaitos peržiūra → grįžimas į tą patį sąrašą. Mėnuo ir terminas išliko, konsolės klaidų nėra. Visi tinklo kvietimai perimti, siuntimas išjungtas. |

Tikrų individualių sutarčių dalykų ryšiams reikia administratoriaus patvirtinto sutvarkymo. Produkcijos deployui, commitui ir push reikia vartotojo leidimo pagal projekto AGENTS.md.

## Papildoma vizualinė patikra 2026-10-01

Vietinėje naršyklėje patikrintas tikras `CompanyFinance`, `SchoolMonthlyInvoiceDialog` ir `SchoolDiscountOfferDialog` kodas su 24 netikrų mokinių duomenimis. Supabase pakeistas atminties duomenų šaltiniu, o visi API atsakymai imituoti. Tikras API serveris nepaleistas. Simuliuoti siuntimo veiksmai nėra tikri laiškai ar sąskaitos. PDF failo turinys ir produkcijos diegimas šia vizualine patikra nepatvirtinami.

| Scenarijus | Patikrintas rezultatas |
| --- | --- |
| Finansai → „Peržiūrėti mokėtojus“ | Atidaroma peržiūra; 0 API užklausų ir 0 siuntimo veiksmų iki mokėtojų sąrašo formavimo. |
| 24 vaikai ir jų mokėtojai | Rodomi broliai / seserys, jau išrašytos sąskaitos, nulinė suma, nepatvirtintas lankomumas ir sutarties peržiūros reikalaujantys vaikai. Neparuoštų mokėtojų siuntimas išjungtas. |
| Vaikas → sąskaitos peržiūra → mokėtojai | Mėnuo `2026-08`, terminas `2026-10-15` ir ankstesnė slinktis 1 584 px išliko. Grįžimas be pakeitimų nekvietė mokėtojų API pakartotinai. Tai UI būsenos testas; laikotarpių apmokestinimą tikrina API regresijos testai. |
| Rugsėjo 3 d. grupės istorija | Kai paslaugų pradžia rugsėjo 7 d., rugsėjo 3 d. eilutė nepatenka į peržiūrą. Rodomos trys tinkamo laikotarpio pamokos. Naudotas tikras `reviewSchoolInvoiceSession` helperis. |
| Nuolaidos ir sumos | Peržiūroje 3 × 20 € = 60 €; 25 % = 15 €; mokėti 45 €. Po vieno užsiėmimo išėmimo: 40 € - 10 € = 30 €. |
| Lankomumo ir apmokestinimo korekcijos | Patvirtinus lankomumą suma pasikeitė 40 → 60 €. Išėmus užsiėmimą ir grįžus į mokėtojus, vaiko suma 45 → 30 €. Sąrašas ir tokenai atnaujinami; visame šio scenarijaus žurnale 0 siuntimų. |
| Individualios sutarties nuolaida | Sutarties veiklos pavadinimas pasirinktas automatiškai, galima įvesti 25 % ir pateikti formą. Simuliuotas `create` išlaikė sutarties ID, `subjectId: null` ir `tutorId: null`. |
| Sutarties peržiūros blokavimas | Rodoma „Reikia peržiūrėti sutarties duomenis“, siuntimas išjungtas. Neteisinga lankomumo priežastis neberodoma. |
| Dalinis siuntimas | Simuliuota 1 sėkmė ir 1 praleistas atvejis. Dialogas lieka atidarytas, sąrašas atnaujinamas, klaidos priežastis matoma. |
| Nesėkmingas mokėtojų atnaujinimas | Rodoma klaida, mokėtojų eilučių nelieka, „Siųsti visiems“ išjungtas. |
| 1 366 × 900, 375 × 812, 320 × 740 | Tekstas ir valdikliai telpa. Dialogo `scrollWidth` sutampa su `clientWidth` (375 px vaizde 343 px, 320 px vaizde 290 px). Tik lentelės slenka horizontaliai; patikrinta 320 px lentelės slinktis. |
| Konsolė ir regresijos | Naršyklės klaidų nėra. Pakartotinai praėjo 24 testai iš 3 failų: sąskaitų dialogas (17), nuolaidų dialogas (3), Finansai (4). `npm run lint` ir `git diff --check` praėjo. |

Vizualinė patikra rado papildomų UI klaidų, kurios pataisytos ir pakartotinai patikrintos: telefonu visas dialogo turinys plėtėsi iki 750 px; slenkant dingdavo uždarymo mygtukas; virš lipnios antraštės matėsi turinio tarpas; ilgas mokėtojo vardas buvo suspaudžiamas šalia siuntimo mygtuko; sutarties blokavimo įspėjimas neteisingai minėjo lankomumą. Dabar dialogo tinklelis riboja turinio plotį, Back / Close yra lipnioje antraštėje, mokėtojo kortelės valdikliai telefone išdėstyti vertikaliai, o įspėjimas rodo tikrą blokavimo priežastį.

Galutines ekrano kopijas nepriklausomai peržiūrėjo antras agentas; likusių realių išdėstymo problemų patikrintuose vaizduose nerado. Pataisos tebėra vietinės, tikri Laisvi vaikai įrašai ir laiškai nekeisti.

Įrodymai saugomi `output/qa/laisvi-visual-20261001/`: `12`–`18` yra galutinės sąrašo / vaiko / peržiūros kopijos, `06`–`07` individualios nuolaidos forma, `08`–`09` klaidų scenarijai. `04`–`05` ir `10` rodo iki papildomų UI pataisų buvusias problemas. JSON žurnalai rodo tik vietines imituotas užklausas.

![Galutinė sąskaitos peržiūra su matomais Back ir Close bei nuolaidos suma](C:/Users/1olim/Downloads/Tutlio/output/qa/laisvi-visual-20261001/16-discounted-invoice-desktop-final.jpg)

![Galutinė mokėtojo kortelė telefone](C:/Users/1olim/Downloads/Tutlio/output/qa/laisvi-visual-20261001/13-payers-mobile-final.jpg)

![Sutarties peržiūros priežastis ir išjungtas siuntimas telefone](C:/Users/1olim/Downloads/Tutlio/output/qa/laisvi-visual-20261001/15-contract-preview-mobile-final.jpg)
