/**
 * Public page editor — the owner-facing side of the landing card.
 *
 * Always edits the caller's own page: there is no slug in the route, and the
 * API resolves the row from the Bearer token — a solo tutor's page, or the
 * organization's page when the caller is an org admin. Edits autosave; the
 * preview is the real public page in an iframe (in preview mode, so an
 * unpublished draft still renders) rather than a mock of it.
 *
 * Exported twice on purpose: the default export carries the tutor chrome, while
 * PublicPageEditorContent is bare for the company routes, which already sit
 * inside CompanyLayout's <Outlet />.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload, Trash2, ExternalLink, Copy, Check, Globe, Loader2, AlertCircle,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import { publicPagePath, type PublicPageRow } from '@/lib/publicPage';
import {
  BACKDROP_THEMES, BRAND_PRESETS, PublicPageLoadError, SOCIAL_FIELDS,
  loadMyPage, savePage, uploadImage,
  type ImageKind, type LoadErrorCode, type PublicPageDraft, type SaveErrorCode,
} from '@/lib/publicPageStore';

const PUBLIC_EDITOR_COPY = {
  lt: {
    imageErrors: {
      'unsupported-type': 'Netinkamas formatas. Įkelkite JPG, PNG arba WEBP.',
      'too-large': 'Failas per didelis (iki 8 MB).',
      'decode-failed': 'Nepavyko nuskaityti paveikslėlio.',
      'canvas-unavailable': 'Naršyklė nepalaiko paveikslėlių apdorojimo.',
      'upload-failed': 'Nepavyko įkelti paveikslėlio. Bandykite dar kartą.',
    },
    forbidden: {
      'org-tutor': 'Priklausote organizacijai — viešą puslapį tvarko jos administratorius.',
      'org-excluded': 'Šiai organizacijai viešas puslapis neįjungtas.',
      'not-a-tutor': 'Ši sritis skirta korepetitoriams ir organizacijoms.',
      unknown: 'Ši sritis jums nepasiekiama.',
    },
    slugErrors: {
      'slug-invalid': 'Naudokite tik mažąsias raides, skaičius ir brūkšnelius (3–80 simbolių).',
      'slug-reserved': 'Šis adresas rezervuotas.',
      'slug-taken': 'Šis adresas jau užimtas.',
      unknown: 'Nepavyko išsaugoti. Patikrinkite ryšį ir bandykite dar kartą.',
    },
    metaTitle: 'Vizitinė kortelė | Tutlio', metaDescription: 'Viešo puslapio redaktorius',
    noImage: 'nėra', upload: 'Įkelti', remove: 'Šalinti', loading: 'Kraunama…',
    unavailable: 'Vizitinė kortelė nepasiekiama', loadFailed: 'Nepavyko įkelti puslapio',
    retry: 'Atnaujinkite puslapį ir bandykite dar kartą.', published: 'Paskelbta', draft: 'Juodraštis',
    copied: 'Nukopijuota', copyLink: 'Kopijuoti nuorodą', open: 'Atidaryti',
    unpublish: 'Nebeskelbti', publish: 'Paskelbti', address: 'Adresas', link: 'Nuoroda',
    images: 'Paveikslėliai', photoLogo: 'Nuotrauka / logotipas', coverImage: 'Viršelio paveikslėlis',
    noCoverHint: 'Be viršelio rodomas spalvų fonas su dalyko raštu.', texts: 'Tekstai',
    nameTitle: 'Vardas / pavadinimas', subtitle: 'Paantraštė', tagline: 'Šūkis',
    emphasisHint: 'Paryškintas žodis rodomas kita spalva.', emphasizedWord: 'Paryškintas žodis',
    about: 'Apie', city: 'Miestas',
    cityHint: 'Nurodžius miestą puslapyje atsiranda kontaktinių pamokų formatas.',
    languages: 'Kalbos', commaHint: 'Atskirkite kableliais.', appearance: 'Išvaizda', colors: 'Spalvos',
    backgroundPattern: 'Fono raštas', inquiries: 'Užklausos', acceptInquiries: 'Priimti užklausas',
    inquiryHint: 'Lankytojai gali palikti kontaktus ir pageidaujamą laiką — užklausa ateina jums el. paštu.',
    socialNetworks: 'Socialiniai tinklai',
    lessonSettingsHint: 'Pamokos, kainos ir laisvi laikai imami iš jūsų pamokų nustatymų ir kalendoriaus — čia jų keisti nereikia.',
    preview: 'Peržiūra', updatesAfterSave: 'Atnaujinama išsaugojus',
    brandPresetLabels: {
      violet: 'Violetinė', ocean: 'Jūros', rose: 'Rožinė', forest: 'Miško', amber: 'Gintaro', slate: 'Grafito',
    },
    backdropThemeLabels: { math: 'Matematika', language: 'Kalbos', music: 'Muzika', plain: 'Be rašto' },
  },
  fr: {
    imageErrors: {
      'unsupported-type': 'Format non pris en charge. Importez un fichier JPG, PNG ou WEBP.',
      'too-large': 'Le fichier est trop volumineux (8 Mo maximum).',
      'decode-failed': 'Impossible de lire l’image.',
      'canvas-unavailable': 'Votre navigateur ne permet pas de traiter les images.',
      'upload-failed': 'Impossible d’importer l’image. Veuillez réessayer.',
    },
    forbidden: {
      'org-tutor': 'Vous appartenez à une organisation : son administrateur gère la page publique.',
      'org-excluded': 'La page publique n’est pas activée pour cette organisation.',
      'not-a-tutor': 'Cet espace est réservé aux tuteurs et aux organisations.',
      unknown: 'Vous n’avez pas accès à cet espace.',
    },
    slugErrors: {
      'slug-invalid': 'Utilisez uniquement des lettres minuscules, des chiffres et des tirets (3 à 80 caractères).',
      'slug-reserved': 'Cette adresse est réservée.',
      'slug-taken': 'Cette adresse est déjà utilisée.',
      unknown: 'Impossible d’enregistrer. Vérifiez votre connexion et réessayez.',
    },
    metaTitle: 'Page publique | Tutlio', metaDescription: 'Éditeur de page publique',
    noImage: 'aucune', upload: 'Importer', remove: 'Supprimer', loading: 'Chargement…',
    unavailable: 'Page publique indisponible', loadFailed: 'Impossible de charger la page',
    retry: 'Actualisez la page et réessayez.', published: 'Publiée', draft: 'Brouillon',
    copied: 'Copié', copyLink: 'Copier le lien', open: 'Ouvrir',
    unpublish: 'Dépublier', publish: 'Publier', address: 'Adresse', link: 'Lien',
    images: 'Images', photoLogo: 'Photo / logo', coverImage: 'Image de couverture',
    noCoverHint: 'Sans image de couverture, un fond coloré avec un motif lié à la matière est affiché.', texts: 'Textes',
    nameTitle: 'Nom / titre', subtitle: 'Sous-titre', tagline: 'Slogan',
    emphasisHint: 'Le mot mis en valeur s’affiche dans une autre couleur.', emphasizedWord: 'Mot mis en valeur',
    about: 'À propos', city: 'Ville',
    cityHint: 'Indiquer une ville ajoute le format de cours en présentiel sur la page.',
    languages: 'Langues', commaHint: 'Séparez-les par des virgules.', appearance: 'Apparence', colors: 'Couleurs',
    backgroundPattern: 'Motif d’arrière-plan', inquiries: 'Demandes', acceptInquiries: 'Accepter les demandes',
    inquiryHint: 'Les visiteurs peuvent laisser leurs coordonnées et l’horaire souhaité ; vous recevez leur demande par e-mail.',
    socialNetworks: 'Réseaux sociaux',
    lessonSettingsHint: 'Les cours, les tarifs et les disponibilités proviennent des paramètres de cours et du calendrier ; vous n’avez pas à les modifier ici.',
    preview: 'Aperçu', updatesAfterSave: 'Actualisé après l’enregistrement',
    brandPresetLabels: {
      violet: 'Violet', ocean: 'Océan', rose: 'Rose', forest: 'Forêt', amber: 'Ambre', slate: 'Ardoise',
    },
    backdropThemeLabels: { math: 'Mathématiques', language: 'Langues', music: 'Musique', plain: 'Sans motif' },
  },
  ee: {
    imageErrors: {
      'unsupported-type': 'Sobimatu vorming. Laadige üles JPG-, PNG- või WEBP-fail.',
      'too-large': 'Fail on liiga suur (kuni 8 MB).',
      'decode-failed': 'Pilti ei õnnestunud lugeda.',
      'canvas-unavailable': 'Brauser ei toeta piltide töötlemist.',
      'upload-failed': 'Pildi üleslaadimine ebaõnnestus. Proovige uuesti.',
    },
    forbidden: {
      'org-tutor': 'Kuulute organisatsiooni — avalikku lehte haldab selle administraator.',
      'org-excluded': 'Selle organisatsiooni avalik leht pole lubatud.',
      'not-a-tutor': 'See ala on mõeldud eraõpetajatele ja organisatsioonidele.',
      unknown: 'See ala pole teile saadaval.',
    },
    slugErrors: {
      'slug-invalid': 'Kasutage ainult väiketähti, numbreid ja sidekriipse (3–80 märki).',
      'slug-reserved': 'See aadress on reserveeritud.',
      'slug-taken': 'See aadress on juba kasutusel.',
      unknown: 'Salvestamine ebaõnnestus. Kontrollige ühendust ja proovige uuesti.',
    },
    metaTitle: 'Avalik leht | Tutlio', metaDescription: 'Avaliku lehe redaktor',
    noImage: 'puudub', upload: 'Laadi üles', remove: 'Eemalda', loading: 'Laadimine…',
    unavailable: 'Avalik leht pole saadaval', loadFailed: 'Lehe laadimine ebaõnnestus',
    retry: 'Värskendage lehte ja proovige uuesti.', published: 'Avaldatud', draft: 'Mustand',
    copied: 'Kopeeritud', copyLink: 'Kopeeri link', open: 'Ava',
    unpublish: 'Tühista avaldamine', publish: 'Avalda', address: 'Aadress', link: 'Link',
    images: 'Pildid', photoLogo: 'Foto / logo', coverImage: 'Kaanepilt',
    noCoverHint: 'Ilma kaanepildita kuvatakse aine mustriga värviline taust.', texts: 'Tekstid',
    nameTitle: 'Nimi / pealkiri', subtitle: 'Alapealkiri', tagline: 'Juhtlause',
    emphasisHint: 'Esiletõstetud sõna kuvatakse teise värviga.', emphasizedWord: 'Esiletõstetud sõna',
    about: 'Tutvustus', city: 'Linn',
    cityHint: 'Linna lisamisel kuvatakse lehel kohapeal toimuvate tundide võimalus.',
    languages: 'Keeled', commaHint: 'Eraldage komadega.', appearance: 'Välimus', colors: 'Värvid',
    backgroundPattern: 'Taustamuster', inquiries: 'Päringud', acceptInquiries: 'Võta päringuid vastu',
    inquiryHint: 'Külastajad saavad jätta oma kontaktandmed ja soovitud aja — päring saadetakse teile e-postiga.',
    socialNetworks: 'Sotsiaalmeedia',
    lessonSettingsHint: 'Tunnid, hinnad ja vabad ajad võetakse teie tunniseadetest ja kalendrist — siin ei ole vaja neid muuta.',
    preview: 'Eelvaade', updatesAfterSave: 'Uuendatakse pärast salvestamist',
    brandPresetLabels: {
      violet: 'Violetne', ocean: 'Ookean', rose: 'Roosa', forest: 'Mets', amber: 'Merevaik', slate: 'Grafiit',
    },
    backdropThemeLabels: { math: 'Matemaatika', language: 'Keeled', music: 'Muusika', plain: 'Ilma mustrita' },
  },
  nl: {
    imageErrors: {
      'unsupported-type': 'Ongeldig bestandsformaat. Upload een JPG-, PNG- of WEBP-bestand.',
      'too-large': 'Het bestand is te groot (maximaal 8 MB).',
      'decode-failed': 'De afbeelding kan niet worden gelezen.',
      'canvas-unavailable': 'Je browser ondersteunt geen beeldverwerking.',
      'upload-failed': 'De afbeelding kan niet worden geüpload. Probeer het opnieuw.',
    },
    forbidden: {
      'org-tutor': 'Je bent aangesloten bij een organisatie — de beheerder beheert de openbare pagina.',
      'org-excluded': 'De openbare pagina is niet ingeschakeld voor deze organisatie.',
      'not-a-tutor': 'Dit onderdeel is bestemd voor docenten en organisaties.',
      unknown: 'Je hebt geen toegang tot dit onderdeel.',
    },
    slugErrors: {
      'slug-invalid': 'Gebruik alleen kleine letters, cijfers en koppeltekens (3–80 tekens).',
      'slug-reserved': 'Dit adres is gereserveerd.',
      'slug-taken': 'Dit adres is al in gebruik.',
      unknown: 'Opslaan is mislukt. Controleer je verbinding en probeer het opnieuw.',
    },
    metaTitle: 'Digitale visitekaart | Tutlio', metaDescription: 'Editor voor de openbare pagina',
    noImage: 'geen', upload: 'Uploaden', remove: 'Verwijderen', loading: 'Laden…',
    unavailable: 'Digitale visitekaart niet beschikbaar', loadFailed: 'De pagina kan niet worden geladen',
    retry: 'Vernieuw de pagina en probeer het opnieuw.', published: 'Gepubliceerd', draft: 'Concept',
    copied: 'Gekopieerd', copyLink: 'Link kopiëren', open: 'Openen',
    unpublish: 'Publicatie intrekken', publish: 'Publiceren', address: 'Adres', link: 'Link',
    images: 'Afbeeldingen', photoLogo: 'Foto / logo', coverImage: 'Omslagafbeelding',
    noCoverHint: 'Zonder omslagafbeelding verschijnt een gekleurde achtergrond met een vakgerelateerd patroon.', texts: 'Teksten',
    nameTitle: 'Naam / titel', subtitle: 'Ondertitel', tagline: 'Slogan',
    emphasisHint: 'Het gemarkeerde woord verschijnt in een andere kleur.', emphasizedWord: 'Gemarkeerd woord',
    about: 'Over', city: 'Plaats',
    cityHint: 'Als je een plaats invult, wordt de optie voor lessen op locatie op de pagina getoond.',
    languages: 'Talen', commaHint: 'Scheid items met komma’s.', appearance: 'Vormgeving', colors: 'Kleuren',
    backgroundPattern: 'Achtergrondpatroon', inquiries: 'Aanvragen', acceptInquiries: 'Aanvragen accepteren',
    inquiryHint: 'Bezoekers kunnen hun contactgegevens en gewenste tijd achterlaten; je ontvangt de aanvraag per e-mail.',
    socialNetworks: 'Sociale media',
    lessonSettingsHint: 'Lessen, tarieven en vrije tijden komen uit je lesinstellingen en agenda; je hoeft ze hier niet te wijzigen.',
    preview: 'Voorbeeld', updatesAfterSave: 'Wordt bijgewerkt na het opslaan',
    brandPresetLabels: {
      violet: 'Violet', ocean: 'Oceaan', rose: 'Roze', forest: 'Bos', amber: 'Amber', slate: 'Leisteen',
    },
    backdropThemeLabels: { math: 'Wiskunde', language: 'Talen', music: 'Muziek', plain: 'Geen patroon' },
  },
} as const;

type PublicEditorCopy = (typeof PUBLIC_EDITOR_COPY)[keyof typeof PUBLIC_EDITOR_COPY];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-[13px] font-bold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[12px] text-gray-600">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function ImagePicker({
  label, kind, value, onChange, onError, round, copy,
}: {
  label: string; kind: ImageKind; value?: string;
  onChange: (v: string | undefined) => void;
  onError: (msg: string | null) => void;
  round?: boolean;
  copy: PublicEditorCopy;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    onError(null);
    try {
      onChange(await uploadImage(file, kind));
    } catch (err) {
      const code = (err as Error).message as keyof typeof copy.imageErrors;
      onError(copy.imageErrors[code] ?? copy.imageErrors['upload-failed']);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div
          className={`w-16 h-16 shrink-0 bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center ${round ? 'rounded-full' : 'rounded-lg'}`}
        >
          {value
            ? <img src={value} alt="" className="w-full h-full object-cover" />
            : <span className="text-[10px] text-gray-400">{copy.noImage}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-400 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {copy.upload}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-600 hover:border-gray-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {copy.remove}
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </Field>
  );
}

type Status = 'loading' | 'ready' | 'forbidden' | 'error';

/** Tutor-side route: the editor inside the tutor sidebar chrome. */
export default function PublicPageEditor() {
  return (
    <Layout>
      <PublicPageEditorContent />
    </Layout>
  );
}

