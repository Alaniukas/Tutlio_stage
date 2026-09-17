import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bug,
  CheckCircle2,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useBodyScrollLock, useVisualViewport } from '@/hooks/useVisualViewport';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  IN_APP_SUPPORT_ATTACHMENT_TYPES,
  IN_APP_SUPPORT_MAX_ATTACHMENTS,
  IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES,
  isInAppSupportSendCommand,
  isInAppSupportDraftComplete,
  prepareInAppSupportDraftForSubmission,
  supportPortalForPath,
  type InAppSupportAttachment,
  type InAppSupportCategory,
  type InAppSupportImpact,
  type InAppSupportReportCompleteness,
  type InAppSupportTranscriptMessage,
} from '@/lib/inAppSupport';
import { readInAppSupportConversationResponse } from '@/lib/inAppSupportStream';
import SupportRobotIcon from './SupportRobotIcon';
import type { SupportPopoverAnchor } from './InAppSupportProvider';

type Stage = 'category' | 'chat' | 'success';

type Draft = {
  category: InAppSupportCategory | null;
  title: string;
  context: string;
  steps: string[];
  expectedOutcome: string;
  actualOutcome: string;
  impact: InAppSupportImpact | null;
  impactDetails: string;
  files: File[];
};

type Copy = {
  navLabel: string;
  title: string;
  subtitle: string;
  close: string;
  welcome: string;
  intro: string;
  bug: string;
  bugDesc: string;
  feature: string;
  featureDesc: string;
  back: string;
  continue: string;
  send: string;
  sending: string;
  startOver: string;
  titlePromptBug: string;
  titlePromptFeature: string;
  contextPromptBug: string;
  contextPromptFeature: string;
  stepsPromptBug: string;
  stepsPromptFeature: string;
  expectedPromptBug: string;
  expectedPromptFeature: string;
  actualPrompt: string;
  impactPromptBug: string;
  impactPromptFeature: string;
  impactBlocking: string;
  impactHigh: string;
  impactMedium: string;
  impactLow: string;
  attachmentsPrompt: string;
  attachmentsHelper: string;
  addImages: string;
  imageRules: string;
  skip: string;
  reviewPrompt: string;
  reviewTitle: string;
  sectionContext: string;
  sectionStepsBug: string;
  sectionStepsFeature: string;
  sectionExpected: string;
  sectionActual: string;
  sectionImpact: string;
  sectionImages: string;
  automaticContext: string;
  page: string;
  privacy: string;
  privacyShort: string;
  successTitle: string;
  successBody: string;
  reference: string;
  done: string;
  requiredError: string;
  imageError: string;
  submitError: string;
  noImages: string;
  oneImage: string;
  manyImages: string;
  reviewAnswer: string;
  aiReviewTitle: string;
  aiReviewLoading: string;
  aiReady: string;
  aiNeedsDetail: string;
  aiUnavailable: string;
  aiRetry: string;
  aiPrivacy: string;
  intakeLoading: string;
  placeholder: string;
  readySuggestion: string;
  manualSendSuggestion: string;
  sendCommandPlaceholder: string;
  sendCommandHint: string;
  sendCommandError: string;
  emailNotice: string;
  notificationError: string;
  clarificationPlaceholder: string;
  clarificationAction: string;
  clarificationThanks: string;
};

