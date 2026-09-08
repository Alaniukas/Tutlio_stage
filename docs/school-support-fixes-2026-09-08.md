# Mokslo vaisiai / Laisvi vaikai: patikra ir lokalūs pataisymai

Produkcijoje atliktos tik skaitymo užklausos. Paskyrų, pamokų, organizacijų nustatymų ir sąskaitų duomenys nekeisti, laiškai nesiųsti. Commit ir deploy neatlikti.

## Patvirtinta produkcijoje

- Mokslo vaisiai: 8 mokinių eilutės, 1 prijungta mokinio paskyra, 4 mokiniai su tėvų ryšiu. 3 iš jų turi tik tėvų prisijungimą. Ankstesnis ženklelis tikrino `linked_user_id`, todėl tėvų registracija jo nepakeisdavo.
- Laisvi vaikai: organizacijoje dabar mokinio priminimas prieš 6 val., mokytojo išjungtas. 12 mokytojų turi 6/0 val. nustatymus, 14 likę 2/2 val. Tai esama būsena, ne prielaida apie ankstesnius 12 val. nustatymus.
- Per 2 dienų retrospektyvą: 92 pamokų eilutės, 70 be mokinio el. pašto, visos 92 su mokėtojo el. paštu ir prisijungimo nuoroda; 73 pažymėtos kaip išsiųstos mokėtojui. Šie skaičiai patys savaime neįrodo visų 19 likusių neišsiuntimo priežasties.
- `get_due_session_reminder_ids` neturėjo mokyklos / mokinio be el. pašto fallback taisyklės, nors `send-reminders` ją iš dalies turėjo.
- Laisvi vaikai turi 4 individualius dėstomus dalykus. Produkcijos CompanyContracts dialogui jų neperduodavo, o dialogas trūkstamą prop laikydavo tuščiu sąrašu.
- Aktyvi lėta Storage paieška: tarp dviejų patikrų 688 → 727 kvietimai, bendras vykdymo laikas 2 438 494 → 2 665 431 ms. Kitų didžiausių stebėtų užklausų skaitikliai nekito. Tai apkrovos įrodymas, bet ne konkrečios plano kvotos viršijimo patvirtinimas.

## Paruošti pakeitimai

1. Mokinio kortelėje atskiros mokinio ir tėvų prisijungimų būsenos. Administratorius su `students.edit` gali sukurti naują paskyrą pagal išsaugotą kontaktą. Grąžinamas vienkartinis kriptografiškai atsitiktinis laikinas slaptažodis; naujai paskyrai priskiriamas mokinys arba tėvų–mokinio ryšys. Prisijungus rodomas slaptažodžio keitimas. Esamos paskyros slaptažodis niekada neperrašomas. Vaikui be atskiro el. pašto pakanka tėvų portalo; atskiroms paskyroms reikia skirtingų el. paštų. Slaptažodžiai nerodomi iš naujo atidarius kortelę ir nesaugomi naršyklės saugyklose.
2. Individualių dalykų API, apribota administratoriaus organizacijos mokytojais. Dialogas pats užkrauna sąrašą, atskiria užkrovimą, klaidą ir tikrai tuščią sąrašą. Sutarčių kūrimas patikrina mokinio, grupės ir dalyko organizaciją.
3. Grupės redagavime kiekvienam mokiniui galima palikti visą grafiką arba pasirinkti dalį laikų. Materializatorius ir cron taiko tą patį pasirinkimą, perkuria tik pakeistų būsimų pamokų eilutes. Kuriant naują sutartį to mokinio pasirinkti laikai naudojami pradiniam grafikui. Jau priimtos sutarties kaina nekeičiama automatiškai.
4. Mokyklos priminimas siunčiamas mokiniui, jei yra jo el. paštas; kitu atveju tėvų kontaktams. DB eilės atranka ir siuntėjas suderinti. `flexible_invitations` organizacijų platesnis gavėjų srautas išlaikytas. Priminimas ir sekama prisijungimo nuoroda naudoja tą patį pamokos → dalyko → mokytojo nuorodos pasirinkimą. Jei mokyklos pamokai visur trūksta nuorodos, priminimas nežymimas kaip išsiųstas, priežastis registruojama loge.
5. Storage paieškai paruoštas `sessions ((id::text)) INCLUDE (tutor_id, student_id)` indeksas. Jis atitinka esamų prieigos taisyklių išraišką; RLS prieigos teisės nekeičiamos. Nauda produkcijos apkrovai dar neišmatuota.
6. Pakartotinė kanoninio DOCX patikra nustatė faktinių apmokamų užsiėmimų modelį. Jis įgyvendintas atpažįstamoms užšaldytoms redakcijoms, kartu su atšaukimo, nutraukimo, darbo dienų ir saugaus sąskaitų laiškų kartojimo taisyklėmis. Neaiškūs duomenys sulaikomi peržiūrai. Išsamiai: `school-monthly-billing-audit-2026-09-08.md`.

## Patikra ir įkėlimo pastabos

Naujausi rezultatai ir visos šešios būtinos migracijos pateikti [pakartotinės patikros ataskaitoje](school-support-verification-2026-09-08.md). Žemiau – ankstesnio patikros etapo įrašas; galutiniam leidimui vadovautis naujausia ataskaita.

- Pakartotinė išplėsta patikra: 21 tikslinių testų rinkinys, 105 testai sėkmingi. Išsami patikra ir likusios leidimo sąlygos: [school-support-verification-2026-09-08.md](school-support-verification-2026-09-08.md).
- Frontend ir API TypeScript sėkmingi; frontend produkcinis build sėkmingas. Liko esami bundle dydžio / sourcemap įspėjimai.
- `node scripts/test-school-support-sql.mjs`: lokalus PostgreSQL patikrino priminimų atranką, anon/authenticated draudimą vykdyti vidinį RPC, naują narystės stulpelį ir indekso naudojimo planą.
- Testai naudojo netikrus kontaktus ir mock siuntimą / Auth. Realus tėvų prisijungimas ir laiško pristatymas šiame etape netikrinti.
- Prieš publikuojant kodą būtinos lokalios migracijos `20260908080306_school_reminder_recipient_parity.sql`, `20260908080341_school_member_schedule.sql`, `20260908081019_session_storage_lookup_index.sql`, `20260908083019_admin_provisioned_student_trigger.sql`. Jos produkcijoje NEPRITAIKYTOS. Ketvirtoji apsaugo administratoriaus kuriamas paskyras nuo automatinio triggerio susiejimo pagal el. paštą prieš API tikslinį susiejimą.
- Darbinis CompanyContracts buvo senesnis nei produkcija. Atliktas trijų versijų sujungimas su išsaugotu produkcijos šaltiniu; išsaugoti lokalūs mokinio embed / PDF kelio pataisymai. Vienintelis konflikto blokas išspręstas paliekant vietinį `path` ir `pdfUrl` palaikymą. Šaltiniai / atsarginės kopijos: `tmp/school-support-review/`. Didžioji šio failo diff dalis yra jau produkcijoje buvusių funkcijų atkūrimas.
- Darbinėje direktorijoje yra kitų ankstesnių užduočių pakeitimų. Visos direktorijos negalima laikyti vien tik šios užduoties leidimu.