export function PublicPageEditorContent() {
  const { locale } = useTranslation();
  const copy = locale === 'ee'
    ? PUBLIC_EDITOR_COPY.ee
    : locale === 'fr'
      ? PUBLIC_EDITOR_COPY.fr
      : locale === 'nl'
        ? PUBLIC_EDITOR_COPY.nl
        : PUBLIC_EDITOR_COPY.lt;

  const [status, setStatus] = useState<Status>('loading');
  const [forbiddenReason, setForbiddenReason] = useState<LoadErrorCode>('unknown');
  const [row, setRow] = useState<PublicPageRow | null>(null);
  /** Slug is edited locally and only committed on blur — see commitSlug. */
  const [slugInput, setSlugInput] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const pending = useRef<PublicPageDraft>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    applyPageDocumentMeta(copy.metaTitle, copy.metaDescription);
  }, [copy.metaDescription, copy.metaTitle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { page } = await loadMyPage();
        if (cancelled) return;
        setRow(page);
        setSlugInput(page.slug);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PublicPageLoadError && err.forbidden) {
          setForbiddenReason(err.code);
          setStatus('forbidden');
          return;
        }
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Flush the queued patch. Debounced so typing doesn't fire a request per key. */
  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    const result = await savePage(patch);
    setSaving(false);

    if (result.ok && result.page) {
      setRow(result.page);
      setError(null);
      return;
    }
    const code = (result.code ?? 'unknown') as SaveErrorCode;
    if (result.code && result.code.startsWith('slug')) setSlugError(copy.slugErrors[code]);
    else setError(copy.slugErrors[code]);
  }, [copy.slugErrors]);

  const patch = useCallback((p: PublicPageDraft) => {
    // Optimistic: the form reads from `row`, so apply locally first.
    setRow((current) => (current ? { ...current, ...toRow(p) } : current));
    pending.current = { ...pending.current, ...p };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  // Don't lose the last keystrokes when the editor unmounts mid-debounce.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    void flush();
  }, [flush]);

  const commitSlug = useCallback(async () => {
    const next = slugInput.toLowerCase().trim();
    if (!row || next === row.slug) return;
    setSlugError(null);
    setSaving(true);
    const result = await savePage({ slug: next });
    setSaving(false);
    if (result.ok && result.page) {
      setRow(result.page);
      setSlugInput(result.page.slug);
    } else {
      setSlugError(copy.slugErrors[(result.code ?? 'unknown') as SaveErrorCode]);
    }
  }, [copy.slugErrors, slugInput, row]);

  const togglePublished = useCallback(async () => {
    if (!row) return;
    setSaving(true);
    const result = await savePage({ published: !row.published });
    setSaving(false);
    if (result.ok && result.page) setRow(result.page);
    else setError(copy.slugErrors[(result.code ?? 'unknown') as SaveErrorCode]);
  }, [copy.slugErrors, row]);

  const publicPath = useMemo(
    () => (row ? publicPagePath(row.slug, locale) : ''),
    [row, locale],
  );

  if (status !== 'ready' || !row) {
    return (
      <div className="flex items-center justify-center py-24 px-6">
        {status === 'loading' && (
          <span className="inline-flex items-center gap-2 text-[13px] text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> {copy.loading}
          </span>
        )}
        {status === 'forbidden' && (
          <div className="text-center max-w-sm">
            <AlertCircle className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-gray-900">{copy.unavailable}</p>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{copy.forbidden[forbiddenReason]}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="text-center max-w-sm">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-gray-900">{copy.loadFailed}</p>
            <p className="text-[13px] text-gray-500 mt-1.5">{copy.retry}</p>
          </div>
        )}
      </div>
    );
  }

  const live = row.published;
  const publicUrl = `${window.location.origin}${publicPath}`;
  // No remount key: the iframe is a separate document that refetches on the
  // save ping, so it keeps its scroll position and open tab between edits.
  const previewSrc = `${publicPath}?preview=1`;

  const copyUrl = () => {
    navigator.clipboard?.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="-m-4 sm:-m-6 bg-gray-50 min-h-full">
      {/* Status bar — the green dot is the live indicator. */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-[1280px] mx-auto px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              {live && (
                <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-70 animate-ping" />
              )}
              <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${live ? 'bg-green-500' : 'bg-gray-300'}`} />
            </span>
            <span className={`text-[13px] font-bold ${live ? 'text-green-700' : 'text-gray-500'}`}>
              {live ? copy.published : copy.draft}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-[12.5px] text-gray-500 truncate">{publicPath}</span>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {live && (
              <>
                <button
                  type="button" onClick={copyUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-400"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? copy.copied : copy.copyLink}
                </button>
                <Link
                  to={publicPath}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-400"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {copy.open}
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={togglePublished}
              disabled={!!slugError || saving}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
                live ? 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {!live && <Globe className="w-3.5 h-3.5" />}
              {live ? copy.unpublish : copy.publish}
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border-t border-red-200 px-5 py-2 text-[12px] text-red-800">{error}</div>
        )}
      </header>

      <div className="max-w-[1280px] mx-auto px-5 py-6 grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 items-start">
        {/* Form */}
        <div className="space-y-4">
          <Section title={copy.address}>
            <Field label={copy.link} hint={`${window.location.origin}${publicPagePath('', locale)}…`}>
              <Input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase().trim())}
                onBlur={commitSlug}
                className="bg-white"
              />
              {slugError && <p className="text-[11px] text-red-600 mt-1">{slugError}</p>}
            </Field>
          </Section>

          <Section title={copy.images}>
            <ImagePicker
              label={copy.photoLogo} kind="avatar" round copy={copy}
              value={row.photo_url ?? undefined}
              onChange={(v) => patch({ photoUrl: v ?? null })}
              onError={setError}
            />
            <ImagePicker
              label={copy.coverImage} kind="cover" copy={copy}
              value={row.cover_url ?? undefined}
              onChange={(v) => patch({ coverUrl: v ?? null })}
              onError={setError}
            />
            <p className="text-[11px] text-gray-400">
              {copy.noCoverHint}
            </p>
          </Section>

          <Section title={copy.texts}>
            <Field label={copy.nameTitle}>
              <Input value={row.display_name} onChange={(e) => patch({ displayName: e.target.value })} className="bg-white" />
            </Field>
            <Field label={copy.subtitle}>
              <Input value={row.headline} onChange={(e) => patch({ headline: e.target.value })} className="bg-white" />
            </Field>
            <Field label={copy.tagline} hint={copy.emphasisHint}>
              <Input
                value={row.tagline_text ?? ''}
                onChange={(e) => patch({ taglineText: e.target.value })}
                className="bg-white"
              />
            </Field>
            <Field label={copy.emphasizedWord}>
              <Input
                value={row.tagline_emphasis ?? ''}
                onChange={(e) => patch({ taglineEmphasis: e.target.value })}
                className="bg-white"
              />
            </Field>
            <Field label={copy.about}>
              <textarea
                value={row.bio}
                onChange={(e) => patch({ bio: e.target.value })}
                rows={5}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-[13px]"
              />
            </Field>
            <Field label={copy.city} hint={copy.cityHint}>
              <Input value={row.city ?? ''} onChange={(e) => patch({ city: e.target.value })} className="bg-white" />
            </Field>
            <Field label={copy.languages} hint={copy.commaHint}>
              <Input
                value={(row.languages ?? []).join(', ')}
                onChange={(e) => patch({ languages: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="bg-white"
              />
            </Field>
          </Section>

          <Section title={copy.appearance}>
            <Field label={copy.colors}>
              <div className="grid grid-cols-3 gap-2">
                {BRAND_PRESETS.map((p) => {
                  const on = row.brand_color === p.brandColor;
                  return (
                    <button
                      key={p.id} type="button"
                      onClick={() => patch({
                        brandColor: p.brandColor,
                        brandColorSecondary: p.brandColorSecondary,
                        brandColorTertiary: p.brandColorTertiary,
                        accentColor: p.accentColor,
                        accentTextColor: p.accentTextColor,
                      })}
                      className={`rounded-lg border p-2 text-left ${on ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'}`}
                      aria-pressed={on}
                    >
                      <span
                        className="block h-7 rounded"
                        style={{ background: `linear-gradient(135deg, ${p.brandColor}, ${p.brandColorSecondary}, ${p.brandColorTertiary})` }}
                      />
                      <span className="block text-[11px] text-gray-600 mt-1">
                        {copy.brandPresetLabels[p.id as keyof typeof copy.brandPresetLabels] ?? p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={copy.backgroundPattern}>
              <div className="flex flex-wrap gap-2">
                {BACKDROP_THEMES.map((t) => {
                  const on = row.backdrop_theme === t.id;
                  return (
                    <button
                      key={t.id} type="button"
                      onClick={() => patch({ backdropTheme: t.id })}
                      className={`px-3 py-1.5 rounded-lg border text-[12.5px] font-semibold ${
                        on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                      aria-pressed={on}
                    >
                      {copy.backdropThemeLabels[t.id] ?? t.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          <Section title={copy.inquiries}>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={row.booking_enabled}
                onChange={(e) => patch({ bookingEnabled: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-semibold text-gray-800">{copy.acceptInquiries}</span>
                <span className="block text-[11.5px] text-gray-500 mt-0.5">
                  {copy.inquiryHint}
                </span>
              </span>
            </label>
          </Section>

          <Section title={copy.socialNetworks}>
            {SOCIAL_FIELDS.map((s) => (
              <Field key={s.key} label={s.label}>
                <Input
                  value={row.socials?.[s.key] ?? ''}
                  placeholder="https://…"
                  onChange={(e) => patch({ socials: { ...row.socials, [s.key]: e.target.value || undefined } })}
                  className="bg-white"
                />
              </Field>
            ))}
          </Section>

          <p className="text-[11.5px] text-gray-400 leading-relaxed">
            {copy.lessonSettingsHint}
          </p>
        </div>

        {/* Live preview — the real page, not a mock of it. */}
        <div className="lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-gray-500">{copy.preview}</p>
            <p className="text-[11px] text-gray-400">{copy.updatesAfterSave}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <iframe
              src={previewSrc}
              title={copy.preview}
              className="w-full h-[720px] border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Applies a camelCase draft onto the snake_case row for the optimistic update. */
function toRow(p: PublicPageDraft): Partial<PublicPageRow> {
  const r: Partial<PublicPageRow> = {};
  if (p.slug !== undefined) r.slug = p.slug;
  if (p.displayName !== undefined) r.display_name = p.displayName;
  if (p.headline !== undefined) r.headline = p.headline;
  if (p.bio !== undefined) r.bio = p.bio;
  if (p.taglineText !== undefined) r.tagline_text = p.taglineText;
  if (p.taglineEmphasis !== undefined) r.tagline_emphasis = p.taglineEmphasis;
  if (p.photoUrl !== undefined) r.photo_url = p.photoUrl;
  if (p.coverUrl !== undefined) r.cover_url = p.coverUrl;
  if (p.city !== undefined) r.city = p.city;
  if (p.languages !== undefined) r.languages = p.languages;
  if (p.timezone !== undefined) r.timezone = p.timezone;
  if (p.brandColor !== undefined) r.brand_color = p.brandColor;
  if (p.brandColorSecondary !== undefined) r.brand_color_secondary = p.brandColorSecondary;
  if (p.brandColorTertiary !== undefined) r.brand_color_tertiary = p.brandColorTertiary;
  if (p.accentColor !== undefined) r.accent_color = p.accentColor;
  if (p.accentTextColor !== undefined) r.accent_text_color = p.accentTextColor;
  if (p.backdropTheme !== undefined) r.backdrop_theme = p.backdropTheme;
  if (p.socials !== undefined) r.socials = p.socials;
  if (p.published !== undefined) r.published = p.published;
  if (p.bookingEnabled !== undefined) r.booking_enabled = p.bookingEnabled;
  return r;
}
