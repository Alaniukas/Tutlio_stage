import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Check,
  CheckCircle2,
  FileSearch,
  ImagePlus,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  IN_APP_SUPPORT_ATTACHMENT_TYPES,
  IN_APP_SUPPORT_MAX_ATTACHMENTS,
  IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES,
  parseInAppSupportAiReview,
  supportPortalForPath,
  type InAppSupportAiReview,
  type InAppSupportAttachment,
  type InAppSupportCategory,
  type InAppSupportImpact,
  type InAppSupportTranscriptMessage,
} from '@/lib/inAppSupport';
import SupportRobotIcon from './SupportRobotIcon';
import type { SupportPopoverAnchor } from './InAppSupportProvider';

type Stage = 'category' | 'title' | 'context' | 'steps' | 'expected' | 'actual' | 'impact' | 'attachments' | 'review' | 'success';

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
  step: string;
  of: string;
  titlePromptBug: string;
  titlePromptFeature: string;
  titleHelperBug: string;
  titleHelperFeature: string;
  contextPromptBug: string;
  contextPromptFeature: string;
  contextHelperBug: string;
  contextHelperFeature: string;
  stepsPromptBug: string;
  stepsPromptFeature: string;
  stepsHelperBug: string;
  stepsHelperFeature: string;
  expectedPromptBug: string;
  expectedPromptFeature: string;
  expectedHelperBug: string;
  expectedHelperFeature: string;
  actualPrompt: string;
  actualHelper: string;
  impactPromptBug: string;
  impactPromptFeature: string;
  impactHelperBug: string;
  impactHelperFeature: string;
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
  placeholder: string;
};

