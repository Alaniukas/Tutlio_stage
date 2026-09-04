import { withEnglishLocaleFallback } from './i18n/locales.js';
import type { Locale } from './i18n/core.js';

export type CoreSeoPage = 'landing' | 'pricing';

interface SeoMeta {
  title: string;
  description: string;
}

/** Search-intent copy is deliberately separate from visible hero slogans.
 * Translating a slogan word-for-word rarely matches how a market searches for
 * tutoring software. Keep these concise and have native speakers review them
 * whenever positioning changes. */
const SEO_META: Record<Locale, Record<CoreSeoPage, SeoMeta>> = withEnglishLocaleFallback({
  cs: {
    landing: { title: 'Software pro lektory a doučovací centra | Tutlio', description: 'Spravujte lekce, studenty, rozvrhy, čekací listiny, platby, faktury a připomínky na jedné platformě pro doučování.' },
    pricing: { title: 'Ceník a tarify pro lektory a doučovací centra | Tutlio', description: 'Porovnejte tarify Tutlio pro samostatné lektory a doučovací centra: plánování, platby, fakturace, připomínky a správa studentů.' },
  },
  sl: {
    landing: { title: 'Platforma za inštruktorje in inštrukcijska podjetja | Tutlio', description: 'Upravljajte ure, učence, urnike, čakalne sezname, plačila, račune in opomnike na eni platformi za inštrukcije.' },
    pricing: { title: 'Cene in paketi za inštruktorje in inštrukcijska podjetja | Tutlio', description: 'Primerjajte pakete Tutlio za samostojne inštruktorje in podjetja: urniki, plačila, računi, opomniki in upravljanje učencev.' },
  },
  el: {
    landing: { title: 'Διαχείριση ιδιαίτερων μαθημάτων και φροντιστηρίων | Tutlio', description: 'Οργανώστε μαθήματα, μαθητές, προγράμματα, λίστες αναμονής, πληρωμές, τιμολόγια και υπενθυμίσεις σε μία πλατφόρμα για καθηγητές και φροντιστήρια.' },
    pricing: { title: 'Τιμές και προγράμματα για καθηγητές και φροντιστήρια | Tutlio', description: 'Συγκρίνετε τα προγράμματα Tutlio για ανεξάρτητους καθηγητές και επιχειρήσεις ιδιαίτερων μαθημάτων: προγραμματισμός, πληρωμές, τιμολόγηση και διαχείριση μαθητών.' },
  },
  hu: {
    landing: { title: 'Oktatásszervezés magántanároknak és vállalkozásoknak | Tutlio', description: 'Kezeld az órákat, diákokat, órarendeket, várólistákat, fizetéseket, számlákat és emlékeztetőket egyetlen oktatásszervezési platformon.' },
    pricing: { title: 'Oktatásszervezési csomagok és árak | Tutlio', description: 'Hasonlítsd össze a Tutlio csomagjait egyéni magántanároknak és oktatási vállalkozásoknak: óraszervezés, fizetések, számlázás, emlékeztetők és diákkezelés.' },
  },
  sk: {
    landing: { title: 'Softvér pre doučovateľov a doučovacie centrá | Tutlio', description: 'Spravujte hodiny, študentov, rozvrhy, čakacie listiny, platby, faktúry a pripomienky na jednej platforme pre doučovanie.' },
    pricing: { title: 'Ceny a plány pre doučovateľov a doučovacie centrá | Tutlio', description: 'Porovnajte plány Tutlio pre samostatných doučovateľov a doučovacie centrá s plánovaním, platbami, fakturáciou, pripomienkami a správou študentov.' },
  },
  bg: {
    landing: { title: 'Платформа за преподаватели и учебни центрове | Tutlio', description: 'Управлявайте уроци, ученици, графици, списъци на чакащите, плащания, фактури и напомняния в една платформа за преподавателската си дейност.' },
    pricing: { title: 'Цени и планове за преподаватели и учебни центрове | Tutlio', description: 'Сравнете плановете на Tutlio за самостоятелни преподаватели и учебни центрове с графици, плащания, фактури, напомняния и управление на ученици.' },
  },
  hr: {
    landing: { title: 'Platforma za upravljanje instrukcijama i centrima | Tutlio', description: 'Upravljaj satovima, učenicima, rasporedom, listama čekanja, plaćanjima, računima i podsjetnicima na jednoj platformi za instrukcije.' },
    pricing: { title: 'Cijene i planovi platforme za instrukcije | Tutlio', description: 'Usporedi planove Tutlio za samostalne instruktore i centre za instrukcije: raspored, plaćanja, računi, podsjetnici i upravljanje učenicima.' },
  },
  th: {
    landing: { title: 'ระบบจัดการงานสอนสำหรับติวเตอร์และธุรกิจสอนพิเศษ | Tutlio', description: 'จัดการคาบเรียน นักเรียน ตาราง รายชื่อรอเรียน การชำระเงิน ใบแจ้งหนี้ และการแจ้งเตือนในแพลตฟอร์มสอนพิเศษเดียว' },
    pricing: { title: 'ราคาและแผนระบบจัดการงานสอนพิเศษ | Tutlio', description: 'เปรียบเทียบแผน Tutlio สำหรับติวเตอร์อิสระและธุรกิจสอนพิเศษ พร้อมการจัดตาราง ชำระเงิน ใบแจ้งหนี้ แจ้งเตือน และจัดการนักเรียน' },
  },
  tr: {"landing": {"title": "Özel ders öğretmenleri ve işletmeleri için yönetim platformu | Tutlio", "description": "Dersleri, öğrencileri, programları, bekleme listelerini, ödemeleri, faturaları ve hatırlatmaları tek özel ders yönetim platformunda yönetin."}, "pricing": {"title": "Özel ders yönetim platformu fiyatları ve planları | Tutlio", "description": "Bağımsız öğretmenler ve özel ders kurumları için planları karşılaştırın. Planlama, ödemeler, faturalar, hatırlatmalar ve öğrenci yönetimi dahildir."}},
  'zh-hk': {
    landing: { title: '個人導師及補習機構管理平台 | Tutlio', description: '在同一補習管理平台安排課堂、管理學生、時間表、候補名單、付款、發票及提醒。' },
    pricing: { title: '補習管理平台價格與方案 | Tutlio', description: '比較適合私人導師及補習機構的 Tutlio 方案，包含排課、付款、發票、提醒及學生管理功能。' },
  },
  uk: {
    landing: { title: 'Платформа керування для репетиторів і навчальних центрів | Tutlio', description: 'Керуйте заняттями, учнями, розкладом, списками очікування, оплатами, рахунками та нагадуваннями на одній платформі.' },
    pricing: { title: 'Ціни й тарифні плани платформи для репетиторів | Tutlio', description: 'Порівняйте плани Tutlio для приватних репетиторів і навчальних центрів: розклад, оплати, рахунки, нагадування та керування учнями.' },
  },
  he: {
    landing: { title: 'תוכנה לניהול מורים פרטיים ובתי ספר | Tutlio', description: 'ניהול שיעורים, תלמידים, מערכת שעות, רשימות המתנה, תשלומים, חשבוניות ותזכורות בפלטפורמה אחת להוראה פרטית.' },
    pricing: { title: 'מחירים ומסלולים לתוכנה לניהול הוראה פרטית | Tutlio', description: 'השוואת מסלולי Tutlio למורים פרטיים ולבתי ספר להוראה פרטית, כולל ניהול מערכת שעות, תשלומים, חשבוניות, תזכורות ותלמידים.' },
  },
  fil: {
    landing: { title: 'Software sa pamamahala para sa mga tutor at paaralan | Tutlio', description: 'Pamahalaan ang mga sesyon, estudyante, iskedyul, listahan ng naghihintay, bayad, invoice, at paalala sa iisang platform sa pagtuturo.' },
    pricing: { title: 'Mga presyo at plano ng software sa pagtuturo | Tutlio', description: 'Ihambing ang mga plano ng Tutlio para sa mga pribadong tutor at sentro ng pagtuturo, kasama ang pag-iskedyul, bayad, invoice, paalala, at pamamahala ng estudyante.' },
  },
  ja: {
    landing: { title: '講師・個別指導教室向け運営管理ソフト | Tutlio', description: 'レッスン、受講者、予定、キャンセル待ち、支払い、請求書、リマインダーをひとつの個別指導管理プラットフォームで管理できます。' },
    pricing: { title: '個別指導管理ソフトの料金・プラン | Tutlio', description: '個人講師・個別指導教室向けのTutlioプランを比較。予定管理、決済、請求書、リマインダー、受講者管理の機能が含まれます。' },
  },
  hi: {
    landing: { title: 'ट्यूटरों और ट्यूशन संस्थानों के लिए प्रबंधन सॉफ़्टवेयर | Tutlio', description: 'एक ट्यूशन प्रबंधन प्लेटफ़ॉर्म में क्लास, विद्यार्थी, समय-सारणी, प्रतीक्षा सूची, भुगतान, इनवॉइस और रिमाइंडर संभालें।' },
    pricing: { title: 'ट्यूशन सॉफ़्टवेयर की कीमतें और प्लान | Tutlio', description: 'व्यक्तिगत ट्यूटरों और ट्यूशन संस्थानों के लिए Tutlio प्लान की तुलना करें। समय-सारणी, भुगतान, इनवॉइस, रिमाइंडर और विद्यार्थी प्रबंधन शामिल हैं।' },
  },
  ko: {
    landing: { title: '개인 튜터와 교육기관을 위한 수업 관리 플랫폼 | Tutlio', description: '수업, 학생, 일정, 대기 목록, 결제, 청구서, 알림을 하나의 튜터링 관리 플랫폼에서 관리하세요.' },
    pricing: { title: '튜터링 관리 플랫폼 요금제 및 가격 | Tutlio', description: '일정, 결제, 청구서, 알림, 학생 관리가 포함된 개인 튜터와 튜터링 학교용 Tutlio 요금제를 비교하세요.' },
  },
  id: {
    landing: { title: 'Aplikasi Manajemen Tutor dan Bimbel | Tutlio', description: 'Kelola sesi les, siswa, jadwal, daftar tunggu, pembayaran, faktur, dan pengingat dalam satu platform pengelolaan bimbel.' },
    pricing: { title: 'Harga dan Paket Aplikasi Bimbel | Tutlio', description: 'Bandingkan paket Tutlio untuk tutor privat dan sekolah bimbel, lengkap dengan penjadwalan, pembayaran, faktur, pengingat, dan pengelolaan siswa.' },
  },
  ar: {
    landing: { title: 'برنامج إدارة الدروس الخصوصية للمدرّسين والمدارس | Tutlio', description: 'أدِر الدروس والطلاب والجدولة وقوائم الانتظار والمدفوعات والفواتير والتذكيرات في منصة واحدة لإدارة الدروس الخصوصية.' },
    pricing: { title: 'أسعار وخطط برنامج الدروس الخصوصية | Tutlio', description: 'قارن خطط Tutlio للمدرّسين الخصوصيين ومدارس الدروس الخصوصية، مع الجدولة والمدفوعات والفوترة والتذكيرات وإدارة الطلاب.' },
  },
  lt: {
    landing: { title: 'Korepetitorių ir mokyklų valdymo programa | Tutlio', description: 'Valdykite pamokas, mokinius, tvarkaraštį, laukimo eilę, mokėjimus, sąskaitas ir priminimus vienoje korepetitorių platformoje.' },
    pricing: { title: 'Korepetitorių platformos kainos ir planai | Tutlio', description: 'Peržiūrėkite Tutlio planus korepetitoriams ir mokykloms. Kalendorius, mokėjimai, sąskaitos, priminimai ir mokinių valdymas vienoje vietoje.' },
  },
  en: {
    landing: { title: 'Tutoring Management Software for Tutors & Schools | Tutlio', description: 'Manage lessons, students, scheduling, waitlists, payments, invoices, and reminders in one tutoring management platform.' },
    pricing: { title: 'Tutoring Software Pricing & Plans | Tutlio', description: 'Compare Tutlio plans for private tutors and tutoring schools, with scheduling, payments, invoicing, reminders, and student management included.' },
  },
  'es-mx': {
    landing: { title: 'Software para profesores particulares y escuelas | Tutlio', description: 'Gestione clases, alumnos, horarios, listas de espera, pagos, facturas y recordatorios en una sola plataforma de clases particulares.' },
    pricing: { title: 'Precios y planes del software de clases particulares | Tutlio', description: 'Compare los planes de Tutlio para profesores particulares y centros de clases particulares, con horarios, pagos, facturación, recordatorios y gestión de alumnos incluidos.' },
  },
  pt: {
    landing: { title: 'Software de gestão para explicadores e centros de explicações | Tutlio', description: 'Gira aulas, alunos, horários, listas de espera, pagamentos, faturas e lembretes numa única plataforma de gestão de explicações.' },
    pricing: { title: 'Preços e planos para a gestão de explicações | Tutlio', description: 'Compare os planos da Tutlio para explicadores independentes e centros de explicações, com marcação de aulas, pagamentos, faturação, lembretes e gestão de alunos.' },
  },
  'pt-br': {
    landing: { title: 'Sistema de gestão para professores particulares e escolas | Tutlio', description: 'Gerencie aulas, alunos, agendas, listas de espera, pagamentos, faturas e lembretes em uma única plataforma de gestão de aulas particulares.' },
    pricing: { title: 'Preços e planos do sistema para aulas particulares | Tutlio', description: 'Compare os planos da Tutlio para professores particulares e escolas de reforço, com agendamento, pagamentos, faturas, lembretes e gestão de alunos incluídos.' },
  },
  ro: {
    landing: { title: 'Platformă de gestionare pentru profesori și centre de meditații | Tutlio', description: 'Gestionează lecțiile, elevii, programările, listele de așteptare, plățile, facturile și mementourile într-o singură platformă pentru meditații.' },
    pricing: { title: 'Prețuri și planuri pentru gestionarea meditațiilor | Tutlio', description: 'Compară planurile Tutlio pentru profesori independenți și centre de meditații, cu programări, plăți, facturare, mementouri și gestionarea elevilor incluse.' },
  },
  it: {
    landing: { title: 'Software per la gestione di tutor e scuole | Tutlio', description: 'Gestisci lezioni, studenti, orari, liste d’attesa, pagamenti, fatture e promemoria in un’unica piattaforma per le ripetizioni.' },
    pricing: { title: 'Prezzi e piani del software per ripetizioni | Tutlio', description: 'Confronta i piani Tutlio per tutor privati e scuole di ripetizioni, con orari, pagamenti, fatturazione, promemoria e gestione degli studenti inclusi.' },
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
});

export function getSeoMeta(locale: Locale, page: CoreSeoPage): SeoMeta {
  return SEO_META[locale][page];
}