const COPY: Record<'en' | 'lt' | 'pl', Copy> = {
  en: {
    navLabel: 'Support agent',
    title: 'Tutlio support agent',
    subtitle: 'Guided bug and feature reporting',
    close: 'Close support agent',
    welcome: 'Hi! Tell me what happened or what you wish Tutlio could do. Write it however feels natural, and I’ll help shape it for the team.',
    intro: 'What would you like to share?',
    bug: 'Report a bug',
    bugDesc: 'Something is broken or behaves unexpectedly',
    feature: 'Request a feature',
    featureDesc: 'Suggest an improvement or a new workflow',
    back: 'Back',
    continue: 'Continue',
    send: 'Send to the team for review',
    sending: 'Sending securely…',
    startOver: 'Start over',
    titlePromptBug: 'Give the problem a short, specific title.',
    titlePromptFeature: 'Give your idea a short, outcome-focused title.',
    contextPromptBug: 'What happened? Write it in your own words, it does not need to be perfectly structured.',
    contextPromptFeature: 'What feature would help? A short rough idea is enough, and I’ll help you shape it.',
    stepsPromptBug: 'List the exact steps that reproduce the problem.',
    stepsPromptFeature: 'Describe the ideal workflow step by step.',
    expectedPromptBug: 'What did you expect to happen?',
    expectedPromptFeature: 'What would a successful result look like?',
    actualPrompt: 'What happened instead? Include any visible error text.',
    impactPromptBug: 'How much does this affect your work?',
    impactPromptFeature: 'How valuable would this be, and who would use it?',
    impactBlocking: 'Blocking',
    impactHigh: 'High',
    impactMedium: 'Medium',
    impactLow: 'Low',
    attachmentsPrompt: 'Would screenshots make this easier to understand?',
    attachmentsHelper: 'Add up to 5 images. Mark sensitive details before uploading when possible.',
    addImages: 'Add screenshots',
    imageRules: 'PNG, JPEG or WebP · 5 MB each · up to 5',
    skip: 'Continue without images',
    reviewPrompt: 'Thank you for taking the time to explain this. I’ll carefully check whether the team has enough detail.',
    reviewTitle: 'Report preview',
    sectionContext: 'Problem and context',
    sectionStepsBug: 'Steps to reproduce',
    sectionStepsFeature: 'Desired workflow',
    sectionExpected: 'Expected outcome',
    sectionActual: 'Actual outcome',
    sectionImpact: 'Impact',
    sectionImages: 'Screenshots',
    automaticContext: 'Added automatically',
    page: 'Current page',
    privacy: 'Your account, page, browser, and screen size are attached automatically. Never include passwords, login codes, or full payment-card details.',
    privacyShort: 'Account and device details are added automatically. Never share passwords or login codes.',
    successTitle: 'Thank you - your report is safely with our team',
    successBody: 'The Tutlio team has been notified by email and can review the full report, conversation, technical context, and screenshots in the admin dashboard.',
    reference: 'Reference',
    done: 'Done',
    requiredError: 'Please add a little more detail before continuing.',
    imageError: 'Use PNG, JPEG, or WebP images up to 5 MB each (maximum 5).',
    submitError: 'We could not save the report. Please try again.',
    noImages: 'No screenshots attached',
    oneImage: '1 screenshot attached',
    manyImages: 'screenshots attached',
    reviewAnswer: 'Review my report',
    aiReviewTitle: 'AI clarity check',
    aiReviewLoading: 'Checking whether the report has enough detail…',
    aiReady: 'Ready for the product team',
    aiNeedsDetail: 'A few details could help',
    aiUnavailable: 'AI review is unavailable right now. You can still send the report.',
    aiRetry: 'Try again',
    aiPrivacy: 'AI reviews the written report only. Screenshots are not sent to AI.',
    intakeLoading: 'Understanding your answer…',
    placeholder: 'Type your answer…',
    readySuggestion: 'Thank you - I have enough information for the team to review this properly. When you are ready, type “send it” in the chat box. I will not send anything without your confirmation.',
    manualSendSuggestion: 'I could not complete the AI clarity check right now, but your report is still structured and ready for a manual review. Tell me “send it” if you would like me to notify the team.',
    sendCommandPlaceholder: 'Type “send it” to confirm',
    sendCommandHint: 'A clear send command is required. “Yes” by itself will not submit the report.',
    sendCommandError: 'Please type “send it” or use the Send button when you want me to notify the team.',
    emailNotice: 'Sending saves the report in /admin and emails the same Tutlio team that receives demo and enterprise enquiries.',
    notificationError: 'Your report was saved, but I could not notify the team by email yet. Please send it again so I can retry the notification safely.',
    clarificationPlaceholder: 'Answer the missing detail here…',
    clarificationAction: 'Add detail and check again',
    clarificationThanks: 'Thank you - I added that detail and I’m checking the report again.',
  },
  lt: {
    navLabel: 'Pagalbos agentas',
    title: 'Tutlio pagalbos agentas',
    subtitle: 'Detalus klaidų ir idėjų pateikimas',
    close: 'Uždaryti pagalbos agentą',
    welcome: 'Sveiki! Parašykite, kas nutiko arba ko trūksta Tutlio. Rašykite taip, kaip patogu, o aš padėsiu mintį aiškiai perduoti komandai.',
    intro: 'Kuo norėtumėte pasidalinti?',
    bug: 'Pranešti apie klaidą',
    bugDesc: 'Kažkas neveikia arba veikia ne taip, kaip tikėtasi',
    feature: 'Pasiūlyti funkciją',
    featureDesc: 'Pasiūlyti patobulinimą arba naują veikimo būdą',
    back: 'Atgal',
    continue: 'Tęsti',
    send: 'Siųsti komandai peržiūrėti',
    sending: 'Saugiai siunčiama…',
    startOver: 'Pradėti iš naujo',
    titlePromptBug: 'Trumpai ir konkrečiai pavadinkite problemą.',
    titlePromptFeature: 'Trumpai pavadinkite idėją, akcentuodami norimą rezultatą.',
    contextPromptBug: 'Kas nutiko? Parašykite savais žodžiais, nebūtina visko iškart sudėlioti tobulai.',
    contextPromptFeature: 'Kokia funkcija praverstų? Galite parašyti visai trumpai, o aš padėsiu mintį išgryninti.',
    stepsPromptBug: 'Išvardykite tikslius veiksmus, kurie pakartoja klaidą.',
    stepsPromptFeature: 'Žingsnis po žingsnio aprašykite idealų veikimo procesą.',
    expectedPromptBug: 'Kas, jūsų manymu, turėjo įvykti?',
    expectedPromptFeature: 'Kaip atrodytų sėkmingas rezultatas?',
    actualPrompt: 'Kas įvyko vietoje to? Įrašykite matomą klaidos tekstą.',
    impactPromptBug: 'Kiek ši problema trukdo jūsų darbui?',
    impactPromptFeature: 'Kiek ši funkcija būtų vertinga ir kas ją naudotų?',
    impactBlocking: 'Blokuoja darbą',
    impactHigh: 'Didelė',
    impactMedium: 'Vidutinė',
    impactLow: 'Maža',
    attachmentsPrompt: 'Ar ekrano nuotraukos padėtų geriau suprasti situaciją?',
    attachmentsHelper: 'Galite pridėti iki 5 paveikslėlių. Jei įmanoma, prieš įkeldami paslėpkite jautrius duomenis.',
    addImages: 'Pridėti ekrano nuotraukas',
    imageRules: 'PNG, JPEG arba WebP · po 5 MB · iki 5 failų',
    skip: 'Tęsti be nuotraukų',
    reviewPrompt: 'Ačiū, kad skyrėte laiko viską paaiškinti. Dabar rūpestingai patikrinsiu, ar komandai pakanka informacijos.',
    reviewTitle: 'Pranešimo peržiūra',
    sectionContext: 'Problema ir kontekstas',
    sectionStepsBug: 'Veiksmai klaidai pakartoti',
    sectionStepsFeature: 'Norimas veikimo procesas',
    sectionExpected: 'Tikėtinas rezultatas',
    sectionActual: 'Faktinis rezultatas',
    sectionImpact: 'Poveikis',
    sectionImages: 'Ekrano nuotraukos',
    automaticContext: 'Pridedama automatiškai',
    page: 'Dabartinis puslapis',
    privacy: 'Automatiškai pridedama paskyra, puslapis, naršyklė ir ekrano dydis. Nerašykite slaptažodžių, prisijungimo kodų ar visų kortelės duomenų.',
    privacyShort: 'Paskyros ir įrenginio informacija pridedama automatiškai. Nesidalinkite slaptažodžiais ar prisijungimo kodais.',
    successTitle: 'Ačiū - jūsų pranešimas saugiai perduotas komandai',
    successBody: 'Tutlio komanda gavo el. pašto pranešimą ir administravimo skydelyje galės peržiūrėti visą aprašymą, pokalbį, techninį kontekstą bei ekrano nuotraukas.',
    reference: 'Numeris',
    done: 'Baigti',
    requiredError: 'Prieš tęsdami pridėkite šiek tiek daugiau informacijos.',
    imageError: 'Naudokite PNG, JPEG arba WebP failus iki 5 MB (daugiausia 5).',
    submitError: 'Pranešimo išsaugoti nepavyko. Bandykite dar kartą.',
    noImages: 'Ekrano nuotraukų nepridėta',
    oneImage: 'Pridėta 1 ekrano nuotrauka',
    manyImages: 'ekrano nuotraukos',
    reviewAnswer: 'Peržiūrėti mano pranešimą',
    aiReviewTitle: 'DI aiškumo patikra',
    aiReviewLoading: 'Tikrinama, ar pranešime pakanka informacijos…',
    aiReady: 'Paruošta produkto komandai',
    aiNeedsDetail: 'Padėtų keli patikslinimai',
    aiUnavailable: 'DI patikra šiuo metu nepasiekiama. Pranešimą vis tiek galite siųsti.',
    aiRetry: 'Bandyti dar kartą',
    aiPrivacy: 'DI peržiūri tik parašytą tekstą. Ekrano nuotraukos DI nesiunčiamos.',
    intakeLoading: 'Suprantu jūsų atsakymą…',
    placeholder: 'Rašykite atsakymą…',
    readySuggestion: 'Ačiū - informacijos jau pakanka, kad komanda galėtų tinkamai peržiūrėti pranešimą. Kai būsite pasiruošę, pokalbio laukelyje parašykite „siųsti“. Be jūsų patvirtinimo nieko nesiųsiu.',
    manualSendSuggestion: 'Šiuo metu nepavyko užbaigti DI aiškumo patikros, tačiau pranešimas susistemintas ir paruoštas rankinei peržiūrai. Parašykite „siųsti“, jei norite, kad informuočiau komandą.',
    sendCommandPlaceholder: 'Patvirtinimui parašykite „siųsti“',
    sendCommandHint: 'Reikalinga aiški siuntimo komanda. Vien žodis „taip“ pranešimo neišsiųs.',
    sendCommandError: 'Kai norėsite informuoti komandą, parašykite „siųsti“ arba paspauskite siuntimo mygtuką.',
    emailNotice: 'Išsiuntus pranešimas bus išsaugotas /admin skydelyje, o el. laišką gaus ta pati Tutlio komanda, kuri gauna demo ir įmonių užklausas.',
    notificationError: 'Pranešimas išsaugotas, bet komandos dar nepavyko informuoti el. paštu. Išsiųskite dar kartą, kad galėčiau saugiai pakartoti pranešimą.',
    clarificationPlaceholder: 'Čia atsakykite į trūkstamą klausimą…',
    clarificationAction: 'Pridėti informaciją ir tikrinti dar kartą',
    clarificationThanks: 'Ačiū - pridėjau šią informaciją ir dar kartą tikrinu pranešimą.',
  },
  pl: {
    navLabel: 'Agent wsparcia',
    title: 'Agent wsparcia Tutlio',
    subtitle: 'Szczegółowe zgłoszenia błędów i pomysłów',
    close: 'Zamknij agenta wsparcia',
    welcome: 'Cześć! Napisz, co się stało albo czego brakuje w Tutlio. Możesz pisać naturalnie, a ja pomogę jasno przekazać to zespołowi.',
    intro: 'Czym chcesz się podzielić?',
    bug: 'Zgłoś błąd',
    bugDesc: 'Coś nie działa lub zachowuje się niezgodnie z oczekiwaniami',
    feature: 'Poproś o funkcję',
    featureDesc: 'Zaproponuj usprawnienie albo nowy sposób pracy',
    back: 'Wstecz',
    continue: 'Dalej',
    send: 'Wyślij zespołowi do sprawdzenia',
    sending: 'Bezpieczne wysyłanie…',
    startOver: 'Zacznij od nowa',
    titlePromptBug: 'Nadaj problemowi krótki i konkretny tytuł.',
    titlePromptFeature: 'Nadaj pomysłowi krótki tytuł opisujący rezultat.',
    contextPromptBug: 'Co się stało? Napisz własnymi słowami, nie musisz od razu układać idealnego zgłoszenia.',
    contextPromptFeature: 'Jaka funkcja by się przydała? Wystarczy krótki pomysł, a ja pomogę go dopracować.',
    stepsPromptBug: 'Wypisz dokładne kroki odtwarzające problem.',
    stepsPromptFeature: 'Opisz idealny przebieg krok po kroku.',
    expectedPromptBug: 'Co powinno się wydarzyć?',
    expectedPromptFeature: 'Jak wyglądałby udany rezultat?',
    actualPrompt: 'Co wydarzyło się zamiast tego? Dodaj widoczny komunikat błędu.',
    impactPromptBug: 'Jak bardzo problem wpływa na Twoją pracę?',
    impactPromptFeature: 'Jak cenna byłaby ta funkcja i kto by z niej korzystał?',
    impactBlocking: 'Blokuje pracę',
    impactHigh: 'Wysoki',
    impactMedium: 'Średni',
    impactLow: 'Niski',
    attachmentsPrompt: 'Czy zrzuty ekranu pomogą zrozumieć sytuację?',
    attachmentsHelper: 'Dodaj maksymalnie 5 obrazów. Jeśli to możliwe, ukryj dane wrażliwe.',
    addImages: 'Dodaj zrzuty ekranu',
    imageRules: 'PNG, JPEG lub WebP · 5 MB każdy · maks. 5',
    skip: 'Kontynuuj bez obrazów',
    reviewPrompt: 'Dziękuję za poświęcony czas. Teraz uważnie sprawdzę, czy zespół ma wystarczająco dużo informacji.',
    reviewTitle: 'Podgląd zgłoszenia',
    sectionContext: 'Problem i kontekst',
    sectionStepsBug: 'Kroki do odtworzenia',
    sectionStepsFeature: 'Docelowy przebieg',
    sectionExpected: 'Oczekiwany wynik',
    sectionActual: 'Rzeczywisty wynik',
    sectionImpact: 'Wpływ',
    sectionImages: 'Zrzuty ekranu',
    automaticContext: 'Dodawane automatycznie',
    page: 'Bieżąca strona',
    privacy: 'Automatycznie dołączamy konto, stronę, przeglądarkę i rozmiar ekranu. Nie wpisuj haseł, kodów logowania ani pełnych danych karty.',
    privacyShort: 'Konto i urządzenie są dodawane automatycznie. Nie udostępniaj haseł ani kodów logowania.',
    successTitle: 'Dziękujemy - zgłoszenie bezpiecznie trafiło do zespołu',
    successBody: 'Zespół Tutlio otrzymał powiadomienie e-mail i może sprawdzić w panelu administratora pełne zgłoszenie, rozmowę, kontekst techniczny oraz zrzuty ekranu.',
    reference: 'Numer',
    done: 'Gotowe',
    requiredError: 'Dodaj trochę więcej informacji przed przejściem dalej.',
    imageError: 'Użyj plików PNG, JPEG lub WebP do 5 MB (maksymalnie 5).',
    submitError: 'Nie udało się zapisać zgłoszenia. Spróbuj ponownie.',
    noImages: 'Brak zrzutów ekranu',
    oneImage: 'Dodano 1 zrzut ekranu',
    manyImages: 'dodanych zrzutów ekranu',
    reviewAnswer: 'Sprawdź moje zgłoszenie',
    aiReviewTitle: 'Kontrola przejrzystości AI',
    aiReviewLoading: 'Sprawdzam, czy zgłoszenie zawiera wystarczająco dużo szczegółów…',
    aiReady: 'Gotowe dla zespołu produktu',
    aiNeedsDetail: 'Przyda się kilka szczegółów',
    aiUnavailable: 'Kontrola AI jest teraz niedostępna. Nadal możesz wysłać zgłoszenie.',
    aiRetry: 'Spróbuj ponownie',
    aiPrivacy: 'AI analizuje tylko tekst zgłoszenia. Zrzuty ekranu nie są wysyłane do AI.',
    intakeLoading: 'Analizuję Twoją odpowiedź…',
    placeholder: 'Wpisz odpowiedź…',
    readySuggestion: 'Dziękuję - mam już wystarczająco dużo informacji, aby zespół mógł dobrze sprawdzić zgłoszenie. Gdy będziesz gotowy, wpisz „wyślij” w polu czatu. Niczego nie wyślę bez Twojego potwierdzenia.',
    manualSendSuggestion: 'Nie udało mi się teraz zakończyć kontroli AI, ale zgłoszenie jest uporządkowane i gotowe do ręcznego sprawdzenia. Napisz „wyślij”, jeśli chcesz powiadomić zespół.',
    sendCommandPlaceholder: 'Wpisz „wyślij”, aby potwierdzić',
    sendCommandHint: 'Wymagane jest jednoznaczne polecenie wysłania. Samo „tak” nie wyśle zgłoszenia.',
    sendCommandError: 'Gdy zechcesz powiadomić zespół, wpisz „wyślij” albo użyj przycisku wysyłania.',
    emailNotice: 'Wysłanie zapisze zgłoszenie w panelu /admin i powiadomi e-mailem ten sam zespół Tutlio, który otrzymuje zapytania o demo i ofertę dla firm.',
    notificationError: 'Zgłoszenie zostało zapisane, ale nie udało się jeszcze powiadomić zespołu e-mailem. Wyślij je ponownie, abym mógł bezpiecznie ponowić powiadomienie.',
    clarificationPlaceholder: 'Odpowiedz tutaj na brakujące pytanie…',
    clarificationAction: 'Dodaj szczegół i sprawdź ponownie',
    clarificationThanks: 'Dziękuję - dodałem tę informację i ponownie sprawdzam zgłoszenie.',
  },
};