const COPY: Record<'en' | 'lt' | 'pl', Copy> = {
  en: {
    navLabel: 'Support agent',
    title: 'Tutlio support agent',
    subtitle: 'Guided bug and feature reporting',
    close: 'Close support agent',
    welcome: 'Hi! I’ll help you prepare a report our product team can act on without guessing.',
    intro: 'What would you like to share?',
    bug: 'Report a bug',
    bugDesc: 'Something is broken or behaves unexpectedly',
    feature: 'Request a feature',
    featureDesc: 'Suggest an improvement or a new workflow',
    back: 'Back',
    continue: 'Continue',
    send: 'Send to Tutlio',
    sending: 'Sending securely…',
    startOver: 'Start over',
    step: 'Step',
    of: 'of',
    titlePromptBug: 'Give the problem a short, specific title.',
    titlePromptFeature: 'Give your idea a short, outcome-focused title.',
    titleHelperBug: 'Good: “Invoice download stays blank after payment”',
    titleHelperFeature: 'Good: “Let parents reschedule from the reminder email”',
    contextPromptBug: 'What were you trying to do, and where in Tutlio did it happen?',
    contextPromptFeature: 'What problem are you trying to solve, and how do you handle it today?',
    contextHelperBug: 'Mention the page, student or lesson type, and any relevant setup. Do not include passwords or payment-card data.',
    contextHelperFeature: 'Explain the job to be done before describing a button or screen. This helps us find the best solution.',
    stepsPromptBug: 'List the exact steps that reproduce the problem.',
    stepsPromptFeature: 'Describe the ideal workflow step by step.',
    stepsHelperBug: 'Put one action on each line. Start from a state another person can reproduce.',
    stepsHelperFeature: 'Put one step on each line, from the user’s starting point to the desired result.',
    expectedPromptBug: 'What did you expect to happen?',
    expectedPromptFeature: 'What would a successful result look like?',
    expectedHelperBug: 'Describe the normal result, not only that it should “work”.',
    expectedHelperFeature: 'Include the outcome you would use to decide the feature is useful.',
    actualPrompt: 'What happened instead? Include any visible error text.',
    actualHelper: 'Copy the exact error if possible and say whether it happens every time or only sometimes.',
    impactPromptBug: 'How much does this affect your work?',
    impactPromptFeature: 'How valuable would this be, and who would use it?',
    impactHelperBug: 'Choose a level, then mention who is affected, frequency, and whether a workaround exists.',
    impactHelperFeature: 'Choose a level, then mention the users, frequency, and time or errors this would save.',
    impactBlocking: 'Blocking',
    impactHigh: 'High',
    impactMedium: 'Medium',
    impactLow: 'Low',
    attachmentsPrompt: 'Would screenshots make this easier to understand?',
    attachmentsHelper: 'Add up to 5 images. Mark sensitive details before uploading when possible.',
    addImages: 'Add screenshots',
    imageRules: 'PNG, JPEG or WebP · 5 MB each · up to 5',
    skip: 'Continue without images',
    reviewPrompt: 'Great - review the report below. You can go back to improve any answer before sending it.',
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
    successTitle: 'Your report is logged',
    successBody: 'The Tutlio team can now review the full structured report, conversation, technical context, and screenshots in the admin dashboard.',
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
    placeholder: 'Type your answer…',
  },
  lt: {
    navLabel: 'Pagalbos agentas',
    title: 'Tutlio pagalbos agentas',
    subtitle: 'Detalus klaidų ir idėjų pateikimas',
    close: 'Uždaryti pagalbos agentą',
    welcome: 'Sveiki! Padėsiu paruošti tokį pranešimą, kurį produkto komanda galės suprasti ir įvertinti be spėliojimo.',
    intro: 'Kuo norėtumėte pasidalinti?',
    bug: 'Pranešti apie klaidą',
    bugDesc: 'Kažkas neveikia arba veikia ne taip, kaip tikėtasi',
    feature: 'Pasiūlyti funkciją',
    featureDesc: 'Pasiūlyti patobulinimą arba naują veikimo būdą',
    back: 'Atgal',
    continue: 'Tęsti',
    send: 'Siųsti Tutlio komandai',
    sending: 'Saugiai siunčiama…',
    startOver: 'Pradėti iš naujo',
    step: 'Žingsnis',
    of: 'iš',
    titlePromptBug: 'Trumpai ir konkrečiai pavadinkite problemą.',
    titlePromptFeature: 'Trumpai pavadinkite idėją, akcentuodami norimą rezultatą.',
    titleHelperBug: 'Geras pavyzdys: „Po apmokėjimo sąskaita atsidaro tuščia“',
    titleHelperFeature: 'Geras pavyzdys: „Leisti tėvams perkelti pamoką iš priminimo laiško“',
    contextPromptBug: 'Ką bandėte padaryti ir kurioje Tutlio vietoje tai nutiko?',
    contextPromptFeature: 'Kokią problemą norite išspręsti ir kaip ją sprendžiate dabar?',
    contextHelperBug: 'Nurodykite puslapį, pamokos ar mokinio tipą ir svarbius nustatymus. Nerašykite slaptažodžių ar kortelės duomenų.',
    contextHelperFeature: 'Pirmiausia aprašykite darbą ar tikslą, o ne konkretų mygtuką. Taip lengviau rasti geriausią sprendimą.',
    stepsPromptBug: 'Išvardykite tikslius veiksmus, kurie pakartoja klaidą.',
    stepsPromptFeature: 'Žingsnis po žingsnio aprašykite idealų veikimo procesą.',
    stepsHelperBug: 'Vienoje eilutėje rašykite vieną veiksmą. Pradėkite nuo būsenos, kurią galėtų atkartoti kitas žmogus.',
    stepsHelperFeature: 'Vienoje eilutėje rašykite vieną žingsnį - nuo pradžios iki norimo rezultato.',
    expectedPromptBug: 'Kas, jūsų manymu, turėjo įvykti?',
    expectedPromptFeature: 'Kaip atrodytų sėkmingas rezultatas?',
    expectedHelperBug: 'Aprašykite normalų rezultatą, ne tik tai, kad funkcija turėtų „veikti“.',
    expectedHelperFeature: 'Nurodykite rezultatą, pagal kurį spręstumėte, kad funkcija tikrai naudinga.',
    actualPrompt: 'Kas įvyko vietoje to? Įrašykite matomą klaidos tekstą.',
    actualHelper: 'Jei galite, nukopijuokite tikslų klaidos tekstą ir parašykite, ar tai nutinka visada.',
    impactPromptBug: 'Kiek ši problema trukdo jūsų darbui?',
    impactPromptFeature: 'Kiek ši funkcija būtų vertinga ir kas ją naudotų?',
    impactHelperBug: 'Pasirinkite lygį, tada nurodykite, kam tai nutinka, kaip dažnai ir ar yra laikinas sprendimas.',
    impactHelperFeature: 'Pasirinkite lygį, tada nurodykite naudotojus, dažnumą ir kiek laiko ar klaidų tai sutaupytų.',
    impactBlocking: 'Blokuoja darbą',
    impactHigh: 'Didelė',
    impactMedium: 'Vidutinė',
    impactLow: 'Maža',
    attachmentsPrompt: 'Ar ekrano nuotraukos padėtų geriau suprasti situaciją?',
    attachmentsHelper: 'Galite pridėti iki 5 paveikslėlių. Jei įmanoma, prieš įkeldami paslėpkite jautrius duomenis.',
    addImages: 'Pridėti ekrano nuotraukas',
    imageRules: 'PNG, JPEG arba WebP · po 5 MB · iki 5 failų',
    skip: 'Tęsti be nuotraukų',
    reviewPrompt: 'Puiku - peržiūrėkite pranešimą. Prieš siųsdami galite grįžti ir patikslinti atsakymą.',
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
    successTitle: 'Jūsų pranešimas užregistruotas',
    successBody: 'Tutlio komanda administravimo skydelyje matys visą struktūruotą pranešimą, pokalbį, techninį kontekstą ir ekrano nuotraukas.',
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
    placeholder: 'Rašykite atsakymą…',
  },
  pl: {
    navLabel: 'Agent wsparcia',
    title: 'Agent wsparcia Tutlio',
    subtitle: 'Szczegółowe zgłoszenia błędów i pomysłów',
    close: 'Zamknij agenta wsparcia',
    welcome: 'Cześć! Pomogę przygotować zgłoszenie, które zespół produktu zrozumie bez domysłów.',
    intro: 'Czym chcesz się podzielić?',
    bug: 'Zgłoś błąd',
    bugDesc: 'Coś nie działa lub zachowuje się niezgodnie z oczekiwaniami',
    feature: 'Poproś o funkcję',
    featureDesc: 'Zaproponuj usprawnienie albo nowy sposób pracy',
    back: 'Wstecz',
    continue: 'Dalej',
    send: 'Wyślij do Tutlio',
    sending: 'Bezpieczne wysyłanie…',
    startOver: 'Zacznij od nowa',
    step: 'Krok',
    of: 'z',
    titlePromptBug: 'Nadaj problemowi krótki i konkretny tytuł.',
    titlePromptFeature: 'Nadaj pomysłowi krótki tytuł opisujący rezultat.',
    titleHelperBug: 'Dobry przykład: „Pobrana faktura jest pusta po płatności”',
    titleHelperFeature: 'Dobry przykład: „Pozwól rodzicom przełożyć lekcję z e-maila”',
    contextPromptBug: 'Co próbowałeś zrobić i gdzie w Tutlio wystąpił problem?',
    contextPromptFeature: 'Jaki problem chcesz rozwiązać i jak radzisz sobie z nim teraz?',
    contextHelperBug: 'Podaj stronę, typ lekcji lub ucznia i ważne ustawienia. Nie wpisuj haseł ani danych karty.',
    contextHelperFeature: 'Najpierw opisz cel, a nie konkretny przycisk. Pomoże nam to znaleźć najlepsze rozwiązanie.',
    stepsPromptBug: 'Wypisz dokładne kroki odtwarzające problem.',
    stepsPromptFeature: 'Opisz idealny przebieg krok po kroku.',
    stepsHelperBug: 'Jedna czynność w każdym wierszu. Zacznij od stanu, który inna osoba może odtworzyć.',
    stepsHelperFeature: 'Jeden krok w każdym wierszu - od punktu startowego do oczekiwanego wyniku.',
    expectedPromptBug: 'Co powinno się wydarzyć?',
    expectedPromptFeature: 'Jak wyglądałby udany rezultat?',
    expectedHelperBug: 'Opisz normalny wynik, a nie tylko to, że funkcja powinna „działać”.',
    expectedHelperFeature: 'Podaj rezultat, po którym poznasz, że funkcja jest przydatna.',
    actualPrompt: 'Co wydarzyło się zamiast tego? Dodaj widoczny komunikat błędu.',
    actualHelper: 'Jeśli możesz, skopiuj dokładny błąd i napisz, czy występuje za każdym razem.',
    impactPromptBug: 'Jak bardzo problem wpływa na Twoją pracę?',
    impactPromptFeature: 'Jak cenna byłaby ta funkcja i kto by z niej korzystał?',
    impactHelperBug: 'Wybierz poziom, a potem opisz kogo to dotyczy, jak często i czy istnieje obejście.',
    impactHelperFeature: 'Wybierz poziom, a potem opisz użytkowników, częstotliwość oraz oszczędzony czas lub błędy.',
    impactBlocking: 'Blokuje pracę',
    impactHigh: 'Wysoki',
    impactMedium: 'Średni',
    impactLow: 'Niski',
    attachmentsPrompt: 'Czy zrzuty ekranu pomogą zrozumieć sytuację?',
    attachmentsHelper: 'Dodaj maksymalnie 5 obrazów. Jeśli to możliwe, ukryj dane wrażliwe.',
    addImages: 'Dodaj zrzuty ekranu',
    imageRules: 'PNG, JPEG lub WebP · 5 MB każdy · maks. 5',
    skip: 'Kontynuuj bez obrazów',
    reviewPrompt: 'Świetnie - sprawdź zgłoszenie. Przed wysłaniem możesz wrócić i poprawić odpowiedzi.',
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
    successTitle: 'Zgłoszenie zostało zapisane',
    successBody: 'Zespół Tutlio zobaczy w panelu administratora pełne zgłoszenie, rozmowę, kontekst techniczny i zrzuty ekranu.',
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
    placeholder: 'Wpisz odpowiedź…',
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

function promptFor(stage: Stage, category: InAppSupportCategory, copy: Copy): string {
  if (stage === 'title') return category === 'bug' ? copy.titlePromptBug : copy.titlePromptFeature;
  if (stage === 'context') return category === 'bug' ? copy.contextPromptBug : copy.contextPromptFeature;
  if (stage === 'steps') return category === 'bug' ? copy.stepsPromptBug : copy.stepsPromptFeature;
  if (stage === 'expected') return category === 'bug' ? copy.expectedPromptBug : copy.expectedPromptFeature;
  if (stage === 'actual') return copy.actualPrompt;
  if (stage === 'impact') return category === 'bug' ? copy.impactPromptBug : copy.impactPromptFeature;
  if (stage === 'attachments') return copy.attachmentsPrompt;
  if (stage === 'review') return copy.reviewPrompt;
  return '';
}

function helperFor(stage: Stage, category: InAppSupportCategory, copy: Copy): string {
  if (stage === 'title') return category === 'bug' ? copy.titleHelperBug : copy.titleHelperFeature;
  if (stage === 'context') return category === 'bug' ? copy.contextHelperBug : copy.contextHelperFeature;
  if (stage === 'steps') return category === 'bug' ? copy.stepsHelperBug : copy.stepsHelperFeature;
  if (stage === 'expected') return category === 'bug' ? copy.expectedHelperBug : copy.expectedHelperFeature;
  if (stage === 'actual') return copy.actualHelper;
  if (stage === 'impact') return category === 'bug' ? copy.impactHelperBug : copy.impactHelperFeature;
  return '';
}

function stageValue(stage: Stage, draft: Draft): string {
  if (stage === 'title') return draft.title;
  if (stage === 'context') return draft.context;
  if (stage === 'steps') return draft.steps.join('\n');
  if (stage === 'expected') return draft.expectedOutcome;
  if (stage === 'actual') return draft.actualOutcome;
  if (stage === 'impact') return draft.impactDetails;
  return '';
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
  const [history, setHistory] = useState<Stage[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [messages, setMessages] = useState<InAppSupportTranscriptMessage[]>([
    { role: 'assistant', content: copy.welcome },
  ]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiReview, setAiReview] = useState<InAppSupportAiReview | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewUnavailable, setAiReviewUnavailable] = useState(false);
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reviewedReportKeyRef = useRef('');

  const category = draft.category;
  const stages = category === 'feature'
    ? ['category', 'title', 'context', 'steps', 'expected', 'impact', 'attachments', 'review']
    : ['category', 'title', 'context', 'steps', 'expected', 'actual', 'impact', 'attachments', 'review'];
  const currentStep = stage === 'success' ? stages.length : Math.max(1, stages.indexOf(stage) + 1);
  const reportPage = sourcePath || `${location.pathname}${location.search}`;
  const aiReviewKey = useMemo(() => JSON.stringify({
    category: draft.category,
    title: draft.title,
    context: draft.context,
    steps: draft.steps,
    expectedOutcome: draft.expectedOutcome,
    actualOutcome: draft.actualOutcome,
    impact: draft.impact,
    impactDetails: draft.impactDetails,
    page: reportPage,
    locale,
  }), [
    draft.actualOutcome,
    draft.category,
    draft.context,
    draft.expectedOutcome,
    draft.impact,
    draft.impactDetails,
    draft.steps,
    draft.title,
    locale,
    reportPage,
  ]);

  const runAiReview = useCallback(async () => {
    if (!draft.category || !draft.impact) return;
    setAiReviewLoading(true);
    setAiReviewUnavailable(false);
    try {
      if (demoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        setAiReview({
          summary: draft.category === 'bug'
            ? 'The report clearly identifies the failing workflow, the expected result, and the observed behavior.'
            : 'The request explains the user problem, proposed workflow, and expected benefit.',
          ready: true,
          questions: [],
        });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Missing authenticated session.');
      const response = await fetch('/api/in-app-support-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          category: draft.category,
          title: draft.title,
          context: draft.context,
          steps: draft.steps,
          expectedOutcome: draft.expectedOutcome,
          actualOutcome: draft.category === 'bug' ? draft.actualOutcome : null,
          impact: draft.impact,
          impactDetails: draft.impactDetails,
          page: reportPage,
          locale,
        }),
      });
      const result = await response.json().catch(() => null) as { review?: unknown } | null;
      const review = parseInAppSupportAiReview(result?.review);
      if (!response.ok || !review) throw new Error('AI review failed.');
      setAiReview(review);
    } catch (reviewError) {
      console.warn('[in-app-support-agent] AI review unavailable:', reviewError);
      setAiReview(null);
      setAiReviewUnavailable(true);
    } finally {
      setAiReviewLoading(false);
    }
  }, [
    demoMode,
    draft.actualOutcome,
    draft.category,
    draft.context,
    draft.expectedOutcome,
    draft.impact,
    draft.impactDetails,
    draft.steps,
    draft.title,
    locale,
    reportPage,
  ]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    }));
  }, [messages, stage, draft.files.length]);

  useEffect(() => {
    setInput(stageValue(stage, draft));
    setError('');
  }, [stage]);

  useEffect(() => {
    if (stage !== 'review' || !draft.category || !draft.impact) return;
    if (reviewedReportKeyRef.current === aiReviewKey) return;
    reviewedReportKeyRef.current = aiReviewKey;
    void runAiReview();
  }, [aiReviewKey, draft.category, draft.impact, runAiReview, stage]);

  const reset = () => {
    setStage('category');
    setHistory([]);
    setDraft(EMPTY_DRAFT);
    setMessages([{ role: 'assistant', content: copy.welcome }]);
    setInput('');
    setError('');
    setAiReview(null);
    setAiReviewLoading(false);
    setAiReviewUnavailable(false);
    reviewedReportKeyRef.current = '';
    setReference('');
    setRequestId(id());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const advance = (userContent: string, next: Stage) => {
    setHistory((current) => [...current, stage]);
    setMessages((current) => [
      ...current,
      { role: 'user', content: userContent },
      ...(next === 'success' ? [] : [{ role: 'assistant' as const, content: promptFor(next, draft.category || 'bug', copy) }]),
    ]);
    setStage(next);
  };

  const chooseCategory = (nextCategory: InAppSupportCategory) => {
    const nextDraft = { ...EMPTY_DRAFT, category: nextCategory };
    setDraft(nextDraft);
    setHistory(['category']);
    setMessages([
      { role: 'assistant', content: copy.welcome },
      { role: 'user', content: nextCategory === 'bug' ? copy.bug : copy.feature },
      { role: 'assistant', content: promptFor('title', nextCategory, copy) },
    ]);
    setStage('title');
  };

  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setMessages((current) => current.slice(0, -2));
    setStage(previous);
  };

  const submitTextStage = () => {
    const value = input.trim();
    const minimum = stage === 'title' ? 5 : stage === 'impact' ? 3 : 10;
    if (value.length < minimum) {
      setError(copy.requiredError);
      return;
    }
    if (stage === 'steps') {
      const steps = value
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 12);
      if (steps.length === 0) {
        setError(copy.requiredError);
        return;
      }
      setDraft((current) => ({ ...current, steps }));
      advance(steps.map((step, index) => `${index + 1}. ${step}`).join('\n'), 'expected');
      return;
    }
    if (stage === 'title') {
      setDraft((current) => ({ ...current, title: value }));
      advance(value, 'context');
    } else if (stage === 'context') {
      setDraft((current) => ({ ...current, context: value }));
      advance(value, 'steps');
    } else if (stage === 'expected') {
      setDraft((current) => ({ ...current, expectedOutcome: value }));
      advance(value, category === 'bug' ? 'actual' : 'impact');
    } else if (stage === 'actual') {
      setDraft((current) => ({ ...current, actualOutcome: value }));
      advance(value, 'impact');
    } else if (stage === 'impact') {
      if (!draft.impact) {
        setError(copy.requiredError);
        return;
      }
      setDraft((current) => ({ ...current, impactDetails: value }));
      const label = impactOptions.find((option) => option.value === draft.impact)?.label || draft.impact;
      advance(`${label}: ${value}`, 'attachments');
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

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    selectFiles(Array.from(event.dataTransfer.files));
  };

  const continueFromAttachments = () => {
    const count = draft.files.length;
    const answer = count === 0
      ? copy.noImages
      : count === 1
        ? copy.oneImage
        : `${count} ${copy.manyImages}`;
    advance(answer, 'review');
  };

  const submit = async () => {
    if (!draft.category || !draft.impact || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      if (demoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 550));
        setReference('SUP-DEMO2026');
        setMessages((current) => [...current, { role: 'user', content: copy.send }]);
        setStage('success');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Missing authenticated session.');
      const authorization = { Authorization: `Bearer ${session.access_token}` };
      const attachments: InAppSupportAttachment[] = [];
      for (const file of draft.files) {
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
          category: draft.category,
          title: draft.title,
          context: draft.context,
          steps: draft.steps,
          expectedOutcome: draft.expectedOutcome,
          actualOutcome: draft.category === 'bug' ? draft.actualOutcome : null,
          impact: draft.impact,
          impactDetails: draft.impactDetails,
          page: reportPage,
          locale,
          portal: supportPortalForPath(sourcePath || location.pathname),
          environment: {
            userAgent: navigator.userAgent,
            platform: navigator.platform || '',
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language || '',
            occurredAt: new Date().toISOString(),
          },
          transcript: aiReview
            ? [...messages, {
              role: 'assistant' as const,
              content: `${copy.aiReviewTitle}: ${aiReview.summary}${aiReview.questions.length ? `\n${aiReview.questions.join('\n')}` : ''}`,
            }]
            : messages,
          attachments,
        }),
      });
      const result = await response.json().catch(() => null) as { reference?: string; error?: string } | null;
      if (!response.ok || !result?.reference) throw new Error(result?.error || 'Could not save report.');
      setReference(result.reference);
      setMessages((current) => [...current, { role: 'user', content: copy.send }]);
      setStage('success');
    } catch (submitError) {
      console.error('[in-app-support-agent] Submit failed:', submitError);
      setError(copy.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const impactOptions = useMemo(() => [
    { value: 'blocking' as const, label: copy.impactBlocking, color: 'border-rose-200 bg-rose-50 text-rose-700' },
    { value: 'high' as const, label: copy.impactHigh, color: 'border-orange-200 bg-orange-50 text-orange-700' },
    { value: 'medium' as const, label: copy.impactMedium, color: 'border-amber-200 bg-amber-50 text-amber-700' },
    { value: 'low' as const, label: copy.impactLow, color: 'border-slate-200 bg-slate-50 text-slate-700' },
  ], [copy]);

  return (
    <section className={cn(
      'mx-auto flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f8fafc] shadow-sm',
      compact ? 'h-full min-h-0 max-w-none' : 'min-h-[calc(100dvh-8rem)] max-w-5xl',
    )} aria-label={copy.title}>
        <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white sm:px-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
              <SupportRobotIcon className="h-10 w-10" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold tracking-tight sm:text-base">{copy.title}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-indigo-100">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {copy.subtitle}
              </p>
            </div>
            {onClose && (
              <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-indigo-100 transition hover:bg-white/10 hover:text-white" aria-label={copy.close}>
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {stage !== 'success' && (
            <div className="relative mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-indigo-100">
                <span>{copy.step} {currentStep} {copy.of} {stages.length}</span>
                <span>{Math.round((currentStep / stages.length) * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-300" style={{ width: `${(currentStep / stages.length) * 100}%` }} />
              </div>
            </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          <div className="mx-auto max-w-xl space-y-4">
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
                  <div key={`${message.role}-${index}`} className={cn('flex', message.role === 'user' ? 'justify-end' : 'items-start gap-2.5')}>
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

                <div className="ml-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.4)] sm:ml-10 sm:p-5">
                  {stage === 'category' && (
                    <div>
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

                  {['title', 'context', 'steps', 'expected', 'actual', 'impact'].includes(stage) && category && (
                    <div>
                      {stage === 'impact' && (
                        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {impactOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDraft((current) => ({ ...current, impact: option.value }))}
                              className={cn(
                                'rounded-xl border px-2 py-2 text-xs font-bold transition',
                                draft.impact === option.value ? `${option.color} ring-2 ring-indigo-500 ring-offset-1` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        autoFocus
                        rows={stage === 'title' ? 2 : stage === 'steps' ? 6 : 5}
                        value={input}
                        maxLength={stage === 'title' ? 180 : 4_000}
                        onChange={(event) => { setInput(event.target.value); setError(''); }}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitTextStage();
                        }}
                        placeholder={copy.placeholder}
                        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                      />
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-[11px] leading-5 text-indigo-800">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{helperFor(stage, category, copy)}</span>
                      </div>
                    </div>
                  )}

                  {stage === 'attachments' && (
                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDrop}
                        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><ImagePlus className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-3 text-sm font-bold text-slate-900">
                            <span>{copy.addImages}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-indigo-700 shadow-sm">
                              {draft.files.length}/{IN_APP_SUPPORT_MAX_ATTACHMENTS}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{copy.imageRules}</span>
                        </span>
                      </button>
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
                      {draft.files.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {draft.files.map((file, index) => (
                            <div key={`${file.name}-${file.size}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                              <AttachmentPreview file={file} />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-2 pb-2 pt-5">
                                <p className="truncate text-[10px] font-semibold text-white">{file.name}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setDraft((current) => ({ ...current, files: current.files.filter((_, fileIndex) => fileIndex !== index) }))}
                                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-slate-600 shadow hover:text-rose-600"
                                aria-label={`${copy.close}: ${file.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-900">
                        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{copy.attachmentsHelper}</span>
                      </div>
                    </div>
                  )}

                  {stage === 'review' && category && draft.impact && (
                    <div>
                      <div className="mb-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-3.5" aria-live="polite">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
                            {aiReviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.13em] text-indigo-600">{copy.aiReviewTitle}</p>
                            {aiReviewLoading && <p className="mt-1 text-xs leading-5 text-indigo-900">{copy.aiReviewLoading}</p>}
                            {!aiReviewLoading && aiReview && (
                              <>
                                <p className={cn('mt-1 text-xs font-bold', aiReview.ready ? 'text-emerald-700' : 'text-amber-700')}>
                                  {aiReview.ready ? copy.aiReady : copy.aiNeedsDetail}
                                </p>
                                <p className="mt-1.5 text-xs leading-5 text-slate-700">{aiReview.summary}</p>
                                {aiReview.questions.length > 0 && (
                                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700">
                                    {aiReview.questions.map((question) => (
                                      <li key={question} className="flex gap-2">
                                        <span className="font-black text-indigo-500">•</span>
                                        <span>{question}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )}
                            {!aiReviewLoading && aiReviewUnavailable && (
                              <div className="mt-1">
                                <p className="text-xs leading-5 text-slate-700">{copy.aiUnavailable}</p>
                                <button type="button" onClick={() => void runAiReview()} className="mt-2 text-xs font-bold text-indigo-700 hover:text-indigo-900">
                                  {copy.aiRetry}
                                </button>
                              </div>
                            )}
                            <p className="mt-2 text-[10px] leading-4 text-slate-500">{copy.aiPrivacy}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <span className={cn('grid h-10 w-10 place-items-center rounded-xl', category === 'bug' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>
                          {category === 'bug' ? <Bug className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{copy.reviewTitle}</p>
                          <h3 className="truncate text-sm font-black text-slate-950">{draft.title}</h3>
                        </div>
                      </div>
                      <div className="mt-4 space-y-4 text-sm">
                        <ReviewSection label={copy.sectionContext} value={draft.context} />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{category === 'bug' ? copy.sectionStepsBug : copy.sectionStepsFeature}</p>
                          <ol className="mt-1.5 space-y-1.5 text-slate-700">
                            {draft.steps.map((step, index) => <li key={step} className="flex gap-2"><span className="font-bold text-indigo-500">{index + 1}.</span><span>{step}</span></li>)}
                          </ol>
                        </div>
                        <ReviewSection label={copy.sectionExpected} value={draft.expectedOutcome} />
                        {category === 'bug' && <ReviewSection label={copy.sectionActual} value={draft.actualOutcome} />}
                        <ReviewSection label={copy.sectionImpact} value={`${impactOptions.find((option) => option.value === draft.impact)?.label}: ${draft.impactDetails}`} />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{copy.sectionImages}</p>
                          <p className="mt-1.5 flex items-center gap-2 text-slate-700"><Paperclip className="h-4 w-4 text-indigo-500" />{draft.files.length === 0 ? copy.noImages : draft.files.length === 1 ? copy.oneImage : `${draft.files.length} ${copy.manyImages}`}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><FileSearch className="h-3.5 w-3.5" />{copy.automaticContext}</p>
                          <p className="mt-1.5 break-all text-xs text-slate-600">{copy.page}: {reportPage}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}

                  {stage !== 'category' && (
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <button type="button" onClick={goBack} disabled={submitting} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">
                        <ArrowLeft className="h-4 w-4" /> {copy.back}
                      </button>
                      {stage === 'attachments' ? (
                        <button type="button" onClick={continueFromAttachments} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-indigo-700">
                          {draft.files.length ? copy.continue : copy.skip} <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : stage === 'review' ? (
                        <button type="button" onClick={() => void submit()} disabled={submitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-60">
                          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {submitting ? copy.sending : copy.send}
                        </button>
                      ) : (
                        <button type="button" onClick={submitTextStage} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-indigo-700">
                          {copy.continue} <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {stage !== 'success' && (
          <footer className="border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <p className="mx-auto flex max-w-xl items-start gap-2 text-[10px] leading-4 text-slate-500">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              {copy.privacy}
            </p>
          </footer>
        )}
    </section>
  );
}

function ReviewSection({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap leading-6 text-slate-700">{value}</p>
    </div>
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
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const desktop = viewportWidth >= 1024;
  const left = desktop
    ? Math.max(16, Math.min((anchor?.right ?? 16) + 12, viewportWidth - width - 16))
    : 8;
  const bottom = desktop ? Math.max(16, viewportHeight - (anchor?.bottom ?? viewportHeight - 16)) : 8;

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
        className="absolute h-[min(780px,calc(100dvh-2rem))] w-[calc(100vw-1rem)] max-w-[560px] overflow-hidden rounded-2xl shadow-[0_28px_90px_-24px_rgba(15,23,42,0.55)]"
        style={{ left, bottom }}
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
