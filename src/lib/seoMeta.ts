import { withEnglishLocaleFallback } from './i18n/locales.js';
import type { Locale } from './i18n/core.js';

export type CoreSeoPage = 'landing' | 'pricing' | 'forTutors';

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
    forTutors: { title: 'Software pro samostatné lektory doučování | Tutlio', description: 'Kalendář, samostatné rezervace studentů, platby Stripe, faktury, e-mailové připomínky a veřejná stránka lektora - vše pro samostatného lektora v jedné aplikaci. 7 dní zdarma.' },
  },
  sl: {
    landing: { title: 'Platforma za inštruktorje in inštrukcijska podjetja | Tutlio', description: 'Upravljajte ure, učence, urnike, čakalne sezname, plačila, račune in opomnike na eni platformi za inštrukcije.' },
    pricing: { title: 'Cene in paketi za inštruktorje in inštrukcijska podjetja | Tutlio', description: 'Primerjajte pakete Tutlio za samostojne inštruktorje in podjetja: urniki, plačila, računi, opomniki in upravljanje učencev.' },
    forTutors: { title: 'Programska oprema za samostojne inštruktorje | Tutlio', description: 'Koledar, samostojne rezervacije učencev, plačila Stripe, računi, e-poštni opomniki in javna stran inštruktorja - vse za samostojnega inštruktorja v eni aplikaciji. 7 dni brezplačno.' },
  },
  el: {
    landing: { title: 'Διαχείριση ιδιαίτερων μαθημάτων και φροντιστηρίων | Tutlio', description: 'Οργανώστε μαθήματα, μαθητές, προγράμματα, λίστες αναμονής, πληρωμές, τιμολόγια και υπενθυμίσεις σε μία πλατφόρμα για καθηγητές και φροντιστήρια.' },
    pricing: { title: 'Τιμές και προγράμματα για καθηγητές και φροντιστήρια | Tutlio', description: 'Συγκρίνετε τα προγράμματα Tutlio για ανεξάρτητους καθηγητές και επιχειρήσεις ιδιαίτερων μαθημάτων: προγραμματισμός, πληρωμές, τιμολόγηση και διαχείριση μαθητών.' },
    forTutors: { title: 'Λογισμικό για ανεξάρτητους καθηγητές ιδιαιτέρων | Tutlio', description: 'Ημερολόγιο, αυτόνομες κρατήσεις μαθητών, πληρωμές Stripe, τιμολόγια, υπενθυμίσεις email και δημόσια σελίδα καθηγητή - όλα για τον ανεξάρτητο καθηγητή σε μία εφαρμογή. 7 ημέρες δωρεάν.' },
  },
  hu: {
    landing: { title: 'Oktatásszervezés magántanároknak és vállalkozásoknak | Tutlio', description: 'Kezeld az órákat, diákokat, órarendeket, várólistákat, fizetéseket, számlákat és emlékeztetőket egyetlen oktatásszervezési platformon.' },
    pricing: { title: 'Oktatásszervezési csomagok és árak | Tutlio', description: 'Hasonlítsd össze a Tutlio csomagjait egyéni magántanároknak és oktatási vállalkozásoknak: óraszervezés, fizetések, számlázás, emlékeztetők és diákkezelés.' },
    forTutors: { title: 'Szoftver egyéni magántanároknak | Tutlio', description: 'Naptár, önálló diákfoglalás, Stripe-fizetések, számlák, e-mailes emlékeztetők és nyilvános tanári oldal - minden, ami egy egyéni magántanárnak kell, egyetlen alkalmazásban. 7 nap ingyen.' },
  },
  sk: {
    landing: { title: 'Softvér pre doučovateľov a doučovacie centrá | Tutlio', description: 'Spravujte hodiny, študentov, rozvrhy, čakacie listiny, platby, faktúry a pripomienky na jednej platforme pre doučovanie.' },
    pricing: { title: 'Ceny a plány pre doučovateľov a doučovacie centrá | Tutlio', description: 'Porovnajte plány Tutlio pre samostatných doučovateľov a doučovacie centrá s plánovaním, platbami, fakturáciou, pripomienkami a správou študentov.' },
    forTutors: { title: 'Softvér pre samostatných doučovateľov | Tutlio', description: 'Kalendár, samostatné rezervácie študentov, platby Stripe, faktúry, e-mailové pripomienky a verejná stránka doučovateľa - všetko pre samostatného doučovateľa v jednej aplikácii. 7 dní zadarmo.' },
  },
  bg: {
    landing: { title: 'Платформа за преподаватели и учебни центрове | Tutlio', description: 'Управлявайте уроци, ученици, графици, списъци на чакащите, плащания, фактури и напомняния в една платформа за преподавателската си дейност.' },
    pricing: { title: 'Цени и планове за преподаватели и учебни центрове | Tutlio', description: 'Сравнете плановете на Tutlio за самостоятелни преподаватели и учебни центрове с графици, плащания, фактури, напомняния и управление на ученици.' },
    forTutors: { title: 'Софтуер за самостоятелни частни преподаватели | Tutlio', description: 'Календар, самостоятелни резервации от ученици, плащания със Stripe, фактури, имейл напомняния и публична страница на преподавателя - всичко за самостоятелния преподавател в едно приложение. 7 дни безплатно.' },
  },
  hr: {
    landing: { title: 'Platforma za upravljanje instrukcijama i centrima | Tutlio', description: 'Upravljaj satovima, učenicima, rasporedom, listama čekanja, plaćanjima, računima i podsjetnicima na jednoj platformi za instrukcije.' },
    pricing: { title: 'Cijene i planovi platforme za instrukcije | Tutlio', description: 'Usporedi planove Tutlio za samostalne instruktore i centre za instrukcije: raspored, plaćanja, računi, podsjetnici i upravljanje učenicima.' },
    forTutors: { title: 'Softver za samostalne instruktore | Tutlio', description: 'Kalendar, samostalne rezervacije učenika, Stripe plaćanja, računi, e-mail podsjetnici i javna stranica instruktora - sve za samostalnog instruktora u jednoj aplikaciji. 7 dana besplatno.' },
  },
  th: {
    landing: { title: 'ระบบจัดการงานสอนสำหรับติวเตอร์และธุรกิจสอนพิเศษ | Tutlio', description: 'จัดการคาบเรียน นักเรียน ตาราง รายชื่อรอเรียน การชำระเงิน ใบแจ้งหนี้ และการแจ้งเตือนในแพลตฟอร์มสอนพิเศษเดียว' },
    pricing: { title: 'ราคาและแผนระบบจัดการงานสอนพิเศษ | Tutlio', description: 'เปรียบเทียบแผน Tutlio สำหรับติวเตอร์อิสระและธุรกิจสอนพิเศษ พร้อมการจัดตาราง ชำระเงิน ใบแจ้งหนี้ แจ้งเตือน และจัดการนักเรียน' },
    forTutors: { title: 'ซอฟต์แวร์สำหรับติวเตอร์อิสระ | Tutlio', description: 'ปฏิทิน การจองด้วยตนเองของนักเรียน การชำระเงินผ่าน Stripe ใบแจ้งหนี้ การแจ้งเตือนทางอีเมล และหน้าติวเตอร์สาธารณะ - ทุกอย่างสำหรับติวเตอร์อิสระในแอปเดียว ทดลองใช้ฟรี 7 วัน' },
  },
  tr: {"landing": {"title": "Özel ders öğretmenleri ve işletmeleri için yönetim platformu | Tutlio", "description": "Dersleri, öğrencileri, programları, bekleme listelerini, ödemeleri, faturaları ve hatırlatmaları tek özel ders yönetim platformunda yönetin."}, "pricing": {"title": "Özel ders yönetim platformu fiyatları ve planları | Tutlio", "description": "Bağımsız öğretmenler ve özel ders kurumları için planları karşılaştırın. Planlama, ödemeler, faturalar, hatırlatmalar ve öğrenci yönetimi dahildir."}, forTutors: { title: 'Bağımsız özel ders öğretmenleri için yazılım | Tutlio', description: 'Takvim, öğrencilerin kendi kendine rezervasyonu, Stripe ödemeleri, faturalar, e-posta hatırlatmaları ve herkese açık öğretmen sayfası - bağımsız bir öğretmenin ihtiyaç duyduğu her şey tek uygulamada. 7 gün ücretsiz.' }},
  'zh-hk': {
    landing: { title: '個人導師及補習機構管理平台 | Tutlio', description: '在同一補習管理平台安排課堂、管理學生、時間表、候補名單、付款、發票及提醒。' },
    pricing: { title: '補習管理平台價格與方案 | Tutlio', description: '比較適合私人導師及補習機構的 Tutlio 方案，包含排課、付款、發票、提醒及學生管理功能。' },
    forTutors: { title: '個人導師專用管理軟件 | Tutlio', description: '日曆、學生自助預約、Stripe 付款、發票、電郵提醒及公開導師頁面 - 個人導師所需的一切都在同一應用程式內。免費試用 7 天。' },
  },
  uk: {
    landing: { title: 'Платформа керування для репетиторів і навчальних центрів | Tutlio', description: 'Керуйте заняттями, учнями, розкладом, списками очікування, оплатами, рахунками та нагадуваннями на одній платформі.' },
    pricing: { title: 'Ціни й тарифні плани платформи для репетиторів | Tutlio', description: 'Порівняйте плани Tutlio для приватних репетиторів і навчальних центрів: розклад, оплати, рахунки, нагадування та керування учнями.' },
    forTutors: { title: 'Програма для приватних репетиторів | Tutlio', description: 'Календар, самостійне бронювання учнями, оплати Stripe, рахунки, нагадування електронною поштою та публічна сторінка репетитора - усе для приватного репетитора в одному застосунку. 7 днів безкоштовно.' },
  },
  he: {
    landing: { title: 'תוכנה לניהול מורים פרטיים ובתי ספר | Tutlio', description: 'ניהול שיעורים, תלמידים, מערכת שעות, רשימות המתנה, תשלומים, חשבוניות ותזכורות בפלטפורמה אחת להוראה פרטית.' },
    pricing: { title: 'מחירים ומסלולים לתוכנה לניהול הוראה פרטית | Tutlio', description: 'השוואת מסלולי Tutlio למורים פרטיים ולבתי ספר להוראה פרטית, כולל ניהול מערכת שעות, תשלומים, חשבוניות, תזכורות ותלמידים.' },
    forTutors: { title: 'תוכנה למורים פרטיים עצמאיים | Tutlio', description: 'יומן, הזמנת שיעורים עצמאית לתלמידים, תשלומי Stripe, חשבוניות, תזכורות במייל ודף מורה ציבורי - כל מה שמורה פרטי עצמאי צריך באפליקציה אחת. 7 ימי ניסיון חינם.' },
  },
  fil: {
    landing: { title: 'Software sa pamamahala para sa mga tutor at paaralan | Tutlio', description: 'Pamahalaan ang mga sesyon, estudyante, iskedyul, listahan ng naghihintay, bayad, invoice, at paalala sa iisang platform sa pagtuturo.' },
    pricing: { title: 'Mga presyo at plano ng software sa pagtuturo | Tutlio', description: 'Ihambing ang mga plano ng Tutlio para sa mga pribadong tutor at sentro ng pagtuturo, kasama ang pag-iskedyul, bayad, invoice, paalala, at pamamahala ng estudyante.' },
    forTutors: { title: 'Software para sa mga independiyenteng tutor | Tutlio', description: 'Kalendaryo, self-booking ng mga estudyante, mga bayad sa Stripe, invoice, paalala sa email at pampublikong pahina ng tutor - lahat ng kailangan ng solo tutor sa iisang app. 7 araw na libre.' },
  },
  ja: {
    landing: { title: '講師・個別指導教室向け運営管理ソフト | Tutlio', description: 'レッスン、受講者、予定、キャンセル待ち、支払い、請求書、リマインダーをひとつの個別指導管理プラットフォームで管理できます。' },
    pricing: { title: '個別指導管理ソフトの料金・プラン | Tutlio', description: '個人講師・個別指導教室向けのTutlioプランを比較。予定管理、決済、請求書、リマインダー、受講者管理の機能が含まれます。' },
    forTutors: { title: '個人講師向けレッスン管理アプリ | Tutlio', description: 'カレンダー、受講者のセルフ予約、Stripe決済、請求書、メールリマインダー、講師の公開ページ - 個人講師に必要なものをひとつのアプリに。7日間無料。' },
  },
  hi: {
    landing: { title: 'ट्यूटरों और ट्यूशन संस्थानों के लिए प्रबंधन सॉफ़्टवेयर | Tutlio', description: 'एक ट्यूशन प्रबंधन प्लेटफ़ॉर्म में क्लास, विद्यार्थी, समय-सारणी, प्रतीक्षा सूची, भुगतान, इनवॉइस और रिमाइंडर संभालें।' },
    pricing: { title: 'ट्यूशन सॉफ़्टवेयर की कीमतें और प्लान | Tutlio', description: 'व्यक्तिगत ट्यूटरों और ट्यूशन संस्थानों के लिए Tutlio प्लान की तुलना करें। समय-सारणी, भुगतान, इनवॉइस, रिमाइंडर और विद्यार्थी प्रबंधन शामिल हैं।' },
    forTutors: { title: 'स्वतंत्र ट्यूटरों के लिए सॉफ़्टवेयर | Tutlio', description: 'कैलेंडर, विद्यार्थियों की स्वयं बुकिंग, Stripe भुगतान, इनवॉइस, ईमेल रिमाइंडर और सार्वजनिक ट्यूटर पेज - एक स्वतंत्र ट्यूटर की हर ज़रूरत एक ही ऐप में। 7 दिन मुफ़्त।' },
  },
  ko: {
    landing: { title: '개인 튜터와 교육기관을 위한 수업 관리 플랫폼 | Tutlio', description: '수업, 학생, 일정, 대기 목록, 결제, 청구서, 알림을 하나의 튜터링 관리 플랫폼에서 관리하세요.' },
    pricing: { title: '튜터링 관리 플랫폼 요금제 및 가격 | Tutlio', description: '일정, 결제, 청구서, 알림, 학생 관리가 포함된 개인 튜터와 튜터링 학교용 Tutlio 요금제를 비교하세요.' },
    forTutors: { title: '개인 튜터를 위한 수업 관리 앱 | Tutlio', description: '캘린더, 학생 셀프 예약, Stripe 결제, 청구서, 이메일 알림, 공개 튜터 페이지까지 - 개인 튜터에게 필요한 모든 것을 하나의 앱에서. 7일 무료 체험.' },
  },
  id: {
    landing: { title: 'Aplikasi Manajemen Tutor dan Bimbel | Tutlio', description: 'Kelola sesi les, siswa, jadwal, daftar tunggu, pembayaran, faktur, dan pengingat dalam satu platform pengelolaan bimbel.' },
    pricing: { title: 'Harga dan Paket Aplikasi Bimbel | Tutlio', description: 'Bandingkan paket Tutlio untuk tutor privat dan sekolah bimbel, lengkap dengan penjadwalan, pembayaran, faktur, pengingat, dan pengelolaan siswa.' },
    forTutors: { title: 'Aplikasi untuk tutor privat mandiri | Tutlio', description: 'Kalender, pemesanan mandiri oleh siswa, pembayaran Stripe, faktur, pengingat email, dan halaman tutor publik - semua yang dibutuhkan tutor mandiri dalam satu aplikasi. Gratis 7 hari.' },
  },
  ar: {
    landing: { title: 'برنامج إدارة الدروس الخصوصية للمدرّسين والمدارس | Tutlio', description: 'أدِر الدروس والطلاب والجدولة وقوائم الانتظار والمدفوعات والفواتير والتذكيرات في منصة واحدة لإدارة الدروس الخصوصية.' },
    pricing: { title: 'أسعار وخطط برنامج الدروس الخصوصية | Tutlio', description: 'قارن خطط Tutlio للمدرّسين الخصوصيين ومدارس الدروس الخصوصية، مع الجدولة والمدفوعات والفوترة والتذكيرات وإدارة الطلاب.' },
    forTutors: { title: 'برنامج للمدرّسين الخصوصيين المستقلين | Tutlio', description: 'تقويم، حجز ذاتي للطلاب، مدفوعات Stripe، فواتير، تذكيرات بالبريد الإلكتروني وصفحة مدرّس عامة - كل ما يحتاجه المدرّس المستقل في تطبيق واحد. 7 أيام مجانًا.' },
  },
  lt: {
    landing: { title: 'Korepetitorių ir mokyklų valdymo programa | Tutlio', description: 'Valdykite pamokas, mokinius, tvarkaraštį, laukimo eilę, mokėjimus, sąskaitas ir priminimus vienoje korepetitorių platformoje.' },
    pricing: { title: 'Korepetitorių platformos kainos ir planai | Tutlio', description: 'Peržiūrėkite Tutlio planus korepetitoriams ir mokykloms. Kalendorius, mokėjimai, sąskaitos, priminimai ir mokinių valdymas vienoje vietoje.' },
    forTutors: { title: 'Programa korepetitoriams: kalendorius ir mokėjimai | Tutlio', description: 'Kalendorius, mokinių registracija, Stripe mokėjimai, sąskaitos, priminimai ir vizitinė kortelė - viskas individualiam korepetitoriui vienoje vietoje. 7 dienos nemokamai.' },
  },
  en: {
    landing: { title: 'Tutoring Management Software for Tutors & Schools | Tutlio', description: 'Manage lessons, students, scheduling, waitlists, payments, invoices, and reminders in one tutoring management platform.' },
    pricing: { title: 'Tutoring Software Pricing & Plans | Tutlio', description: 'Compare Tutlio plans for private tutors and tutoring schools, with scheduling, payments, invoicing, reminders, and student management included.' },
    forTutors: { title: 'Tutoring Software for Private Tutors | Tutlio', description: 'Calendar, student self-booking, Stripe payments, invoices, email reminders and a public tutor page - everything a solo tutor needs in one app. 7-day free trial.' },
  },
  'es-mx': {
    landing: { title: 'Software para profesores particulares y escuelas | Tutlio', description: 'Gestione clases, alumnos, horarios, listas de espera, pagos, facturas y recordatorios en una sola plataforma de clases particulares.' },
    pricing: { title: 'Precios y planes del software de clases particulares | Tutlio', description: 'Compare los planes de Tutlio para profesores particulares y centros de clases particulares, con horarios, pagos, facturación, recordatorios y gestión de alumnos incluidos.' },
    forTutors: { title: 'Software para profesores particulares independientes | Tutlio', description: 'Calendario, reservas de alumnos, pagos con Stripe, facturas, recordatorios por correo y página pública: todo para el profesor particular en una sola app. 7 días gratis.' },
  },
  pt: {
    landing: { title: 'Software de gestão para explicadores e centros de explicações | Tutlio', description: 'Gira aulas, alunos, horários, listas de espera, pagamentos, faturas e lembretes numa única plataforma de gestão de explicações.' },
    pricing: { title: 'Preços e planos para a gestão de explicações | Tutlio', description: 'Compare os planos da Tutlio para explicadores independentes e centros de explicações, com marcação de aulas, pagamentos, faturação, lembretes e gestão de alunos.' },
    forTutors: { title: 'Software para explicadores independentes | Tutlio', description: 'Agenda, marcações pelos alunos, pagamentos Stripe, faturas, lembretes por e-mail e página pública do explicador - tudo o que um explicador independente precisa numa só aplicação. 7 dias grátis.' },
  },
  'pt-br': {
    landing: { title: 'Sistema de gestão para professores particulares e escolas | Tutlio', description: 'Gerencie aulas, alunos, agendas, listas de espera, pagamentos, faturas e lembretes em uma única plataforma de gestão de aulas particulares.' },
    pricing: { title: 'Preços e planos do sistema para aulas particulares | Tutlio', description: 'Compare os planos da Tutlio para professores particulares e escolas de reforço, com agendamento, pagamentos, faturas, lembretes e gestão de alunos incluídos.' },
    forTutors: { title: 'Sistema para professores particulares autônomos | Tutlio', description: 'Agenda, agendamento pelos alunos, pagamentos Stripe, faturas, lembretes por e-mail e página pública do professor - tudo o que um professor particular precisa em um único app. 7 dias grátis.' },
  },
  ro: {
    landing: { title: 'Platformă de gestionare pentru profesori și centre de meditații | Tutlio', description: 'Gestionează lecțiile, elevii, programările, listele de așteptare, plățile, facturile și mementourile într-o singură platformă pentru meditații.' },
    pricing: { title: 'Prețuri și planuri pentru gestionarea meditațiilor | Tutlio', description: 'Compară planurile Tutlio pentru profesori independenți și centre de meditații, cu programări, plăți, facturare, mementouri și gestionarea elevilor incluse.' },
    forTutors: { title: 'Software pentru profesori particulari independenți | Tutlio', description: 'Calendar, programări făcute de elevi, plăți Stripe, facturi, mementouri prin e-mail și pagină publică de profesor - tot ce are nevoie un profesor independent într-o singură aplicație. 7 zile gratuit.' },
  },
  it: {
    landing: { title: 'Software per la gestione di tutor e scuole | Tutlio', description: 'Gestisci lezioni, studenti, orari, liste d’attesa, pagamenti, fatture e promemoria in un’unica piattaforma per le ripetizioni.' },
    pricing: { title: 'Prezzi e piani del software per ripetizioni | Tutlio', description: 'Confronta i piani Tutlio per tutor privati e scuole di ripetizioni, con orari, pagamenti, fatturazione, promemoria e gestione degli studenti inclusi.' },
    forTutors: { title: 'Software per tutor privati indipendenti | Tutlio', description: 'Calendario, prenotazioni autonome degli studenti, pagamenti Stripe, fatture, promemoria via e-mail e pagina pubblica del tutor - tutto ciò che serve a un tutor indipendente in un’unica app. 7 giorni gratis.' },
  },
  pl: {
    landing: { title: 'Program do zarządzania korepetycjami i szkołą | Tutlio', description: 'Zarządzaj lekcjami, uczniami, grafikiem, listą oczekujących, płatnościami, fakturami i przypomnieniami w jednej platformie.' },
    pricing: { title: 'Cennik programu dla korepetytorów i szkół | Tutlio', description: 'Porównaj plany Tutlio dla korepetytorów i szkół: grafik, płatności, faktury, przypomnienia i zarządzanie uczniami.' },
    forTutors: { title: 'Program dla korepetytora: kalendarz i płatności | Tutlio', description: 'Kalendarz, rezerwacje uczniów, płatności Stripe, faktury, przypomnienia e-mail i publiczna wizytówka - wszystko dla korepetytora solo w jednej aplikacji. 7 dni za darmo.' },
  },
  lv: {
    landing: { title: 'Privātskolotāju pārvaldības programma | Tutlio', description: 'Pārvaldiet nodarbības, audzēkņus, grafiku, gaidīšanas sarakstu, maksājumus, rēķinus un atgādinājumus vienā platformā.' },
    pricing: { title: 'Privātskolotāju programmas cenas un plāni | Tutlio', description: 'Salīdziniet Tutlio plānus privātskolotājiem un mācību centriem ar grafiku, maksājumiem, rēķiniem un audzēkņu pārvaldību.' },
    forTutors: { title: 'Programma privātskolotājiem: kalendārs un maksājumi | Tutlio', description: 'Kalendārs, audzēkņu pašrezervācija, Stripe maksājumi, rēķini, e-pasta atgādinājumi un publiska vizītkarte - viss privātskolotājam vienā lietotnē. 7 dienas bez maksas.' },
  },
  ee: {
    landing: { title: 'Eraõpetajate ja õppekeskuste haldustarkvara | Tutlio', description: 'Hallake tunde, õpilasi, tunniplaani, ootenimekirja, makseid, arveid ja meeldetuletusi ühes eraõpetajate platvormis.' },
    pricing: { title: 'Eraõpetajate tarkvara hinnad ja paketid | Tutlio', description: 'Võrrelge Tutlio pakette eraõpetajatele ja õppekeskustele: tunniplaan, maksed, arved, meeldetuletused ja õpilaste haldus.' },
    forTutors: { title: 'Tarkvara eraõpetajale: kalender ja maksed | Tutlio', description: 'Kalender, õpilaste iseseisev broneerimine, Stripe’i maksed, arved, e-posti meeldetuletused ja avalik õpetaja leht - kõik eraõpetajale ühes rakenduses. 7 päeva tasuta.' },
  },
  fr: {
    landing: { title: 'Logiciel de gestion des cours particuliers | Tutlio', description: 'Gérez cours, élèves, planning, liste d’attente, paiements, factures et rappels dans une seule plateforme de soutien scolaire.' },
    pricing: { title: 'Tarifs du logiciel de gestion de cours particuliers | Tutlio', description: 'Comparez les offres Tutlio pour professeurs particuliers et écoles : planning, paiements, factures, rappels et gestion des élèves.' },
    forTutors: { title: 'Logiciel pour professeur particulier indépendant | Tutlio', description: 'Agenda, réservations des élèves, paiements Stripe, factures, rappels e-mail et page publique : tout pour le professeur particulier dans une seule app. 7 jours gratuits.' },
  },
  es: {
    landing: { title: 'Software para profesores y academias | Tutlio', description: 'Gestiona clases, alumnos, horarios, lista de espera, pagos, facturas y recordatorios en una sola plataforma educativa.' },
    pricing: { title: 'Precios del software para profesores y academias | Tutlio', description: 'Compara los planes de Tutlio para profesores particulares y academias con horarios, pagos, facturas, recordatorios y gestión de alumnos.' },
    forTutors: { title: 'Software para profesores particulares independientes | Tutlio', description: 'Calendario, reservas de alumnos, pagos con Stripe, facturas, recordatorios por correo y página pública: todo para el profesor particular en una sola app. 7 días gratis.' },
  },
  de: {
    landing: { title: 'Software für Nachhilfelehrer und Lerninstitute | Tutlio', description: 'Verwalten Sie Unterricht, Schüler, Termine, Wartelisten, Zahlungen, Rechnungen und Erinnerungen auf einer zentralen Plattform.' },
    pricing: { title: 'Preise für Nachhilfelehrer- und Schulsoftware | Tutlio', description: 'Vergleichen Sie Tutlio-Tarife für Nachhilfelehrer und Lerninstitute – mit Terminplanung, Zahlungen, Rechnungen und Schülerverwaltung.' },
    forTutors: { title: 'Software für selbstständige Nachhilfelehrer | Tutlio', description: 'Kalender, Schülerbuchungen, Stripe-Zahlungen, Rechnungen, E-Mail-Erinnerungen und öffentliche Profilseite: alles für selbstständige Nachhilfelehrer in einer App. 7 Tage gratis.' },
  },
  se: {
    landing: { title: 'System för privatlärare och läxhjälp | Tutlio', description: 'Hantera lektioner, elever, schema, väntelista, betalningar, fakturor och påminnelser i en gemensam plattform.' },
    pricing: { title: 'Priser och planer för läraradministration | Tutlio', description: 'Jämför Tutlios planer för privatlärare och läxhjälpsföretag med schema, betalningar, fakturor, påminnelser och elevhantering.' },
    forTutors: { title: 'Program för privatlärare som jobbar själva | Tutlio', description: 'Kalender, elevbokning, Stripe-betalningar, fakturor, e-postpåminnelser och en offentlig lärarsida - allt en privatlärare behöver i en app. 7 dagars gratis provperiod.' },
  },
  dk: {
    landing: { title: 'Software til privatundervisere og lektiehjælp | Tutlio', description: 'Administrer lektioner, elever, kalender, venteliste, betalinger, fakturaer og påmindelser på én samlet platform.' },
    pricing: { title: 'Priser på software til privatundervisere | Tutlio', description: 'Sammenlign Tutlios planer til privatundervisere og lektiehjælpsvirksomheder med kalender, betalinger, fakturaer og elevstyring.' },
    forTutors: { title: 'Software til selvstændige privatundervisere | Tutlio', description: 'Kalender, elevbooking, Stripe-betalinger, fakturaer, e-mailpåmindelser og en offentlig underviserside - alt en privatunderviser behøver i én app. 7 dages gratis prøve.' },
  },
  fi: {
    landing: { title: 'Ohjelmisto yksityisopettajille ja opetuskeskuksille | Tutlio', description: 'Hallitse oppitunteja, oppilaita, aikatauluja, jonotuslistaa, maksuja, laskuja ja muistutuksia yhdellä alustalla.' },
    pricing: { title: 'Yksityisopettajien ohjelmiston hinnat ja paketit | Tutlio', description: 'Vertaile Tutlion paketteja yksityisopettajille ja opetuskeskuksille: aikataulut, maksut, laskut, muistutukset ja oppilashallinta.' },
    forTutors: { title: 'Ohjelmisto itsenäiselle yksityisopettajalle | Tutlio', description: 'Kalenteri, oppilaiden itsevaraus, Stripe-maksut, laskut, muistutukset ja julkinen opettajasivu - kaikki yksityisopettajalle yhdessä sovelluksessa. 7 päivää ilmaiseksi.' },
  },
  no: {
    landing: { title: 'Program for privatlærere og leksehjelp | Tutlio', description: 'Administrer timer, elever, kalender, venteliste, betalinger, fakturaer og påminnelser i én samlet plattform.' },
    pricing: { title: 'Priser på programvare for privatlærere | Tutlio', description: 'Sammenlign Tutlio-planer for privatlærere og leksehjelpsbedrifter med kalender, betalinger, fakturaer, påminnelser og elevstyring.' },
    forTutors: { title: 'Program for selvstendige privatlærere | Tutlio', description: 'Kalender, elevbooking, Stripe-betalinger, fakturaer, e-postpåminnelser og en offentlig lærerside - alt en privatlærer trenger i én app. 7 dagers gratis prøveperiode.' },
  },
  nl: {
    landing: { title: 'Software voor bijlesdocenten en instituten | Tutlio', description: 'Beheer lessen, leerlingen, planning, wachtlijsten, betalingen, facturen en herinneringen in één platform voor bijles.' },
    pricing: { title: 'Prijzen van bijlesmanagementsoftware | Tutlio', description: 'Vergelijk Tutlio-abonnementen voor bijlesdocenten en instituten met planning, betalingen, facturen, herinneringen en leerlingbeheer.' },
    forTutors: { title: 'Software voor zelfstandige bijlesdocenten | Tutlio', description: 'Agenda, leerlingen boeken zelf, Stripe-betalingen, facturen, e-mailherinneringen en een openbare docentpagina: alles voor de bijlesdocent in één app. 7 dagen gratis.' },
  },
});

export function getSeoMeta(locale: Locale, page: CoreSeoPage): SeoMeta {
  return SEO_META[locale][page];
}