const EMPTY_DRAFT: Draft = {
  category: null,
  title: '',
  context: '',
  steps: [],
  expectedOutcome: '',
  actualOutcome: '',
  impact: null,
  impactDetails: '',
  files: [],
};

function id(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const CHAT_INPUT_MAX_HEIGHT = 100;

function ThinkingDots({ label }: { label: string }) {
  return (
    <span role="status" aria-label={label} className="flex h-5 items-center gap-1 px-0.5">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
          style={{ animationDelay: `${dot * 140}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  );
}

function AttachmentPreview({ file }: { file: File }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null;
}

export function InAppSupportPageContent({
  demoMode = false,
  onDone,
  onClose,
  sourcePath,
  compact = false,
}: {
  demoMode?: boolean;
  onDone?: () => void;
  onClose?: () => void;
  sourcePath?: string;
  compact?: boolean;
}) {
  const location = useLocation();
  const { locale } = useTranslation();
  const language = locale === 'lt' || locale === 'pl' ? locale : 'en';
  const copy = COPY[language];
  const [stage, setStage] = useState<Stage>('category');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [messages, setMessages] = useState<InAppSupportTranscriptMessage[]>([
    { role: 'assistant', content: copy.welcome },
  ]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [agentReady, setAgentReady] = useState(false);
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const category = draft.category;
  const reportPage = sourcePath || `${location.pathname}${location.search}`;

  useEffect(() => {
    requestAnimationFrame(() => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) return;

      if (typeof scrollElement.scrollTo === 'function') {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: intakeLoading ? 'auto' : 'smooth',
        });
      } else {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    });
  }, [messages, streamingReply, intakeLoading, stage, draft.files.length]);

  useLayoutEffect(() => {
    const inputElement = composerInputRef.current;
    if (!inputElement) return;
    inputElement.style.height = '0px';
    const nextHeight = Math.min(inputElement.scrollHeight, CHAT_INPUT_MAX_HEIGHT);
    inputElement.style.height = `${Math.max(40, nextHeight)}px`;
    inputElement.style.overflowY = inputElement.scrollHeight > CHAT_INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [input, stage]);

  const reset = () => {
    setStage('category');
    setDraft(EMPTY_DRAFT);
    setMessages([{ role: 'assistant', content: copy.welcome }]);
    setInput('');
    setError('');
    setIntakeLoading(false);
    setStreamingReply('');
    setAgentReady(false);
    setReference('');
    setRequestId(id());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const chooseCategory = (nextCategory: InAppSupportCategory) => {
    const nextDraft = { ...EMPTY_DRAFT, category: nextCategory };
    setDraft(nextDraft);
    setAgentReady(false);
    setMessages([
      { role: 'assistant', content: copy.welcome },
      { role: 'user', content: nextCategory === 'bug' ? copy.bug : copy.feature },
      { role: 'assistant', content: nextCategory === 'bug' ? copy.contextPromptBug : copy.contextPromptFeature },
    ]);
    setInput('');
    setError('');
    setStreamingReply('');
    setStage('chat');
  };

  const sendChatMessage = async () => {
    if (intakeLoading || submitting || !category) return;
    const value = input.trim();
    if (value.length < 2) {
      setError(copy.requiredError);
      return;
    }
    const submitRequested = isInAppSupportSendCommand(value);
    if (submitRequested && isInAppSupportDraftComplete(category, draft)) {
      const prepared = prepareInAppSupportDraftForSubmission(category, draft, messages);
      setInput('');
      void submit(
        value,
        { ...draft, ...prepared.draft },
        messages,
        false,
        prepared.completeness,
      );
      return;
    }

    const conversation: InAppSupportTranscriptMessage[] = [
      ...messages,
      { role: 'user', content: value },
    ];
    setMessages(conversation);
    setInput('');
    setError('');
    setStreamingReply('');
    setIntakeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      else if (demoMode) headers['x-in-app-support-preview'] = '1';
      else throw new Error('Missing authenticated session.');

      const response = await fetch('/api/in-app-support-assist', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'conversation',
          conversationId: requestId,
          submitRequested,
          category,
          latestMessage: value,
          conversation: conversation.slice(-20),
          draft: {
            title: draft.title,
            context: draft.context,
            steps: draft.steps,
            expectedOutcome: draft.expectedOutcome,
            actualOutcome: draft.actualOutcome,
            impact: draft.impact,
            impactDetails: draft.impactDetails,
          },
          attachmentNames: draft.files.map((file) => file.name),
          page: reportPage,
          locale,
        }),
      });
      const next = await readInAppSupportConversationResponse(response, setStreamingReply);
      const nextDraft: Draft = {
        ...draft,
        title: next.title,
        context: next.context,
        steps: next.steps,
        expectedOutcome: next.expectedOutcome,
        actualOutcome: category === 'bug' ? next.actualOutcome : '',
        impact: next.impact,
        impactDetails: next.impactDetails,
      };
      const ready = next.ready && isInAppSupportDraftComplete(category, nextDraft);
      const nextMessages: InAppSupportTranscriptMessage[] = [
        ...conversation,
        { role: 'assistant', content: next.reply },
      ];
      setDraft(nextDraft);
      setAgentReady(ready);
      setMessages(nextMessages);
      setStreamingReply('');
      if (submitRequested) {
        const prepared = prepareInAppSupportDraftForSubmission(category, nextDraft, nextMessages);
        await submit(
          value,
          { ...nextDraft, ...prepared.draft },
          nextMessages,
          true,
          prepared.completeness,
        );
      }
    } catch (conversationError) {
      console.warn('[in-app-support-agent] Conversation unavailable:', conversationError);
      const unavailable = language === 'lt'
        ? 'Atsiprašau, šiuo metu negaliu apdoroti šios žinutės. Jūsų tekstas liko pokalbyje - po akimirkos pabandykite išsiųsti jį dar kartą.'
        : language === 'pl'
          ? 'Przepraszam, nie mogę teraz przetworzyć tej wiadomości. Tekst pozostał w rozmowie - spróbuj wysłać go ponownie za chwilę.'
          : 'I’m sorry, I can’t process that message right now. Your text is still in the conversation - please try sending it again in a moment.';
      setMessages((current) => [...current, { role: 'assistant', content: unavailable }]);
    } finally {
      setStreamingReply('');
      setIntakeLoading(false);
    }
  };

  const selectFiles = (files: File[]) => {
    const next = [...draft.files];
    for (const file of files) {
      if (next.length >= IN_APP_SUPPORT_MAX_ATTACHMENTS) break;
      if (!(IN_APP_SUPPORT_ATTACHMENT_TYPES as readonly string[]).includes(file.type)
        || file.size < 1
        || file.size > IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES) {
        setError(copy.imageError);
        continue;
      }
      if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) next.push(file);
    }
    setDraft((current) => ({ ...current, files: next }));
  };

  const submit = async (
    commandText = copy.send,
    reportDraft: Draft = draft,
    transcriptMessages: InAppSupportTranscriptMessage[] = messages,
    commandIncluded = false,
    reportCompleteness: InAppSupportReportCompleteness = 'complete',
  ) => {
    if (!reportDraft.category || !reportDraft.impact || submitting) return;
    const submissionMessages: InAppSupportTranscriptMessage[] = commandIncluded
      ? transcriptMessages
      : [...transcriptMessages, { role: 'user', content: commandText }];
    setSubmitting(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authorization: Record<string, string> = {};
      if (session?.access_token) authorization.Authorization = `Bearer ${session.access_token}`;
      else if (demoMode) authorization['x-in-app-support-preview'] = '1';
      else throw new Error('Missing authenticated session.');
      const attachments: InAppSupportAttachment[] = [];
      for (const file of reportDraft.files) {
        const prepare = await fetch('/api/in-app-support-attachment-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authorization },
          body: JSON.stringify({ requestId, name: file.name, type: file.type, size: file.size }),
        });
        const upload = await prepare.json().catch(() => null) as (InAppSupportAttachment & { token?: string }) | null;
        if (!prepare.ok || !upload?.path || !upload.token) throw new Error('Could not prepare screenshot upload.');
        const { error: uploadError } = await supabase.storage
          .from('support-attachments')
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type, cacheControl: '3600' });
        if (uploadError) throw uploadError;
        attachments.push({ path: upload.path, name: upload.name, type: upload.type, size: upload.size });
      }

      const response = await fetch('/api/in-app-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authorization },
        body: JSON.stringify({
          requestId,
          category: reportDraft.category,
          title: reportDraft.title,
          context: reportDraft.context,
          steps: reportDraft.steps,
          expectedOutcome: reportDraft.expectedOutcome,
          actualOutcome: reportDraft.category === 'bug' ? reportDraft.actualOutcome : null,
          impact: reportDraft.impact,
          impactDetails: reportDraft.impactDetails,
          page: reportPage,
          locale,
          portal: supportPortalForPath(sourcePath || location.pathname),
          environment: {
            userAgent: navigator.userAgent,
            platform: navigator.platform || '',
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language || '',
            occurredAt: new Date().toISOString(),
            reportCompleteness,
          },
          transcript: submissionMessages,
          attachments,
        }),
      });
      const result = await response.json().catch(() => null) as { reference?: string; error?: string; code?: string } | null;
      if (!response.ok || !result?.reference) {
        const submitFailure = new Error(result?.error || 'Could not save report.') as Error & { code?: string };
        submitFailure.code = result?.code;
        throw submitFailure;
      }
      setReference(result.reference);
      setMessages(submissionMessages);
      setStage('success');
    } catch (submitError) {
      console.error('[in-app-support-agent] Submit failed:', submitError);
      setError((submitError as { code?: string })?.code === 'TEAM_NOTIFICATION_FAILED'
        ? copy.notificationError
        : copy.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const showComposer = stage === 'chat';
  const composerBusy = intakeLoading || submitting;

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!composerBusy && input.trim()) void sendChatMessage();
  };

  return (
    <section className={cn(
      'mx-auto flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f8fafc] shadow-sm',
      compact ? 'h-full min-h-0 max-w-none rounded-none border-0 lg:rounded-2xl lg:border' : 'min-h-[calc(100dvh-8rem)] max-w-5xl',
    )} aria-label={copy.title}>
        <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 px-3 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-6 sm:pb-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 shadow-inner sm:h-12 sm:w-12 sm:rounded-2xl">
              <SupportRobotIcon className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold tracking-tight sm:text-base">{copy.title}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-indigo-100 sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {copy.subtitle}
              </p>
            </div>
            {onClose && (
              <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-indigo-100 transition hover:bg-white/10 hover:text-white sm:h-10 sm:w-10" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
          <div className="mx-auto max-w-xl space-y-3 sm:space-y-4">
            {stage === 'success' ? (
              <div className="flex min-h-[58vh] flex-col items-center justify-center px-5 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-[28px] bg-emerald-100 text-emerald-700 shadow-sm">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h3 className="mt-6 text-xl font-black text-slate-950">{copy.successTitle}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{copy.successBody}</p>
                <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">{copy.reference}</p>
                  <p className="mt-1 font-mono text-lg font-black text-indigo-900">{reference}</p>
                </div>
                <div className="mt-7 flex gap-3">
                  <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <RotateCcw className="h-4 w-4" /> {copy.startOver}
                  </button>
                  <button type="button" onClick={onDone || reset} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
                    {copy.done}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={cn(
                    'flex animate-in fade-in slide-in-from-bottom-1 duration-200',
                    message.role === 'user' ? 'justify-end' : 'items-start gap-2.5',
                  )}>
                    {message.role === 'assistant' && (
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-600 shadow-sm">
                        <SupportRobotIcon className="h-7 w-7" />
                      </div>
                    )}
                    <div className={cn(
                      'max-w-[86%] whitespace-pre-wrap break-words px-3.5 py-3 text-[13px] leading-relaxed shadow-sm',
                      message.role === 'user'
                        ? 'rounded-2xl rounded-br-md bg-indigo-600 text-white'
                        : 'rounded-2xl rounded-tl-md border border-slate-200 bg-white text-slate-700',
                    )}>
                      {message.content}
                    </div>
                  </div>
                ))}

                {intakeLoading && (
                  <div className="flex animate-in items-start gap-2.5 fade-in slide-in-from-bottom-1 duration-200" aria-live="polite">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-600 shadow-sm">
                      <SupportRobotIcon className="h-7 w-7" />
                    </div>
                    <div className="max-w-[86%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-700 shadow-sm">
                      {streamingReply ? (
                        <span className="whitespace-pre-wrap break-words">
                          {streamingReply}
                          <span className="ml-1 inline-block h-4 w-0.5 animate-pulse align-text-bottom bg-indigo-400" aria-hidden="true" />
                        </span>
                      ) : (
                        <ThinkingDots label={copy.intakeLoading} />
                      )}
                    </div>
                  </div>
                )}

                {stage === 'category' && (
                  <div className="ml-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.4)] sm:ml-10 sm:rounded-3xl sm:p-5">
                    <p className="mb-3 text-sm font-bold text-slate-900">{copy.intro}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => chooseCategory('bug')} className="group rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 text-left transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-700"><Bug className="h-5 w-5" /></span>
                        <span className="mt-3 block text-sm font-black text-slate-900">{copy.bug}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{copy.bugDesc}</span>
                      </button>
                      <button type="button" onClick={() => chooseCategory('feature')} className="group rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700"><Lightbulb className="h-5 w-5" /></span>
                        <span className="mt-3 block text-sm font-black text-slate-900">{copy.feature}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{copy.featureDesc}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {stage !== 'success' && (
          <footer className="border-t border-slate-200 bg-white px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-5 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pt-3">
            <div className="mx-auto max-w-xl">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  selectFiles(Array.from(event.target.files || []));
                  event.currentTarget.value = '';
                }}
              />

              {error && <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

              {showComposer && (
                <>
                  {draft.files.length > 0 && (
                    <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label={copy.sectionImages}>
                      {draft.files.map((file, index) => (
                        <div key={`${file.name}-${file.size}`} className="group relative h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          <AttachmentPreview file={file} />
                          <button
                            type="button"
                            onClick={() => setDraft((current) => ({ ...current, files: current.files.filter((_, fileIndex) => fileIndex !== index) }))}
                            disabled={composerBusy}
                            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-md bg-white/95 text-slate-600 shadow hover:text-rose-600 disabled:opacity-40"
                            aria-label={`${copy.close}: ${file.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.65)] transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={draft.files.length >= IN_APP_SUPPORT_MAX_ATTACHMENTS || composerBusy}
                      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-40 sm:h-10 sm:w-10"
                      aria-label={copy.addImages}
                    >
                      <Paperclip className="h-4.5 w-4.5" />
                      {draft.files.length > 0 && (
                        <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white">
                          {draft.files.length}
                        </span>
                      )}
                    </button>
                    <textarea
                      ref={composerInputRef}
                      autoFocus
                      rows={1}
                      value={input}
                      disabled={submitting}
                      maxLength={4_000}
                      onChange={(event) => {
                        setInput(event.target.value);
                        setError('');
                      }}
                      onKeyDown={onComposerKeyDown}
                      placeholder={agentReady ? copy.sendCommandPlaceholder : copy.placeholder}
                      aria-label={agentReady ? copy.sendCommandPlaceholder : copy.placeholder}
                      className="min-h-10 max-h-[100px] flex-1 resize-none overflow-y-hidden bg-transparent px-1 py-2.5 text-sm leading-5 text-slate-900 outline-none transition-[height] duration-150 ease-out placeholder:text-slate-400 disabled:cursor-wait disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void sendChatMessage()}
                      disabled={composerBusy || !input.trim()}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none sm:h-10 sm:w-10"
                      aria-label={agentReady ? copy.send : copy.continue}
                    >
                      {submitting
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className={cn('h-4 w-4', intakeLoading && 'opacity-50')} />}
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 px-1">
                    <button type="button" onClick={reset} disabled={composerBusy} className="inline-flex min-h-7 items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 disabled:opacity-40">
                      <RotateCcw className="h-3.5 w-3.5" /> {copy.startOver}
                    </button>
                    <span className="text-right text-[10px] text-slate-400">
                      {agentReady ? copy.sendCommandHint : 'Enter · Shift+Enter'}
                    </span>
                  </div>
                  {agentReady && <p className="mt-1 px-1 text-[10px] leading-4 text-slate-400">{copy.emailNotice}</p>}
                </>
              )}

              <p className="mt-2 flex items-start gap-2 px-1 text-[10px] leading-4 text-slate-400">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="sm:hidden">{copy.privacyShort}</span>
                <span className="hidden sm:inline">{copy.privacy}</span>
              </p>
            </div>
          </footer>
        )}
    </section>
  );
}

