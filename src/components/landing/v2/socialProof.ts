import { withEnglishLocaleFallback } from '@/lib/i18n/locales';
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

const SOCIAL_PROOF: Record<Locale, LocalizedSocialProof> = withEnglishLocaleFallback({
  cs: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Čtyři měsíce vybírání plateb bez týdenního chaosu v tabulkách',
      logo: null,
      stats: [{ value: '38%', label: 'méně opožděných plateb' }, { value: '2.4×', label: 'rychlejší doručování faktur' }],
      quote: [
        { text: 'Každý pátek jsme kontrolovali, kdo zaplatil. Teď ' },
        { text: 'hned vidíme čísla a rodičovské účty', emphasis: true },
        { text: ' a lektoři si sami zapisují lekce. Naše administrativní zátěž klesla alespoň na polovinu.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Vedoucí provozu, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Samostatný lektor, Londýn', quote: 'Kalendář a faktury mám konečně na jednom místě. Rodiče mi už každý týden nepíšou, kolik dluží.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Správkyně školy, Bristol', quote: 'Jedenáct lektorů bylo rozděleno do tří tabulek. Teď vidím dostupnost na první pohled.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Majitel doučovacího centra, Manchester', quote: 'Vidíme kapacitu i příjmy podle lektorů. Měsíční přehled už nezabere celý večer.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Lektorka angličtiny, Leeds', quote: 'Studenti si sami rezervují termíny a já je jen schvaluji. Začít bylo mnohem snazší, než jsem čekala.', photo: photos.teacher, rating: 4 },
    ],
  },
  sl: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Štirje meseci prejemanja plačil brez tedenske zmede s preglednicami',
      logo: null,
      stats: [
        { value: '38%', label: 'manj zamud pri plačilih' },
        { value: '2.4×', label: 'hitrejše pošiljanje računov' },
      ],
      quote: [
        { text: 'Vsak petek smo preverjali, kdo je plačal. Zdaj ' },
        { text: 'so številke in uporabniški računi staršev vidni takoj', emphasis: true },
        { text: ', inštruktorji pa sami beležijo svoje ure. Naša administrativna obremenitev se je zmanjšala vsaj za polovico.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Vodja poslovanja, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Samostojni inštruktor, London', quote: 'Moj koledar in računi so končno na enem mestu. Starši mi ne pišejo več vsak teden z vprašanjem, koliko dolgujejo.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Šolska skrbnica, Bristol', quote: 'Enajst inštruktorjev je bilo razporejenih po treh preglednicah. Zdaj razpoložljivost vidim na prvi pogled.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Lastnik inštrukcijskega centra, Manchester', quote: 'Vidimo zmogljivost in prihodke po inštruktorjih. Mesečni pregled ne vzame več celega večera.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Inštruktorica angleščine, Leeds', quote: 'Učenci sami rezervirajo termine, jaz jih samo potrdim. Začetek je bil veliko lažji, kot sem pričakovala.', photo: photos.teacher, rating: 4 },
    ],
  },
  el: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Τέσσερις μήνες είσπραξης πληρωμών χωρίς το εβδομαδιαίο χάος των υπολογιστικών φύλλων',
      logo: null,
      stats: [{ value: '38%', label: 'λιγότερες καθυστερημένες πληρωμές' }, { value: '2.4×', label: 'ταχύτερη παράδοση τιμολογίων' }],
      quote: [
        { text: 'Περνούσαμε κάθε Παρασκευή ελέγχοντας ποιοι είχαν πληρώσει. Τώρα ' },
        { text: 'τα ποσά και οι λογαριασμοί γονέων είναι άμεσα ορατά', emphasis: true },
        { text: ', ενώ οι καθηγητές καταχωρίζουν τα μαθήματά τους. Ο φόρτος διαχείρισής μας έχει μειωθεί τουλάχιστον στο μισό.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Υπεύθυνη λειτουργίας, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Καθηγητής ιδιαίτερων μαθημάτων, Λονδίνο', quote: 'Το ημερολόγιο και τα τιμολόγιά μου βρίσκονται επιτέλους σε ένα σημείο. Οι γονείς δεν μου στέλνουν πλέον μήνυμα κάθε εβδομάδα για να ρωτήσουν πόσα οφείλουν.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Διαχειρίστρια σχολής, Μπρίστολ', quote: 'Τα στοιχεία έντεκα καθηγητών ήταν διάσπαρτα σε τρία υπολογιστικά φύλλα. Τώρα βλέπω τη διαθεσιμότητα με μια ματιά.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Ιδιοκτήτης επιχείρησης, Μάντσεστερ', quote: 'Βλέπουμε τη δυναμικότητα και τα έσοδα ανά καθηγητή. Η μηνιαία επισκόπηση δεν απαιτεί πλέον ένα ολόκληρο βράδυ.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Καθηγήτρια αγγλικών, Λιντς', quote: 'Οι μαθητές κλείνουν μόνοι τους τις ώρες τους και εγώ απλώς τις εγκρίνω. Το ξεκίνημα ήταν πολύ ευκολότερο απ’ ό,τι περίμενα.', photo: photos.teacher, rating: 4 },
    ],
  },
  tr: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Haftalık tablo karmaşası olmadan dört aydır ödeme topluyoruz',
      logo: null,
      stats: [{ value: '38%', label: 'daha az gecikmiş ödeme' }, { value: '2.4×', label: 'daha hızlı fatura iletimi' }],
      quote: [
        { text: 'Eskiden her cuma kimin ödeme yaptığını kontrol etmekle uğraşırdık. Artık ' },
        { text: 'rakamları ve veli hesaplarını anında görebiliyoruz', emphasis: true },
        { text: '; öğretmenler de kendi derslerini kaydediyor. İdari iş yükümüz en az yarı yarıya azaldı.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Operasyon sorumlusu, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Özel ders öğretmeni, Londra', quote: 'Takvimim ve faturalarım sonunda tek yerde. Veliler artık ne kadar borçları olduğunu sormak için her hafta mesaj atmıyor.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Okul yöneticisi, Bristol', quote: 'On bir öğretmenin bilgileri eskiden üç ayrı tablodaydı. Artık müsait saatleri bir bakışta görebiliyorum.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Özel ders kurumu sahibi, Manchester', quote: 'Öğretmen bazında kapasiteyi ve geliri görebiliyoruz. Aylık değerlendirme artık bütün akşamı almıyor.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'İngilizce öğretmeni, Leeds', quote: 'Öğrenciler ders saatlerini kendileri seçip rezervasyon yapıyor, ben de onaylıyorum. Başlamak beklediğimden çok daha kolaydı.', photo: photos.teacher, rating: 4 },
    ],
  },
  hu: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Négy hónap fizetésbeszedés a heti táblázatkáosz nélkül',
      logo: null,
      stats: [{ value: '38%', label: 'kevesebb késedelmes fizetés' }, { value: '2.4×', label: 'gyorsabb számlaküldés' }],
      quote: [
        { text: 'Korábban minden pénteken azt ellenőriztük, ki fizetett. Most ' },
        { text: 'a számok és a szülői fiókok azonnal láthatók', emphasis: true },
        { text: ', a magántanárok pedig maguk rögzítik az óráikat. Az adminisztrációs terhelésünk legalább a felére csökkent.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Operatív vezető, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Magántanár, London', quote: 'A naptáram és a számláim végre egy helyen vannak. A szülők már nem írnak hetente, hogy megkérdezzék, mennyivel tartoznak.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Iskolai adminisztrátor, Bristol', quote: 'Korábban tizenegy magántanár adatai három táblázatban voltak szétszórva. Most egy pillantással látom a szabad időpontokat.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Oktatási vállalkozás tulajdonosa, Manchester', quote: 'Magántanáronként látjuk a kapacitást és a bevételt. A havi áttekintés már nem vesz el egy egész estét.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Angoltanár, Leeds', quote: 'A diákok maguk foglalnak időpontot, én pedig csak jóváhagyom. Sokkal könnyebb volt elkezdeni, mint vártam.', photo: photos.teacher, rating: 4 },
    ],
  },
  sk: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Štyri mesiace výberu platieb bez týždenného chaosu v tabuľkách',
      logo: null,
      stats: [{ value: '38%', label: 'menej oneskorených platieb' }, { value: '2.4×', label: 'rýchlejšie doručovanie faktúr' }],
      quote: [
        { text: 'Každý piatok sme kontrolovali, kto zaplatil. Teraz ' },
        { text: 'hneď vidíme čísla a rodičovské účty', emphasis: true },
        { text: ' a doučovatelia si zaznamenávajú hodiny sami. Naša administratívna záťaž sa znížila aspoň na polovicu.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Vedúca prevádzky, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Súkromný doučovateľ, Londýn', quote: 'Môj kalendár a faktúry sú konečne na jednom mieste. Rodičia mi už každý týždeň nepíšu, aby sa spýtali, koľko dlhujú.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Školská správkyňa, Bristol', quote: 'Jedenásť doučovateľov bolo kedysi rozdelených do troch tabuliek. Teraz vidím dostupnosť na prvý pohľad.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Vlastník centra, Manchester', quote: 'Vidíme kapacitu a príjmy podľa doučovateľa. Mesačný prehľad už nezaberá celý večer.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Doučovateľka angličtiny, Leeds', quote: 'Študenti si rezervujú termíny sami a ja ich len schvaľujem. Začiatok bol oveľa jednoduchší, než som čakala.', photo: photos.teacher, rating: 4 },
    ],
  },
  hr: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Četiri mjeseca naplate bez tjednog kaosa u tablicama',
      logo: null,
      stats: [{ value: '38%', label: 'manje zakašnjelih plaćanja' }, { value: '2.4×', label: 'brža dostava računa' }],
      quote: [
        { text: 'Prije smo svaki petak provjeravali tko je platio. Sada su ' },
        { text: 'brojke i roditeljski računi odmah vidljivi', emphasis: true },
        { text: ', a instruktori sami evidentiraju svoje satove. Naše administrativno opterećenje smanjeno je barem upola.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Voditeljica poslovanja, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Samostalni instruktor, London', quote: 'Moj kalendar i računi napokon su na jednom mjestu. Roditelji mi više ne pišu svaki tjedan kako bi pitali koliko duguju.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Školska administratorica, Bristol', quote: 'Podaci o jedanaest instruktora prije su bili u tri tablice. Sada odmah vidim dostupnost.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Vlasnik centra, Manchester', quote: 'Vidimo kapacitet i prihod po instruktoru. Mjesečni pregled više ne oduzima cijelu večer.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Instruktorica engleskog jezika, Leeds', quote: 'Učenici sami rezerviraju termine, a ja ih samo potvrđujem. Početak je bio mnogo lakši nego što sam očekivala.', photo: photos.teacher, rating: 4 },
    ],
  },
  bg: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Четири месеца събиране на плащания без седмичния хаос в таблиците',
      logo: null,
      stats: [
        { value: '38%', label: 'по-малко закъснели плащания' },
        { value: '2.4×', label: 'по-бързо изпращане на фактури' },
      ],
      quote: [
        { text: 'Прекарвахме всеки петък в проверка кой е платил. Сега ' },
        { text: 'числата и родителските акаунти се виждат веднага', emphasis: true },
        { text: ', а преподавателите сами отбелязват уроците си. Административната ни работа намаля поне наполовина.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Оперативен ръководител, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Частен преподавател, Лондон', quote: 'Календарът и фактурите ми най-после са на едно място. Родителите вече не ми пишат всяка седмица, за да питат колко дължат.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Училищен администратор, Бристол', quote: 'Единадесет преподаватели бяха разпределени в три таблици. Сега виждам свободното време с един поглед.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Собственик на учебен център, Манчестър', quote: 'Виждаме капацитета и приходите по преподаватели. Месечният преглед вече не отнема цяла вечер.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Преподавател по английски, Лийдс', quote: 'Учениците сами записват часовете си, а аз само ги одобрявам. Началото беше много по-лесно, отколкото очаквах.', photo: photos.teacher, rating: 4 },
    ],
  },
  he: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'ארבעה חודשים של גביית תשלומים בלי הבלגן השבועי בגיליונות',
      logo: null,
      stats: [{ value: '38%', label: 'פחות תשלומים באיחור' }, { value: '2.4×', label: 'שליחת חשבוניות מהירה יותר' }],
      quote: [
        { text: 'בעבר הקדשנו כל יום שישי לבדיקה מי שילם. עכשיו ' },
        { text: 'המספרים וחשבונות ההורים גלויים מיד', emphasis: true },
        { text: ', והמורים מתעדים בעצמם את השיעורים שלהם. עומס הניהול שלנו ירד לפחות בחצי.' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'מנהלת תפעול, Northbridge Tutors',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'מורה פרטי, לונדון', quote: 'היומן והחשבוניות שלי סוף סוף במקום אחד. הורים כבר לא שולחים לי הודעות בכל שבוע כדי לשאול כמה הם חייבים.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'מנהלת בית ספר, בריסטול', quote: 'אחד־עשר מורים היו מפוזרים בעבר בשלושה גיליונות. עכשיו אפשר לראות זמינות במבט אחד.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'בעל סוכנות, מנצ׳סטר', quote: 'אנחנו רואים קיבולת והכנסות לפי מורה. הסקירה החודשית כבר לא דורשת ערב שלם.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'מורה לאנגלית, לידס', quote: 'התלמידים מזמינים בעצמם מועדים ואני פשוט מאשרת אותם. להתחיל היה הרבה יותר קל ממה שציפיתי.', photo: photos.teacher, rating: 4 },
    ],
  },
  'zh-hk': {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: '四個月順利收款，告別每週整理試算表的混亂',
      logo: null,
      stats: [{ value: '38%', label: '逾期付款減少' }, { value: '2.4×', label: '發票發送更快' }],
      quote: [
        { text: '以前我們每逢星期五都要核對誰已付款。現在' },
        { text: '可以即時查看數字及家長帳戶', emphasis: true },
        { text: '，而導師會自行記錄課堂。行政工作量最少減半。' },
      ],
      authorName: 'Olivia Taylor', authorRole: 'Northbridge Tutors 營運主管',
      authorPhoto: photos.caseAuthor, authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: '私人導師，倫敦', quote: '日曆和發票終於集中一處，家長不用再每週傳訊息詢問欠款。', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: '學校管理員，布里斯托', quote: '以前十一位導師的資料散落在三份試算表，現在一眼便能看到可用時段。', photo: null, rating: 4 },
      { name: 'Daniel R.', role: '機構負責人，曼徹斯特', quote: '我們可按導師查看可用時間和收入，每月檢討不再花掉整個晚上。', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: '英文導師，列斯', quote: '學生自行預約時間，我只需確認。開始使用比預期容易得多。', photo: photos.teacher, rating: 4 },
    ],
  },
  ja: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: '毎週の表計算ファイルでの混乱から解放された、四か月の入金管理',
      logo: null,
      stats: [
        { value: '38%', label: '支払い遅延を削減' },
        { value: '2.4×', label: '請求書の送信が高速化' },
      ],
      quote: [
        { text: '以前は毎週金曜日に入金状況を確認していました。今は' },
        { text: '数字と保護者アカウントの状況をすぐに確認でき', emphasis: true },
        { text: '、講師が自分のレッスンを記録しています。事務作業の負担は少なくとも半分になりました。' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Northbridge Tutors 運営責任者',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: '個人講師・ロンドン', quote: 'カレンダーと請求書をようやく一か所にまとめられました。保護者から毎週支払額を尋ねるメッセージが届くこともなくなりました。', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: '学校管理者・ブリストル', quote: '以前は十一人の講師を三つの表計算ファイルで管理していました。今は空き時間がひと目でわかります。', photo: null, rating: 4 },
      { name: 'Daniel R.', role: '事業者オーナー・マンチェスター', quote: '講師ごとの空き状況と収入を確認できます。月次の振り返りに夜をまるごと使う必要がなくなりました。', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: '英語講師・リーズ', quote: '受講者が自分で時間を予約し、私は承認するだけです。思っていたよりずっと簡単に始められました。', photo: photos.teacher, rating: 4 },
    ],
  },
  hi: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'चार महीने से भुगतान जमा हो रहे हैं, बिना हर हफ़्ते स्प्रेडशीट की अव्यवस्था के',
      logo: null,
      stats: [
        { value: '38%', label: 'कम देर से होने वाले भुगतान' },
        { value: '2.4×', label: 'तेज़ इनवॉइस भेजना' },
      ],
      quote: [
        { text: 'पहले हर शुक्रवार किसने भुगतान किया, यह जाँचने में बीतता था। अब ' },
        { text: 'आँकड़े और अभिभावक खाते तुरंत दिखते हैं', emphasis: true },
        { text: ' और ट्यूटर अपनी क्लास खुद दर्ज करते हैं। हमारा प्रशासनिक कार्यभार कम से कम आधा हो गया है।' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'संचालन प्रमुख, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'व्यक्तिगत ट्यूटर, लंदन', quote: 'अब मेरा कैलेंडर और इनवॉइस एक जगह हैं। अभिभावकों को हर हफ़्ते बकाया पूछने के लिए संदेश नहीं भेजना पड़ता।', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'स्कूल एडमिन, ब्रिस्टल', quote: 'पहले ग्यारह ट्यूटरों की जानकारी तीन स्प्रेडशीट में थी। अब उपलब्धता एक नज़र में दिखती है।', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'एजेंसी मालिक, मैनचेस्टर', quote: 'हम हर ट्यूटर की क्षमता और राजस्व देख सकते हैं। मासिक समीक्षा में अब पूरी शाम नहीं लगती।', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'अंग्रेज़ी ट्यूटर, लीड्स', quote: 'विद्यार्थी अपना समय खुद बुक करते हैं और मैं सिर्फ़ मंज़ूरी देती हूँ। शुरुआत करना मेरी उम्मीद से कहीं आसान था।', photo: photos.teacher, rating: 4 },
    ],
  },
  ko: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: '매주 스프레드시트로 씨름하지 않고 수업료를 수금한 네 달',
      logo: null,
      stats: [
        { value: '38%', label: '미납 결제 감소' },
        { value: '2.4×', label: '더 빠른 청구서 발송' },
      ],
      quote: [
        { text: '예전에는 금요일마다 누가 결제했는지 확인했어요. 이제는 ' },
        { text: '수치와 학부모 계정을 바로 확인할 수 있고', emphasis: true },
        { text: ', 튜터가 직접 수업을 기록합니다. 행정 업무가 적어도 절반으로 줄었어요.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Northbridge Tutors 운영 책임자',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: '개인 튜터, 런던', quote: '캘린더와 청구서를 드디어 한곳에서 관리해요. 학부모가 매주 납부할 금액을 메시지로 묻지 않아도 됩니다.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: '학교 관리자, 브리스틀', quote: '예전에는 튜터 열한 명을 스프레드시트 세 개로 관리했어요. 이제는 가능한 시간을 한눈에 확인합니다.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: '기관 소유자, 맨체스터', quote: '튜터별 수업 여력과 매출을 확인할 수 있어요. 월간 검토에 저녁 시간을 전부 쓰지 않아도 됩니다.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: '영어 튜터, 리즈', quote: '학생이 직접 시간을 예약하면 저는 승인만 해요. 예상보다 훨씬 쉽게 시작할 수 있었어요.', photo: photos.teacher, rating: 4 },
    ],
  },
  id: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Empat bulan menerima pembayaran tanpa kekacauan spreadsheet mingguan',
      logo: null,
      stats: [
        { value: '38%', label: 'lebih sedikit pembayaran terlambat' },
        { value: '2.4×', label: 'lebih cepat mengirim faktur' },
      ],
      quote: [
        { text: 'Dulu kami menghabiskan setiap Jumat untuk memeriksa siapa yang sudah membayar. Sekarang ' },
        { text: 'angka dan akun orang tua langsung terlihat', emphasis: true },
        { text: ', sementara tutor mencatat sesi les mereka sendiri. Beban administrasi kami berkurang setidaknya separuh.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Kepala operasional, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Tutor privat, London', quote: 'Kalender dan faktur saya akhirnya ada di satu tempat. Orang tua tidak lagi mengirim pesan setiap minggu untuk menanyakan sisa tagihan.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Administrator sekolah, Bristol', quote: 'Dulu sebelas tutor tersebar di tiga spreadsheet. Sekarang saya dapat melihat waktu tersedia dalam sekejap.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Pemilik lembaga, Manchester', quote: 'Kami dapat melihat kapasitas dan pendapatan per tutor. Tinjauan bulanan tidak lagi menghabiskan sepanjang malam.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Tutor bahasa Inggris, Leeds', quote: 'Siswa memesan waktu mereka sendiri dan saya cukup menyetujuinya. Memulainya jauh lebih mudah dari yang saya bayangkan.', photo: photos.teacher, rating: 4 },
    ],
  },
  ar: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'أربعة أشهر من تحصيل المدفوعات دون الفوضى الأسبوعية لجداول البيانات',
      logo: null,
      stats: [
        { value: '38%', label: 'مدفوعات متأخرة أقل' },
        { value: '2.4×', label: 'سرعة أكبر في إرسال الفواتير' },
      ],
      quote: [
        { text: 'كنا نقضي كل يوم جمعة في التحقق ممن دفع. الآن ' },
        { text: 'تظهر الأرقام وحسابات أولياء الأمور فورًا', emphasis: true },
        { text: '، بينما يسجّل المدرّسون دروسهم بأنفسهم. انخفض عبء الإدارة لدينا إلى النصف على الأقل.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'مسؤولة العمليات، Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'مدرّس خصوصي، لندن', quote: 'أصبح تقويمي وفواتيري أخيرًا في مكان واحد. لم يعد أولياء الأمور يراسلونني كل أسبوع للسؤال عن المبالغ المستحقة عليهم.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'مسؤولة مدرسة، بريستول', quote: 'كان أحد عشر مدرّسًا موزّعين بين ثلاثة جداول بيانات. الآن أرى الأوقات المتاحة بنظرة واحدة.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'مالك مؤسسة، مانشستر', quote: 'نرى الطاقة الاستيعابية والإيرادات لكل مدرّس. لم تعد المراجعة الشهرية تستغرق مساءً كاملًا.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'مدرّسة لغة إنجليزية، ليدز', quote: 'يحجز الطلاب مواعيدهم بأنفسهم، وما عليّ سوى الموافقة. كان البدء أسهل بكثير مما توقّعت.', photo: photos.teacher, rating: 4 },
    ],
  },
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
  'es-mx': {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Cuatro meses cobrando sin el desorden semanal de las hojas de cálculo',
      logo: null,
      stats: [
        { value: '38%', label: 'menos pagos atrasados' },
        { value: '2.4×', label: 'mayor rapidez al enviar facturas' },
      ],
      quote: [
        { text: 'Antes pasábamos cada viernes revisando quién había pagado. Ahora ' },
        { text: 'las cifras y las cuentas de los padres de familia están a la vista de inmediato', emphasis: true },
        { text: ', y los profesores registran sus propias clases. Nuestra carga administrativa se redujo al menos a la mitad.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Responsable de operaciones, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Profesor particular, Londres', quote: 'Mi calendario y mis facturas por fin están en un solo lugar. Los padres de familia ya no me escriben cada semana para preguntar cuánto deben.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Administradora escolar, Bristol', quote: 'Antes teníamos a once profesores repartidos en tres hojas de cálculo. Ahora puedo ver la disponibilidad de un vistazo.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Propietario de una agencia, Manchester', quote: 'Podemos ver la capacidad y los ingresos por profesor. La revisión mensual ya no nos toma toda la tarde.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Profesora de inglés, Leeds', quote: 'Los alumnos reservan sus propios horarios y yo solo los apruebo. Empezar fue mucho más sencillo de lo que esperaba.', photo: photos.teacher, rating: 4 },
    ],
  },
  pt: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Quatro meses a receber pagamentos sem a confusão semanal das folhas de cálculo',
      logo: null,
      stats: [
        { value: '38%', label: 'menos pagamentos em atraso' },
        { value: '2,4×', label: 'mais rapidez no envio de faturas' },
      ],
      quote: [
        { text: 'Passávamos todas as sextas-feiras a verificar quem tinha pago. Agora ' },
        { text: 'os valores e as contas dos encarregados de educação estão imediatamente visíveis', emphasis: true },
        { text: ', enquanto os explicadores registam as suas próprias aulas. A nossa carga administrativa diminuiu pelo menos para metade.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Responsável pelas operações, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Explicador, Londres', quote: 'O meu calendário e as minhas faturas estão finalmente no mesmo sítio. Os encarregados de educação já não precisam de me escrever todas as semanas para perguntar quanto devem.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Administradora escolar, Bristol', quote: 'Antes, onze explicadores estavam espalhados por três folhas de cálculo. Agora vejo toda a disponibilidade de uma só vez.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Proprietário de um centro de explicações, Manchester', quote: 'Conseguimos ver a capacidade e a receita por explicador. A análise mensal já não ocupa uma noite inteira.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Explicadora de inglês, Leeds', quote: 'Os alunos marcam os seus próprios horários e eu só preciso de aprovar. Começar foi muito mais fácil do que esperava.', photo: photos.teacher, rating: 4 },
    ],
  },
  'pt-br': {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Quatro meses recebendo pagamentos sem a confusão semanal das planilhas',
      logo: null,
      stats: [
        { value: '38%', label: 'menos pagamentos em atraso' },
        { value: '2,4×', label: 'mais rapidez no envio de faturas' },
      ],
      quote: [
        { text: 'Passávamos toda sexta-feira conferindo quem tinha pagado. Agora ' },
        { text: 'os números e as contas dos responsáveis ficam visíveis imediatamente', emphasis: true },
        { text: ', enquanto os professores registram suas próprias aulas. Nossa carga administrativa caiu pelo menos pela metade.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Responsável por operações, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Professor particular, Londres', quote: 'Meu calendário e minhas faturas finalmente ficam em um só lugar. Os responsáveis não precisam mais me escrever toda semana para perguntar quanto devem.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Administradora escolar, Bristol', quote: 'Antes, onze professores ficavam espalhados em três planilhas. Agora vejo a disponibilidade de uma vez.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Proprietário de uma empresa de aulas particulares, Manchester', quote: 'Conseguimos ver a capacidade e a receita por professor. A revisão mensal não ocupa mais uma noite inteira.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Professora de inglês, Leeds', quote: 'Os alunos agendam seus próprios horários e eu só preciso aprovar. Começar foi muito mais fácil do que eu esperava.', photo: photos.teacher, rating: 4 },
    ],
  },
  ro: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Patru luni de încasări fără haosul săptămânal al foilor de calcul',
      logo: null,
      stats: [
        { value: '38%', label: 'mai puține plăți întârziate' },
        { value: '2.4×', label: 'trimitere mai rapidă a facturilor' },
      ],
      quote: [
        { text: 'În fiecare vineri verificam cine a achitat. Acum ' },
        { text: 'cifrele și conturile părinților sunt vizibile imediat', emphasis: true },
        { text: ', iar profesorii își înregistrează singuri lecțiile. Volumul nostru de muncă administrativă s-a redus cel puțin la jumătate.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Coordonatoare operațională, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Profesor particular, Londra', quote: 'Calendarul și facturile mele sunt în sfârșit într-un singur loc. Părinții nu îmi mai scriu în fiecare săptămână să întrebe cât au de achitat.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Administratoare școlară, Bristol', quote: 'Unsprezece profesori erau împărțiți între trei foi de calcul. Acum văd disponibilitatea dintr-o privire.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Proprietar de centru, Manchester', quote: 'Vedem capacitatea și veniturile pe profesor. Analiza lunară nu mai ocupă o seară întreagă.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Profesoară de engleză, Leeds', quote: 'Elevii își rezervă singuri orele, iar eu doar le aprob. Începutul a fost mult mai ușor decât mă așteptam.', photo: photos.teacher, rating: 4 },
    ],
  },
  it: {
    caseStudy: {
      org: 'Northbridge Tutors',
      headline: 'Quattro mesi di riscossione dei pagamenti senza il caos settimanale dei fogli di calcolo',
      logo: null,
      stats: [
        { value: '38%', label: 'pagamenti in ritardo in meno' },
        { value: '2.4×', label: 'invio delle fatture più rapido' },
      ],
      quote: [
        { text: 'Passavamo ogni venerdì a controllare chi aveva pagato. Ora ' },
        { text: 'i numeri e gli account genitore sono subito visibili', emphasis: true },
        { text: ', mentre i tutor registrano le proprie lezioni. Il nostro carico amministrativo si è ridotto almeno della metà.' },
      ],
      authorName: 'Olivia Taylor',
      authorRole: 'Responsabile operativa, Northbridge Tutors',
      authorPhoto: photos.caseAuthor,
      authorLinkedIn: null,
    },
    testimonials: [
      { name: 'James W.', role: 'Tutor privato, Londra', quote: 'Il calendario e le fatture sono finalmente in un unico posto. I genitori non mi scrivono più ogni settimana per chiedere quanto devono pagare.', photo: photos.tutor, rating: 5 },
      { name: 'Charlotte Evans', role: 'Amministratrice scolastica, Bristol', quote: 'Undici tutor erano distribuiti su tre fogli di calcolo. Ora vedo la disponibilità a colpo d’occhio.', photo: null, rating: 4 },
      { name: 'Daniel R.', role: 'Proprietario di un centro, Manchester', quote: 'Vediamo disponibilità e ricavi per tutor. Il riepilogo mensile non richiede più una serata intera.', photo: photos.owner, rating: 5 },
      { name: 'Sophie M.', role: 'Tutor di inglese, Leeds', quote: 'Gli studenti prenotano autonomamente gli orari e io devo solo approvarli. Iniziare è stato molto più semplice di quanto pensassi.', photo: photos.teacher, rating: 4 },
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
});

export function getCaseStudy(locale: Locale): CaseStudy {
  return SOCIAL_PROOF[locale].caseStudy;
}

export function getTestimonials(locale: Locale): Testimonial[] {
  return SOCIAL_PROOF[locale].testimonials;
}
