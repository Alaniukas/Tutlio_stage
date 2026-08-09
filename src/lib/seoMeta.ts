import type { Locale } from './i18n/core';

export type CoreSeoPage = 'landing' | 'pricing';

interface SeoMeta {
  title: string;
  description: string;
}

/** Search-intent copy is deliberately separate from visible hero slogans.
 * Translating a slogan word-for-word rarely matches how a market searches for
 * tutoring software. Keep these concise and have native speakers review them
 * whenever positioning changes. */
const SEO_META: Record<Locale, Record<CoreSeoPage, SeoMeta>> = {
  lt: {
    landing: { title: 'Korepetitorių ir mokyklų valdymo programa | Tutlio', description: 'Valdykite pamokas, mokinius, tvarkaraštį, laukimo eilę, mokėjimus, sąskaitas ir priminimus vienoje korepetitorių platformoje.' },
    pricing: { title: 'Korepetitorių platformos kainos ir planai | Tutlio', description: 'Peržiūrėkite Tutlio planus korepetitoriams ir mokykloms. Kalendorius, mokėjimai, sąskaitos, priminimai ir mokinių valdymas vienoje vietoje.' },
  },
  en: {
    landing: { title: 'Tutoring Management Software for Tutors & Schools | Tutlio', description: 'Manage lessons, students, scheduling, waitlists, payments, invoices, and reminders in one tutoring management platform.' },
    pricing: { title: 'Tutoring Software Pricing & Plans | Tutlio', description: 'Compare Tutlio plans for private tutors and tutoring schools, with scheduling, payments, invoicing, reminders, and student management included.' },
  },
  pl: {
    landing: { title: 'Program do zarządzania korepetycjami i szkołą | Tutlio', description: 'Zarządzaj lekcjami, uczniami, grafikiem, listą oczekujących, płatnościami, fakturami i przypomnieniami w jednej platformie.' },
    pricing: { title: 'Cennik programu dla korepetytorów i szkół | Tutlio', description: 'Porównaj plany Tutlio dla korepetytorów i szkół: grafik, płatności, faktury, przypomnienia i zarządzanie uczniami.' },
  },
  lv: {
    landing: { title: 'Privātskolotāju pārvaldības programma | Tutlio', description: 'Pārvaldiet nodarbības, audzēkņus, grafiku, gaidīšanas sarakstu, maksājumus, rēķinus un atgādinājumus vienā platformā.' },
    pricing: { title: 'Privātskolotāju programmas cenas un plāni | Tutlio', description: 'Salīdziniet Tutlio plānus privātskolotājiem un mācību centriem ar grafiku, maksājumiem, rēķiniem un audzēkņu pārvaldību.' },
  },
  ee: {
    landing: { title: 'Eraõpetajate ja õppekeskuste haldustarkvara | Tutlio', description: 'Hallake tunde, õpilasi, tunniplaani, ootenimekirja, makseid, arveid ja meeldetuletusi ühes eraõpetajate platvormis.' },
    pricing: { title: 'Eraõpetajate tarkvara hinnad ja paketid | Tutlio', description: 'Võrrelge Tutlio pakette eraõpetajatele ja õppekeskustele: tunniplaan, maksed, arved, meeldetuletused ja õpilaste haldus.' },
  },
  fr: {
    landing: { title: 'Logiciel de gestion des cours particuliers | Tutlio', description: 'Gérez cours, élèves, planning, liste d’attente, paiements, factures et rappels dans une seule plateforme de soutien scolaire.' },
    pricing: { title: 'Tarifs du logiciel de gestion de cours particuliers | Tutlio', description: 'Comparez les offres Tutlio pour professeurs particuliers et écoles : planning, paiements, factures, rappels et gestion des élèves.' },
  },
  es: {
    landing: { title: 'Software para profesores y academias | Tutlio', description: 'Gestiona clases, alumnos, horarios, lista de espera, pagos, facturas y recordatorios en una sola plataforma educativa.' },
    pricing: { title: 'Precios del software para profesores y academias | Tutlio', description: 'Compara los planes de Tutlio para profesores particulares y academias con horarios, pagos, facturas, recordatorios y gestión de alumnos.' },
  },
  de: {
    landing: { title: 'Software für Nachhilfelehrer und Lerninstitute | Tutlio', description: 'Verwalten Sie Unterricht, Schüler, Termine, Wartelisten, Zahlungen, Rechnungen und Erinnerungen auf einer zentralen Plattform.' },
    pricing: { title: 'Preise für Nachhilfelehrer- und Schulsoftware | Tutlio', description: 'Vergleichen Sie Tutlio-Tarife für Nachhilfelehrer und Lerninstitute – mit Terminplanung, Zahlungen, Rechnungen und Schülerverwaltung.' },
  },
  se: {
    landing: { title: 'System för privatlärare och läxhjälp | Tutlio', description: 'Hantera lektioner, elever, schema, väntelista, betalningar, fakturor och påminnelser i en gemensam plattform.' },
    pricing: { title: 'Priser och planer för läraradministration | Tutlio', description: 'Jämför Tutlios planer för privatlärare och läxhjälpsföretag med schema, betalningar, fakturor, påminnelser och elevhantering.' },
  },
  dk: {
    landing: { title: 'Software til privatundervisere og lektiehjælp | Tutlio', description: 'Administrer lektioner, elever, kalender, venteliste, betalinger, fakturaer og påmindelser på én samlet platform.' },
    pricing: { title: 'Priser på software til privatundervisere | Tutlio', description: 'Sammenlign Tutlios planer til privatundervisere og lektiehjælpsvirksomheder med kalender, betalinger, fakturaer og elevstyring.' },
  },
  fi: {
    landing: { title: 'Ohjelmisto yksityisopettajille ja opetuskeskuksille | Tutlio', description: 'Hallitse oppitunteja, oppilaita, aikatauluja, jonotuslistaa, maksuja, laskuja ja muistutuksia yhdellä alustalla.' },
    pricing: { title: 'Yksityisopettajien ohjelmiston hinnat ja paketit | Tutlio', description: 'Vertaile Tutlion paketteja yksityisopettajille ja opetuskeskuksille: aikataulut, maksut, laskut, muistutukset ja oppilashallinta.' },
  },
  no: {
    landing: { title: 'Program for privatlærere og leksehjelp | Tutlio', description: 'Administrer timer, elever, kalender, venteliste, betalinger, fakturaer og påminnelser i én samlet plattform.' },
    pricing: { title: 'Priser på programvare for privatlærere | Tutlio', description: 'Sammenlign Tutlio-planer for privatlærere og leksehjelpsbedrifter med kalender, betalinger, fakturaer, påminnelser og elevstyring.' },
  },
  nl: {
    landing: { title: 'Software voor bijlesdocenten en instituten | Tutlio', description: 'Beheer lessen, leerlingen, planning, wachtlijsten, betalingen, facturen en herinneringen in één platform voor bijles.' },
    pricing: { title: 'Prijzen van bijlesmanagementsoftware | Tutlio', description: 'Vergelijk Tutlio-abonnementen voor bijlesdocenten en instituten met planning, betalingen, facturen, herinneringen en leerlingbeheer.' },
  },
};

export function getSeoMeta(locale: Locale, page: CoreSeoPage): SeoMeta {
  return SEO_META[locale][page];
}
