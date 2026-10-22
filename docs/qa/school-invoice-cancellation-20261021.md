# Mokyklos testinės sąskaitos panaikinimas

`/school/finance?tab=invoices` → „Sąskaitos“: neapmokėta mokėtojo sąskaita turi šiukšlinės veiksmą „Panaikinti sąskaitą“. Reikia `finance.edit`, priežasties (3–1000 simbolių) ir patvirtinimo. Galima tvarkyti ir istorines sąskaitas, kai naujų sąskaitų išrašymas išjungtas.

- Sąskaita pažymima `cancelled`. Numeris, suma, PDF, eilutės ir pamokos išsaugomi. Istorijoje rodoma panaikinimo priežastis; DB saugo veiksmą atlikusį administratorių ir laiką. Pakartotinis prašymas ankstesnės priežasties nekeičia.
- Apmokėta sąskaita nepanaikinama. Jei yra Stripe Checkout, pirmiausia tikrinama jo tapatybė ir mokėjimo būsena, o atviras mokėjimas uždaromas. Nepavykus patikrinti / uždaryti, panaikinimas nevykdomas.
- Pakeitimas įrašomas tik kol sąskaita vis dar neapmokėta ir Checkout ID nepasikeitė. Esamas DB trigeris toje pačioje operacijoje atlaisvina rezervuotą permoką.
- Panaikinta sąskaita nepatenka į mokėtinų sąskaitų ar skolos skaičius. Jos el. pašto mokėjimo nuoroda rodo, kad sąskaita nebegalioja; laiškų retry jos nebesiunčia. Pavėluotas mokėjimo patvirtinimas jos nebeaktyvuoja.
- Įprastas masinis PDF / ZIP atsisiuntimas panaikintų sąskaitų neįtraukia. Istorijoje originalų dokumentą galima atsisiųsti atskirai arba sąmoningai pasirinkus būsenos filtrą „Atšaukta“. Tas pats numeris iš naujo nenaudojamas.

## Leidimas

Prieš kartu leidžiant UI ir API būtina pritaikyti `20261021092700_school_monthly_invoice_cancellation_audit.sql`. Šio darbo metu migracija produkcijoje netaikyta, tikros „Laisvų vaikų“ sąskaitos nekeistos. Commit, push ir deploy neatlikti.

## Patikra

Automatinės patikros naudoja sintetinius duomenis ir atmintyje veikiantį PostgreSQL (`PGlite`): API teisės bei organizacijos ribos, patvirtinimo forma, priežasties išsaugojimas ir perskaitymas, mokėjimo lenktynės, Stripe uždarymas, originalaus dokumento ir eilučių išlaikymas, permokos atlaisvinimas, pakartotinio išrašymo galimybė, mokėjimo nuorodos ir laiško pakartotinio siuntimo blokavimas.
