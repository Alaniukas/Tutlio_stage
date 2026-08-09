import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';

type Phase = 'form' | 'loading' | 'done' | 'error';

const COPY = {
  lt: {
    invalidEmail: 'Įveskite galiojantį el. pašto adresą.',
    failed: 'Nepavyko atsisakyti priminimų',
    serverError: 'Nepavyko pasiekti serverio. Patikrinkite ryšį ir bandykite dar kartą.',
    doneTitle: 'Priminimai išjungti',
    doneBefore: 'Adresu',
    doneAfter: 'nebegausite automatinių priminimų apie pamokas ir mokėjimus.',
    title: 'Atsisakyti priminimų',
    description: 'Nebegausite automatinių el. laiškų apie artėjančias pamokas ir neapmokėtus mokėjimus. Sutarčių ir vienkartinių mokėjimo prašymų laiškai gali būti siunčiami toliau.',
    email: 'El. paštas',
    emailPlaceholder: 'vardas@pavyzdys.lt',
    sending: 'Siunčiama…',
    submit: 'Atsisakyti priminimų',
  },
  ee: {
    invalidEmail: 'Sisestage kehtiv e-posti aadress.',
    failed: 'Meeldetuletustest loobumine ebaõnnestus',
    serverError: 'Serveriga ei õnnestunud ühendust saada. Kontrollige internetiühendust ja proovige uuesti.',
    doneTitle: 'Meeldetuletused on välja lülitatud',
    doneBefore: 'Aadressile',
    doneAfter: 'ei saadeta enam automaatseid meeldetuletusi tundide ega maksete kohta.',
    title: 'Loobu meeldetuletustest',
    description: 'Te ei saa enam automaatseid e-kirju eelseisvate tundide ega tasumata maksete kohta. Lepingute ja ühekordsete maksetaotluste e-kirju võidakse teile endiselt saata.',
    email: 'E-post',
    emailPlaceholder: 'nimi@näide.ee',
    sending: 'Saatmine…',
    submit: 'Loobu meeldetuletustest',
  },
  nl: {
    invalidEmail: 'Voer een geldig e-mailadres in.',
    failed: 'Afmelden voor herinneringen is mislukt',
    serverError: 'Kan de server niet bereiken. Controleer je verbinding en probeer het opnieuw.',
    doneTitle: 'Herinneringen uitgeschakeld',
    doneBefore: 'Op',
    doneAfter: 'ontvang je geen automatische herinneringen over lessen en betalingen meer.',
    title: 'Afmelden voor herinneringen',
    description: 'Je ontvangt geen automatische e-mails meer over komende lessen en openstaande betalingen. E-mails over contracten en eenmalige betaalverzoeken kunnen nog wel worden verzonden.',
    email: 'E-mail',
    emailPlaceholder: 'naam@voorbeeld.nl',
    sending: 'Verzenden…',
    submit: 'Afmelden voor herinneringen',
  },
} as const;

export default function UnsubscribeReminders() {
  const { locale } = useTranslation();
  const copy = locale === 'ee' ? COPY.ee : locale === 'nl' ? COPY.nl : COPY.lt;
  const [params] = useSearchParams();
  const prefill = useMemo(() => {
    const raw = String(params.get('email') || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params]);
  const [email, setEmail] = useState(prefill);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError(copy.invalidEmail);
      setPhase('error');
      return;
    }
    setPhase('loading');
    setError('');
    try {
      const resp = await fetch('/api/unsubscribe-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(`${copy.failed} (${resp.status}).`);
        setPhase('error');
        return;
      }
      setPhase('done');
    } catch {
      setError(copy.serverError);
      setPhase('error');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ecfeff 50%,#f0fdf4 100%)' }}
    >
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-6 md:p-8">
        <div className="text-center mb-6">
          <span className="text-2xl font-black text-indigo-600 tracking-tight">Tutlio</span>
        </div>

        {phase === 'done' ? (
          <div className="text-center space-y-2">
            <h1 className="text-lg font-bold text-gray-900">{copy.doneTitle}</h1>
            <p className="text-sm text-gray-500">
              {copy.doneBefore} <strong className="text-gray-700">{email.trim().toLowerCase()}</strong>{' '}
              {copy.doneAfter}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{copy.title}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {copy.description}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unsub-email">{copy.email}</Label>
              <Input
                id="unsub-email"
                type="email"
                value={email}
                onChange={(ev) => {
                  setEmail(ev.target.value);
                  if (phase === 'error') setPhase('form');
                }}
                placeholder={copy.emailPlaceholder}
                required
                autoComplete="email"
              />
            </div>
            {(phase === 'error' && error) && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button
              type="submit"
              disabled={phase === 'loading'}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {phase === 'loading' ? copy.sending : copy.submit}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
