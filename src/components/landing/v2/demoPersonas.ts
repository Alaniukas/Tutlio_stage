import type { Locale } from '@/lib/i18n';

/**
 * Fictional identities used inside landing-page product mockups.
 *
 * Keeping them together makes a locale change update every animation at once:
 * calendar students, tutors, families, the public profile, and contact details.
 */
export interface LandingDemoPersonas {
  students: readonly [string, string, string, string];
  tutors: readonly [string, string, string, string];
  families: readonly [string, string, string, string];
  children: readonly [string, string, string, string];
  publicTutor: string;
  publicReviewer: string;
  city: string;
  publicProfileUrl: string;
  profileStudent: string;
  profilePhone: string;
  profileEmail: string;
  schoolTeam: string;
}

const PERSONAS: Record<Locale, LandingDemoPersonas> = {
  lt: {
    students: ['Emilija M.', 'Lukas K.', 'Sofija G.', 'Jonas P.'],
    tutors: ['Rasa A.', 'Tomas K.', 'Inga J.', 'Mantas K.'],
    families: ['Mockų šeima', 'Petraičiai', 'Kazlauskai', 'Jankauskai'],
    children: ['Ieva', 'Jonas', 'Greta', 'Nojus'],
    publicTutor: 'Rasa Demo',
    publicReviewer: 'Monika K.',
    city: 'Kaunas',
    publicProfileUrl: 'tutlio.lt/korepetitorius/rasa',
    profileStudent: 'Ieva Mockutė',
    profilePhone: '+370 612 34 567',
    profileEmail: 'ieva.mockute@example.lt',
    schoolTeam: 'Pro Klasės komanda',
  },
  en: {
    students: ['Emily M.', 'Lucas K.', 'Sophie G.', 'Jack P.'],
    tutors: ['Emma A.', 'Thomas K.', 'Olivia J.', 'Daniel K.'],
    families: ['The Miller family', 'The Taylors', 'The Wilsons', 'The Browns'],
    children: ['Emily', 'Jack', 'Sophie', 'Noah'],
    publicTutor: 'Emma Carter',
    publicReviewer: 'Olivia M.',
    city: 'London',
    publicProfileUrl: 'tutlio.com/tutor/emma',
    profileStudent: 'Emily Miller',
    profilePhone: '+44 7700 900 123',
    profileEmail: 'emily.miller@example.com',
    schoolTeam: 'Northbridge Tutors',
  },
  pl: {
    students: ['Emilia M.', 'Łukasz K.', 'Zofia G.', 'Jan P.'],
    tutors: ['Anna A.', 'Tomasz K.', 'Iga J.', 'Mateusz K.'],
    families: ['Rodzina Nowaków', 'Kowalscy', 'Wiśniewscy', 'Wójcikowie'],
    children: ['Emilia', 'Jan', 'Zofia', 'Mikołaj'],
    publicTutor: 'Anna Nowak',
    publicReviewer: 'Monika K.',
    city: 'Warszawa',
    publicProfileUrl: 'tutlio.pl/korepetytor/anna',
    profileStudent: 'Emilia Nowak',
    profilePhone: '+48 512 345 678',
    profileEmail: 'emilia.nowak@example.pl',
    schoolTeam: 'Akademia Dobrego Startu',
  },
  lv: {
    students: ['Emīlija M.', 'Lūkass K.', 'Sofija G.', 'Jānis P.'],
    tutors: ['Elīna A.', 'Tomass K.', 'Inga J.', 'Mārtiņš K.'],
    families: ['Bērziņu ģimene', 'Kalniņi', 'Ozoliņi', 'Liepiņi'],
    children: ['Emīlija', 'Jānis', 'Sofija', 'Noa'],
    publicTutor: 'Elīna Bērziņa',
    publicReviewer: 'Monika K.',
    city: 'Rīga',
    publicProfileUrl: 'tutlio.com/lv/skolotajs/elina',
    profileStudent: 'Emīlija Bērziņa',
    profilePhone: '+371 20 123 456',
    profileEmail: 'emilija.berzina@example.lv',
    schoolTeam: 'Rīgas Mācību centrs',
  },
  ee: {
    students: ['Emma M.', 'Lukas K.', 'Sofia G.', 'Jaan P.'],
    tutors: ['Liis A.', 'Toomas K.', 'Inga J.', 'Martin K.'],
    families: ['Tamme pere', 'Saared', 'Metsad', 'Kased'],
    children: ['Emma', 'Jaan', 'Sofia', 'Noa'],
    publicTutor: 'Liis Tamm',
    publicReviewer: 'Monika K.',
    city: 'Tallinn',
    publicProfileUrl: 'tutlio.com/ee/opetaja/liis',
    profileStudent: 'Emma Tamm',
    profilePhone: '+372 5123 4567',
    profileEmail: 'emma.tamm@example.ee',
    schoolTeam: 'Tark Õpe',
  },
  fr: {
    students: ['Emma M.', 'Lucas K.', 'Chloé G.', 'Jules P.'],
    tutors: ['Camille A.', 'Thomas K.', 'Inès J.', 'Mathieu K.'],
    families: ['Famille Martin', 'Les Bernard', 'Les Dubois', 'Les Moreau'],
    children: ['Emma', 'Jules', 'Chloé', 'Noé'],
    publicTutor: 'Camille Martin',
    publicReviewer: 'Manon K.',
    city: 'Paris',
    publicProfileUrl: 'tutlio.com/fr/professeur/camille',
    profileStudent: 'Emma Martin',
    profilePhone: '+33 6 12 34 56 78',
    profileEmail: 'emma.martin@example.fr',
    schoolTeam: 'Atelier Réussite',
  },
  es: {
    students: ['Lucía M.', 'Lucas K.', 'Sofía G.', 'Hugo P.'],
    tutors: ['Clara A.', 'Tomás K.', 'Inés J.', 'Mateo K.'],
    families: ['Familia García', 'Los Martínez', 'Los López', 'Los Sánchez'],
    children: ['Lucía', 'Hugo', 'Sofía', 'Nico'],
    publicTutor: 'Clara García',
    publicReviewer: 'Mónica K.',
    city: 'Madrid',
    publicProfileUrl: 'tutlio.com/es/profesor/clara',
    profileStudent: 'Lucía García',
    profilePhone: '+34 612 345 678',
    profileEmail: 'lucia.garcia@example.es',
    schoolTeam: 'Aula Clara',
  },
  de: {
    students: ['Emma M.', 'Lukas K.', 'Sophie G.', 'Jonas P.'],
    tutors: ['Anna A.', 'Thomas K.', 'Inga J.', 'Matthias K.'],
    families: ['Familie Müller', 'Familie Schneider', 'Familie Fischer', 'Familie Weber'],
    children: ['Emma', 'Jonas', 'Sophie', 'Noah'],
    publicTutor: 'Anna Müller',
    publicReviewer: 'Monika K.',
    city: 'Berlin',
    publicProfileUrl: 'tutlio.com/de/nachhilfe/anna',
    profileStudent: 'Emma Müller',
    profilePhone: '+49 1512 3456789',
    profileEmail: 'emma.mueller@example.de',
    schoolTeam: 'Lernraum Berlin',
  },
  se: {
    students: ['Elsa M.', 'Lucas K.', 'Sofia G.', 'Johan P.'],
    tutors: ['Elin A.', 'Thomas K.', 'Ingrid J.', 'Martin K.'],
    families: ['Familjen Andersson', 'Johansson', 'Karlsson', 'Nilsson'],
    children: ['Elsa', 'Johan', 'Sofia', 'Noah'],
    publicTutor: 'Elin Andersson',
    publicReviewer: 'Monika K.',
    city: 'Stockholm',
    publicProfileUrl: 'tutlio.com/se/larare/elin',
    profileStudent: 'Elsa Andersson',
    profilePhone: '+46 70 123 45 67',
    profileEmail: 'elsa.andersson@example.se',
    schoolTeam: 'Studiehjälpen',
  },
  dk: {
    students: ['Emma M.', 'Lucas K.', 'Sofie G.', 'Johan P.'],
    tutors: ['Freja A.', 'Thomas K.', 'Ida J.', 'Mads K.'],
    families: ['Familien Jensen', 'Nielsen', 'Hansen', 'Pedersen'],
    children: ['Emma', 'Johan', 'Sofie', 'Noah'],
    publicTutor: 'Freja Jensen',
    publicReviewer: 'Monika K.',
    city: 'København',
    publicProfileUrl: 'tutlio.com/dk/underviser/freja',
    profileStudent: 'Emma Jensen',
    profilePhone: '+45 20 12 34 56',
    profileEmail: 'emma.jensen@example.dk',
    schoolTeam: 'Læringshuset',
  },
  fi: {
    students: ['Emma M.', 'Lukas K.', 'Sofia G.', 'Joonas P.'],
    tutors: ['Aino A.', 'Tuomas K.', 'Iida J.', 'Matti K.'],
    families: ['Virtasen perhe', 'Korhoset', 'Mäkiset', 'Niemiset'],
    children: ['Emma', 'Joonas', 'Sofia', 'Nooa'],
    publicTutor: 'Aino Virtanen',
    publicReviewer: 'Monika K.',
    city: 'Helsinki',
    publicProfileUrl: 'tutlio.com/fi/opettaja/aino',
    profileStudent: 'Emma Virtanen',
    profilePhone: '+358 40 123 4567',
    profileEmail: 'emma.virtanen@example.fi',
    schoolTeam: 'Oppipolku',
  },
  no: {
    students: ['Emma M.', 'Lucas K.', 'Sofie G.', 'Jonas P.'],
    tutors: ['Nora A.', 'Thomas K.', 'Ingrid J.', 'Martin K.'],
    families: ['Familien Hansen', 'Johansen', 'Olsen', 'Larsen'],
    children: ['Emma', 'Jonas', 'Sofie', 'Noah'],
    publicTutor: 'Nora Hansen',
    publicReviewer: 'Monika K.',
    city: 'Oslo',
    publicProfileUrl: 'tutlio.com/no/larer/nora',
    profileStudent: 'Emma Hansen',
    profilePhone: '+47 412 34 567',
    profileEmail: 'emma.hansen@example.no',
    schoolTeam: 'Læringsrommet',
  },
  nl: {
    students: ['Emma M.', 'Lucas K.', 'Sophie G.', 'Noah P.'],
    tutors: ['Sanne A.', 'Thomas K.', 'Inge J.', 'Milan K.'],
    families: ['Familie De Vries', 'Familie Jansen', 'Familie Smit', 'Familie Bakker'],
    children: ['Emma', 'Noah', 'Sophie', 'Daan'],
    publicTutor: 'Sanne de Vries',
    publicReviewer: 'Noor J.',
    city: 'Amsterdam',
    publicProfileUrl: 'tutlio.com/nl/docent/sanne',
    profileStudent: 'Emma de Vries',
    profilePhone: '+31 6 12345678',
    profileEmail: 'emma.devries@example.nl',
    schoolTeam: 'Bijleshuis Nederland',
  },
};

export function getLandingDemoPersonas(locale: Locale): LandingDemoPersonas {
  return PERSONAS[locale];
}