export function InAppSupportPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-h-screen bg-[#f4f5f9]">
      <aside className="hidden w-64 flex-col bg-[#1c2430] p-4 text-white lg:flex">
        <div className="mb-8 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 font-black">T</div><span className="font-black">Tutlio</span></div>
        <div className="flex-1 space-y-2 text-sm text-slate-400">
          {['Overview', 'Calendar', 'Students', 'Messages', 'Finance'].map((item) => <div key={item} className="rounded-lg px-3 py-2.5">{item}</div>)}
        </div>
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 rounded-lg border-l-2 border-indigo-300 bg-white/10 px-3 py-2.5 text-left text-sm font-bold text-white">
          <SupportRobotIcon className="h-6 w-6" /> Support agent
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="h-9 w-48 rounded-lg bg-white shadow-sm" />
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-32 rounded-2xl bg-white shadow-sm" />)}
          </div>
          <div className="mt-5 h-80 rounded-2xl bg-white shadow-sm" />
        </div>
      </main>
      {open && (
        <InAppSupportPopover
          anchor={{ left: 16, right: 240, top: 812, bottom: 856 }}
          demoMode
          sourcePath="/finance?tab=invoices"
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function InAppSupportPopover({
  anchor,
  demoMode = false,
  sourcePath,
  onClose,
}: {
  anchor: SupportPopoverAnchor | null;
  demoMode?: boolean;
  sourcePath?: string;
  onClose: () => void;
}) {
  const width = 560;
  const visualViewport = useVisualViewport();
  const viewportWidth = visualViewport.width;
  const viewportHeight = visualViewport.height;
  const desktop = viewportWidth >= 1024;
  const left = desktop
    ? Math.max(16, Math.min((anchor?.right ?? 16) + 12, viewportWidth - width - 16))
    : 8;
  const bottom = desktop ? Math.max(16, viewportHeight - (anchor?.bottom ?? viewportHeight - 16)) : 8;

  useBodyScrollLock(!desktop);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[220]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-transparent" onClick={onClose} aria-label="Close support agent" />
      <div
        className={cn(
          'absolute overflow-hidden bg-white',
          desktop
            ? 'h-[min(780px,calc(100dvh-2rem))] w-[560px] rounded-2xl shadow-[0_28px_90px_-24px_rgba(15,23,42,0.55)]'
            : 'inset-x-0 top-0 h-dvh w-screen max-w-[100vw] rounded-none shadow-none',
        )}
        style={desktop
          ? { left, bottom }
          : { top: visualViewport.offsetTop, height: visualViewport.height }}
      >
        <InAppSupportPageContent
          compact
          demoMode={demoMode}
          sourcePath={sourcePath}
          onClose={onClose}
          onDone={onClose}
        />
      </div>
    </div>
  );
}
