import type { Locale } from '@/lib/i18n';

/**
 * Fictional social-proof content for landing-page layout and copy review.
 * These are not customer claims and must be replaced with attributable data
 * before structured review markup or customer attribution is enabled.
 */
export const SHOW_PLACEHOLDER_SOCIAL_PROOF = false;

/** YouTube video id for an optional real demo. Empty = unused. */
export const DEMO_VIDEO_ID = '';

/** Length label shown next to a real video once an id is set. */
export const DEMO_VIDEO_LENGTH = '2 min';

function portrait(kind: 'men' | 'women', id: number): string {
  return `https://randomuser.me/api/portraits/${kind}/${id}.jpg`;
}

export interface QuoteRun {
  text: string;
  emphasis?: boolean;
}

export interface CaseStudy {
  org: string;
  headline: string;
  logo: string | null;
  stats: { value: string; label: string }[];
  quote: QuoteRun[];
  authorName: string;
  authorRole: string;
  authorPhoto: string | null;
  authorLinkedIn: string | null;
}

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  photo: string | null;
  rating: number;
}

interface LocalizedSocialProof {
  caseStudy: CaseStudy;
  testimonials: Testimonial[];
}

const photos = {
  caseAuthor: portrait('women', 44),
  tutor: portrait('men', 32),
  owner: portrait('men', 52),
  teacher: portrait('women', 65),
} as const;

const SOCIAL_PROOF: Record<Locale, LocalizedSocialProof> = {
  lt: {
    caseStudy: {
      org: 'Baltic Tutor Hub',
      headline: 'Per keturis mėnesius surinkome mokėjimus be savaitinio Excel chaoso',
      logo: null,
      stats: [
        { value: '38%', label: 'mažiau vėluojančių mokėjimų' },
        { value: '2.4×', label: 'greitesnis sąskaitų siuntimas' },
      ],
      quote: [
        { text: 'Anksčiau kiekvieną penktadienį skaičiuodavome, kas sumokėjo, o kas — ne. Dabar ' },
        { text: 'statistika ir tėvų paskyros matosi iš karto', emphasis: true },
        { text: ', o korepetitoriai patys žymi pamokas. Administravimo sumažėjo bent perpus.' },
      ],
      authorName: 'Rūta Navickienė',
      authorRole: 'Operacijų vadovė, Baltic Tutor Hub',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Tomas J.', role: 'Individualus korepetitorius, Vilnius', quote: 'Kalendorius ir sąskaitos vienoje vietoje. Tėvams nebereikia kas savaitę klausti, kada ir kiek mokėti.', photo: photos.tutor, rating: 5 },
      { name: 'Inga Petrauskaitė', role: 'Mokyklos administratorė, Kaunas', quote: 'Vienuolika korepetitorių anksčiau gyveno trijose lentelėse. Dabar iš karto matau, kas laisvas.', photo: null, rating: 4 },
      { name: 'Mindaugas K.', role: 'Agentūros savininkas, Klaipėda', quote: 'Pagaliau matome komandos užimtumą ir pajamas pagal mokytoją. Mėnesio suvestinė nebeužima viso vakaro.', photo: photos.owner, rating: 5 },
      { name: 'Eglė Š.', role: 'Anglų kalbos korepetitorė, Šiauliai', quote: 'Mokiniai patys rezervuoja laiką, o aš tik patvirtinu. Pradėti buvo daug paprasčiau, nei tikėjausi.', photo: photos.teacher, rating: 4 },
    ],
  },
  en: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Four months of collecting payments without the weekly spreadsheet chaos',
      logo: null,
      stats: [
        { value: '38%', label: 'fewer late payments' },
        { value: '2.4×', label: 'faster invoice delivery' },
      ],
      quote: [
        { text: 'We used to spend every Friday checking who had paid. Now ' },
        { text: 'the numbers and parent accounts are visible immediately', emphasis: true },
        { text: ', while tutors record their own lessons. Our admin workload has been cut at least in half.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Operations lead, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Private tutor, London', quote: 'My calendar and invoices finally live in one place. Parents no longer message me every week to ask what they owe.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'School administrator, Bristol', quote: 'Eleven tutors used to be spread across three spreadsheets. Now I can see availability at a glance.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Agency owner, Manchester', quote: 'We can see capacity and revenue by tutor. The monthly review no longer takes an entire evening.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'English tutor, Leeds', quote: 'Students book their own times and I simply approve them. Getting started was much easier than I expected.', photo: photos.teacher, rating: 4 },
    ],
  },
  pl: {
    caseStudy: {
      org: 'Akademia Dobrego Startu',
      headline: 'Cztery miesiące pobierania opłat bez cotygodniowego chaosu w Excelu',
      logo: null,
      stats: [
        { value: '38%', label: 'mniej opóźnionych płatności' },
        { value: '2,4×', label: 'szybsza wysyłka faktur' },
      ],
      quote: [
        { text: 'W każdy piątek sprawdzaliśmy, kto już zapłacił. Teraz ' },
        { text: 'statystyki i konta rodziców widać od razu', emphasis: true },
        { text: ', a korepetytorzy sami oznaczają zajęcia. Pracy administracyjnej jest co najmniej o połowę mniej.' },
      ],
      authorName: 'Anna Kowalska',
      authorRole: 'Kierowniczka operacyjna, Akademia Dobrego Startu',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Michał W.', role: 'Korepetytor indywidualny, Warszawa', quote: 'Kalendarz i faktury mam w jednym miejscu. Rodzice nie pytają już co tydzień, ile i kiedy zapłacić.', photo: photos.tutor, rating: 5 },
      { name: 'Katarzyna Nowak', role: 'Administratorka szkoły, Kraków', quote: 'Jedenastu korepetytorów było rozpisanych w trzech arkuszach. Teraz od razu widzę dostępność.', photo: null, rating: 4 },
      { name: 'Piotr R.', role: 'Właściciel agencji, Gdańsk', quote: 'Widzimy obłożenie i przychody każdego nauczyciela. Miesięczne podsumowanie nie zajmuje już całego wieczoru.', photo: photos.owner, rating: 5 },
      { name: 'Zofia M.', role: 'Korepetytorka języka angielskiego, Wrocław', quote: 'Uczniowie sami rezerwują terminy, a ja je tylko zatwierdzam. Start był prostszy, niż się spodziewałam.', photo: photos.teacher, rating: 4 },
    ],
  },
  lv: {
    caseStudy: {
      org: 'Rīgas Mācību centrs',
      headline: 'Četrus mēnešus iekasējām maksājumus bez iknedēļas Excel haosa',
      logo: null,
      stats: [
        { value: '38%', label: 'mazāk kavētu maksājumu' },
        { value: '2,4×', label: 'ātrāka rēķinu nosūtīšana' },
      ],
      quote: [
        { text: 'Katru piektdienu pārbaudījām, kurš ir samaksājis. Tagad ' },
        { text: 'statistika un vecāku konti ir redzami uzreiz', emphasis: true },
        { text: ', bet pasniedzēji paši atzīmē nodarbības. Administrēšanai vajag vismaz uz pusi mazāk laika.' },
      ],
      authorName: 'Elīna Bērziņa',
      authorRole: 'Operāciju vadītāja, Rīgas Mācību centrs',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Jānis V.', role: 'Privātskolotājs, Rīga', quote: 'Kalendārs un rēķini beidzot ir vienuviet. Vecākiem vairs katru nedēļu nav jājautā par maksājumu.', photo: photos.tutor, rating: 5 },
      { name: 'Līga Kalniņa', role: 'Skolas administratore, Jelgava', quote: 'Vienpadsmit pasniedzēji agrāk bija trīs tabulās. Tagad pieejamību redzu vienā mirklī.', photo: null, rating: 4 },
      { name: 'Mārtiņš R.', role: 'Aģentūras vadītājs, Liepāja', quote: 'Redzam katra pasniedzēja noslodzi un ieņēmumus. Mēneša kopsavilkums vairs neaizņem visu vakaru.', photo: photos.owner, rating: 5 },
      { name: 'Sofija M.', role: 'Angļu valodas pasniedzēja, Daugavpils', quote: 'Skolēni paši rezervē laikus, bet es tos tikai apstiprinu. Sākt bija vieglāk, nekā gaidīju.', photo: photos.teacher, rating: 4 },
    ],
  },
  ee: {
    caseStudy: {
      org: 'Tark Õpe',
      headline: 'Neli kuud maksete kogumist ilma iganädalase Exceli kaoseta',
      logo: null,
      stats: [
        { value: '38%', label: 'vähem hilinenud makseid' },
        { value: '2,4×', label: 'kiirem arvete saatmine' },
      ],
      quote: [
        { text: 'Varem kontrollisime igal reedel, kes on maksnud. Nüüd ' },
        { text: 'on statistika ja lapsevanemate kontod kohe nähtavad', emphasis: true },
        { text: ' ning õpetajad märgivad tunnid ise. Haldustööd on vähemalt poole vähem.' },
      ],
      authorName: 'Liis Tamm',
      authorRole: 'Tegevjuht, Tark Õpe',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Jaan V.', role: 'Eraõpetaja, Tallinn', quote: 'Kalender ja arved on lõpuks ühes kohas. Vanemad ei pea enam igal nädalal maksete kohta küsima.', photo: photos.tutor, rating: 5 },
      { name: 'Kadri Saar', role: 'Kooli administraator, Tartu', quote: 'Üksteist õpetajat olid varem kolmes tabelis. Nüüd näen saadavust ühe pilguga.', photo: null, rating: 4 },
      { name: 'Martin R.', role: 'Agentuuri omanik, Pärnu', quote: 'Näeme iga õpetaja koormust ja tulu. Kuu kokkuvõte ei võta enam tervet õhtut.', photo: photos.owner, rating: 5 },
      { name: 'Sofia M.', role: 'Inglise keele õpetaja, Narva', quote: 'Õpilased broneerivad aja ise ja mina ainult kinnitan. Alustamine oli oodatust lihtsam.', photo: photos.teacher, rating: 4 },
    ],
  },
  fr: {
    caseStudy: {
      org: 'Atelier Réussite',
      headline: 'Quatre mois d’encaissements sans le chaos hebdomadaire des tableurs',
      logo: null,
      stats: [
        { value: '38 %', label: 'de retards de paiement en moins' },
        { value: '2,4×', label: 'd’envoi des factures plus rapide' },
      ],
      quote: [
        { text: 'Chaque vendredi, nous vérifiions qui avait payé. Maintenant, ' },
        { text: 'les statistiques et les comptes parents sont visibles immédiatement', emphasis: true },
        { text: ', et les professeurs renseignent eux-mêmes les cours. Le travail administratif a été réduit au moins de moitié.' },
      ],
      authorName: 'Camille Martin',
      authorRole: 'Responsable des opérations, Atelier Réussite',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Julien V.', role: 'Professeur indépendant, Paris', quote: 'Mon calendrier et mes factures sont enfin au même endroit. Les parents ne demandent plus chaque semaine ce qu’ils doivent.', photo: photos.tutor, rating: 5 },
      { name: 'Claire Bernard', role: 'Administratrice scolaire, Lyon', quote: 'Onze professeurs étaient répartis dans trois tableaux. Maintenant, je vois les disponibilités en un coup d’œil.', photo: null, rating: 4 },
      { name: 'Thomas R.', role: 'Directeur d’agence, Bordeaux', quote: 'Nous voyons la charge et le chiffre d’affaires de chaque professeur. Le bilan mensuel ne prend plus toute une soirée.', photo: photos.owner, rating: 5 },
      { name: 'Chloé M.', role: 'Professeure d’anglais, Lille', quote: 'Les élèves réservent eux-mêmes et je n’ai plus qu’à confirmer. La prise en main a été plus simple que prévu.', photo: photos.teacher, rating: 4 },
    ],
  },
  es: {
    caseStudy: {
      org: 'Aula Clara',
      headline: 'Cuatro meses cobrando sin el caos semanal de las hojas de cálculo',
      logo: null,
      stats: [
        { value: '38 %', label: 'menos pagos atrasados' },
        { value: '2,4×', label: 'envío de facturas más rápido' },
      ],
      quote: [
        { text: 'Cada viernes revisábamos quién había pagado. Ahora ' },
        { text: 'las estadísticas y las cuentas de las familias se ven al instante', emphasis: true },
        { text: ', y los profesores registran sus propias clases. El trabajo administrativo se ha reducido al menos a la mitad.' },
      ],
      authorName: 'Clara García',
      authorRole: 'Responsable de operaciones, Aula Clara',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Javier V.', role: 'Profesor particular, Madrid', quote: 'El calendario y las facturas están por fin en un solo lugar. Las familias ya no preguntan cada semana cuánto deben.', photo: photos.tutor, rating: 5 },
      { name: 'Laura Martínez', role: 'Administradora escolar, Valencia', quote: 'Once profesores estaban repartidos en tres hojas. Ahora veo la disponibilidad de un vistazo.', photo: null, rating: 4 },
      { name: 'Diego R.', role: 'Director de academia, Barcelona', quote: 'Vemos la ocupación y los ingresos por profesor. El cierre mensual ya no nos lleva toda la tarde.', photo: photos.owner, rating: 5 },
      { name: 'Sofía M.', role: 'Profesora de inglés, Sevilla', quote: 'Los alumnos reservan su horario y yo solo confirmo. Empezar fue mucho más sencillo de lo que esperaba.', photo: photos.teacher, rating: 4 },
    ],
  },
  de: {
    caseStudy: {
      org: 'Lernraum Berlin',
      headline: 'Vier Monate Zahlungen einziehen – ohne wöchentliches Tabellenchaos',
      logo: null,
      stats: [
        { value: '38 %', label: 'weniger verspätete Zahlungen' },
        { value: '2,4×', label: 'schnellerer Rechnungsversand' },
      ],
      quote: [
        { text: 'Früher prüften wir jeden Freitag, wer bezahlt hatte. Jetzt sind ' },
        { text: 'Statistiken und Elternkonten sofort sichtbar', emphasis: true },
        { text: ', und die Lehrkräfte tragen ihre Stunden selbst ein. Unser Verwaltungsaufwand hat sich mindestens halbiert.' },
      ],
      authorName: 'Anna Müller',
      authorRole: 'Betriebsleiterin, Lernraum Berlin',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Johannes W.', role: 'Privatlehrer, Berlin', quote: 'Kalender und Rechnungen sind endlich an einem Ort. Eltern fragen nicht mehr jede Woche nach dem offenen Betrag.', photo: photos.tutor, rating: 5 },
      { name: 'Katharina Schneider', role: 'Schuladministratorin, Hamburg', quote: 'Elf Lehrkräfte waren auf drei Tabellen verteilt. Jetzt sehe ich die Verfügbarkeit auf einen Blick.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Agenturinhaber, München', quote: 'Wir sehen Auslastung und Umsatz pro Lehrkraft. Der Monatsabschluss dauert nicht mehr einen ganzen Abend.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Englischtutorin, Köln', quote: 'Die Lernenden buchen ihre Termine selbst, ich bestätige nur noch. Der Einstieg war einfacher als gedacht.', photo: photos.teacher, rating: 4 },
    ],
  },
  se: {
    caseStudy: {
      org: 'Studiehjälpen',
      headline: 'Fyra månaders betalningar utan det veckovisa kalkylbladskaoset',
      logo: null,
      stats: [
        { value: '38 %', label: 'färre sena betalningar' },
        { value: '2,4×', label: 'snabbare fakturautskick' },
      ],
      quote: [
        { text: 'Varje fredag kontrollerade vi vem som hade betalat. Nu syns ' },
        { text: 'statistik och föräldrakonton direkt', emphasis: true },
        { text: ', och lärarna registrerar själva sina lektioner. Administrationen har minst halverats.' },
      ],
      authorName: 'Elin Andersson',
      authorRole: 'Verksamhetschef, Studiehjälpen',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Johan V.', role: 'Privatlärare, Stockholm', quote: 'Kalender och fakturor finns äntligen på samma ställe. Föräldrar behöver inte fråga om betalningen varje vecka.', photo: photos.tutor, rating: 5 },
      { name: 'Karin Johansson', role: 'Skoladministratör, Uppsala', quote: 'Elva lärare låg tidigare i tre olika kalkylblad. Nu ser jag tillgängligheten direkt.', photo: null, rating: 4 },
      { name: 'Martin R.', role: 'Byråägare, Göteborg', quote: 'Vi ser beläggning och intäkter per lärare. Månadsöversikten tar inte längre en hel kväll.', photo: photos.owner, rating: 5 },
      { name: 'Sofia M.', role: 'Engelsklärare, Malmö', quote: 'Eleverna bokar själva och jag behöver bara bekräfta. Det var enklare att komma igång än jag trodde.', photo: photos.teacher, rating: 4 },
    ],
  },
  dk: {
    caseStudy: {
      org: 'Læringshuset',
      headline: 'Fire måneders betalinger uden det ugentlige regnearkskaos',
      logo: null,
      stats: [
        { value: '38 %', label: 'færre forsinkede betalinger' },
        { value: '2,4×', label: 'hurtigere fakturaudsendelse' },
      ],
      quote: [
        { text: 'Hver fredag kontrollerede vi, hvem der havde betalt. Nu er ' },
        { text: 'statistik og forældrekonti synlige med det samme', emphasis: true },
        { text: ', og underviserne registrerer selv lektionerne. Administrationen er mindst halveret.' },
      ],
      authorName: 'Freja Jensen',
      authorRole: 'Driftsleder, Læringshuset',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Johan V.', role: 'Privatunderviser, København', quote: 'Kalender og fakturaer er endelig samlet ét sted. Forældrene spørger ikke længere hver uge til betalingen.', photo: photos.tutor, rating: 5 },
      { name: 'Katrine Nielsen', role: 'Skoleadministrator, Odense', quote: 'Elleve undervisere lå før i tre regneark. Nu kan jeg se ledige tider med det samme.', photo: null, rating: 4 },
      { name: 'Martin R.', role: 'Bureauejer, Aarhus', quote: 'Vi ser kapacitet og omsætning pr. underviser. Månedsoversigten tager ikke længere en hel aften.', photo: photos.owner, rating: 5 },
      { name: 'Sofie M.', role: 'Engelskunderviser, Aalborg', quote: 'Eleverne booker selv, og jeg skal bare godkende. Det var lettere at komme i gang end forventet.', photo: photos.teacher, rating: 4 },
    ],
  },
  fi: {
    caseStudy: {
      org: 'Oppipolku',
      headline: 'Neljä kuukautta maksuja ilman viikoittaista taulukkohässäkkää',
      logo: null,
      stats: [
        { value: '38 %', label: 'vähemmän myöhästyneitä maksuja' },
        { value: '2,4×', label: 'nopeampi laskujen lähetys' },
      ],
      quote: [
        { text: 'Tarkistimme ennen joka perjantai, kuka oli maksanut. Nyt ' },
        { text: 'tilastot ja vanhempien tilit näkyvät heti', emphasis: true },
        { text: ', ja opettajat kirjaavat tuntinsa itse. Hallinnollinen työ on vähentynyt vähintään puoleen.' },
      ],
      authorName: 'Aino Virtanen',
      authorRole: 'Operatiivinen johtaja, Oppipolku',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Joonas V.', role: 'Yksityisopettaja, Helsinki', quote: 'Kalenteri ja laskut ovat vihdoin samassa paikassa. Vanhempien ei tarvitse kysyä maksuista joka viikko.', photo: photos.tutor, rating: 5 },
      { name: 'Katariina Korhonen', role: 'Koulun hallintovastaava, Tampere', quote: 'Yksitoista opettajaa oli ennen kolmessa taulukossa. Nyt näen vapaat ajat yhdellä silmäyksellä.', photo: null, rating: 4 },
      { name: 'Matti R.', role: 'Opetusyrityksen omistaja, Turku', quote: 'Näemme opettajakohtaisen käyttöasteen ja tulot. Kuukausikatsaus ei vie enää koko iltaa.', photo: photos.owner, rating: 5 },
      { name: 'Sofia M.', role: 'Englannin opettaja, Oulu', quote: 'Oppilaat varaavat ajat itse, ja minä vain vahvistan. Aloittaminen oli odotettua helpompaa.', photo: photos.teacher, rating: 4 },
    ],
  },
  no: {
    caseStudy: {
      org: 'Læringsrommet',
      headline: 'Fire måneder med betalinger uten det ukentlige regnearkkaoset',
      logo: null,
      stats: [
        { value: '38 %', label: 'færre forsinkede betalinger' },
        { value: '2,4×', label: 'raskere utsending av fakturaer' },
      ],
      quote: [
        { text: 'Hver fredag sjekket vi hvem som hadde betalt. Nå er ' },
        { text: 'statistikk og foreldrekontoer synlige med en gang', emphasis: true },
        { text: ', og lærerne registrerer timene selv. Administrasjonen er minst halvert.' },
      ],
      authorName: 'Nora Hansen',
      authorRole: 'Driftsleder, Læringsrommet',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Jonas V.', role: 'Privatlærer, Oslo', quote: 'Kalender og fakturaer er endelig samlet. Foreldrene trenger ikke lenger spørre om betaling hver uke.', photo: photos.tutor, rating: 5 },
      { name: 'Kari Johansen', role: 'Skoleadministrator, Trondheim', quote: 'Elleve lærere lå tidligere i tre regneark. Nå ser jeg ledige tider med én gang.', photo: null, rating: 4 },
      { name: 'Martin R.', role: 'Byråeier, Bergen', quote: 'Vi ser kapasitet og inntekter per lærer. Månedsoversikten tar ikke lenger en hel kveld.', photo: photos.owner, rating: 5 },
      { name: 'Sofie M.', role: 'Engelsklærer, Stavanger', quote: 'Elevene bestiller selv, og jeg trenger bare å godkjenne. Det var enklere å komme i gang enn forventet.', photo: photos.teacher, rating: 4 },
    ],
  },
  nl: {
    caseStudy: {
      org: 'Bijleshuis Nederland',
      headline: 'Vier maanden betalingen innen zonder wekelijkse chaos in spreadsheets',
      logo: null,
      stats: [
        { value: '38%', label: 'minder late betalingen' },
        { value: '2,4×', label: 'sneller facturen verstuurd' },
      ],
      quote: [
        { text: 'Elke vrijdag controleerden we wie er betaald had. Nu zijn ' },
        { text: 'statistieken en ouderaccounts direct zichtbaar', emphasis: true },
        { text: ', terwijl docenten zelf hun lessen registreren. Onze administratie is minstens gehalveerd.' },
      ],
      authorName: 'Sanne de Vries',
      authorRole: 'Operationeel manager, Bijleshuis Nederland',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'Daan V.', role: 'Zelfstandig docent, Amsterdam', quote: 'Mijn agenda en facturen staan eindelijk bij elkaar. Ouders vragen niet meer elke week hoeveel ze nog moeten betalen.', photo: photos.tutor, rating: 5 },
      { name: 'Noor Jansen', role: 'Schoolbeheerder, Utrecht', quote: 'Elf docenten stonden eerst in drie spreadsheets. Nu zie ik in één oogopslag wie er beschikbaar is.', photo: null, rating: 4 },
      { name: 'Milan R.', role: 'Eigenaar bijlesbureau, Rotterdam', quote: 'We zien de bezetting en omzet per docent. De maandafsluiting kost ons geen hele avond meer.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Docent Engels, Den Haag', quote: 'Leerlingen boeken zelf een tijd en ik hoef alleen te bevestigen. Beginnen was veel eenvoudiger dan verwacht.', photo: photos.teacher, rating: 4 },
    ],
  },
};

export function getCaseStudy(locale: Locale): CaseStudy {
  return SOCIAL_PROOF[locale].caseStudy;
}

export function getTestimonials(locale: Locale): Testimonial[] {
  return SOCIAL_PROOF[locale].testimonials;
}
