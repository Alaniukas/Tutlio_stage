import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

function htmlResponseToPlain(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const t = doc.body.textContent?.replace(/\s+/g, ' ').trim();
    return t || 'Įvyko klaida';
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Įvyko klaida';
  }
}

type Meta = {
  ok: boolean;
  token: string | null;
  contractId: string;
  missing: { address: boolean; birthDate: boolean; parentCode: boolean };
};

export default function SchoolContractComplete() {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();
  const contractIdFromUrl = (params.get('contractId') || '').trim();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [parentPersonalCode, setParentPersonalCode] = useState('');
  const [studentAddress, setStudentAddress] = useState('');
  const [studentCity, setStudentCity] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [parent2Name, setParent2Name] = useState('');
  const [parent2Email, setParent2Email] = useState('');
  const [parent2Phone, setParent2Phone] = useState('');
  const [parent2PersonalCode, setParent2PersonalCode] = useState('');
  const [parent2Address, setParent2Address] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!token && !contractIdFromUrl) {
      setLoadError('Nenurodytas pakvietimo nuorodos parametras.');
      setLoading(false);
      return;
    }
    const q = new URLSearchParams();
    if (token) q.set('token', token);
    if (contractIdFromUrl) q.set('contractId', contractIdFromUrl);
    q.set('format', 'json');
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/school-contract-complete?${q.toString()}`);
        const text = await res.text();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(htmlResponseToPlain(text));
          setLoading(false);
          return;
        }
        const data = JSON.parse(text) as Meta;
        if (!data.ok || !data.contractId) {
          setLoadError('Nepavyko įkelti formos.');
          setLoading(false);
          return;
        }
        setMeta(data);
      } catch {
        if (!cancelled) setLoadError('Nepavyko prisijungti prie serverio.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, contractIdFromUrl]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!meta) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, string | undefined> = {
        contractId: meta.contractId,
        parent_personal_code: parentPersonalCode,
        student_address: studentAddress,
        student_city: studentCity,
        child_birth_date: childBirthDate,
        parent2_name: parent2Name,
        parent2_email: parent2Email,
        parent2_phone: parent2Phone,
        parent2_personal_code: parent2PersonalCode,
        parent2_address: parent2Address,
      };
      if (token) payload.token = token;
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
      const res = await fetch('/api/school-contract-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        setSubmitError(htmlResponseToPlain(text));
        return;
      }
      setDone(true);
    } catch {
      setSubmitError('Įvyko klaida siunčiant duomenis.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-cyan-50 to-green-50 flex items-center justify-center p-6">
        <p className="text-gray-600">Kraunama…</p>
      </div>
    );
  }

  if (loadError || !meta) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-cyan-50 to-green-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Negalima atidaryti formos</h1>
          <p className="text-gray-600">{loadError || 'Nežinoma klaida.'}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-cyan-50 to-green-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Ačiū! Duomenys išsaugoti.</h1>
          <p className="text-gray-700">
            <strong>Atnaujinta PDF sutartis išsiųsta jūsų el. paštu.</strong>
          </p>
          <p className="text-gray-600 mt-2">Sutartį pasirašykite gavę atnaujintą versiją.</p>
        </div>
      </div>
    );
  }

  const { missing } = meta;
  const missingList: string[] = [];
  if (missing.address) missingList.push('Gyvenamoji vieta');
  if (missing.parentCode) missingList.push('Tėvų asmens kodas');
  if (missing.birthDate) missingList.push('Vaiko gimimo data');

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-cyan-50 to-green-50 p-6">
      <div className="max-w-xl mx-auto rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-lg">
        <div className="text-center mb-4">
          <div className="inline-block text-3xl font-black text-indigo-600 tracking-tight">Tutlio 🎓</div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Papildykite sutarties duomenis</h1>
        <p className="text-gray-600 text-sm mb-4">
          Po pateikimo mokykla gaus atnaujintus duomenis ir persiųs atnaujintą PDF sutartį.
        </p>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5 text-amber-950">
          <p className="font-bold text-sm mb-2">Prašome papildyti trūkstamus duomenis:</p>
          <ul className="list-disc pl-5 text-sm space-y-0.5 mb-2">
            {missingList.length > 0 ? missingList.map((x) => <li key={x}>{x}</li>) : <li>Trūkstamų laukų nerasta.</li>}
          </ul>
          <p className="text-sm font-bold">
            Svarbu: sutartį pasirašyti galėsite tik po to, kai užpildysite šiuos trūkstamus duomenis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {missing.parentCode && (
            <div>
              <Label>Tėvų asmens kodas</Label>
              <Input
                value={parentPersonalCode}
                onChange={(e) => setParentPersonalCode(e.target.value)}
                className="mt-1 rounded-xl"
                placeholder="Tėvų asmens kodas"
              />
            </div>
          )}
          {missing.address && (
            <>
              <div>
                <Label>Adresas</Label>
                <Input
                  value={studentAddress}
                  onChange={(e) => setStudentAddress(e.target.value)}
                  className="mt-1 rounded-xl"
                  placeholder="Adresas"
                />
              </div>
              <div>
                <Label>Miestas</Label>
                <Input
                  value={studentCity}
                  onChange={(e) => setStudentCity(e.target.value)}
                  className="mt-1 rounded-xl"
                  placeholder="Miestas"
                />
              </div>
            </>
          )}
          {missing.birthDate && (
            <div>
              <Label>Vaiko gimimo data</Label>
              <DateInput
                id="child_birth_date"
                value={childBirthDate}
                onChange={(ev) => setChildBirthDate(ev.target.value)}
                max={today}
                min="1900-01-01"
                className="mt-1 w-full rounded-xl border border-gray-200"
              />
            </div>
          )}

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="font-bold text-gray-900">Antro tėvo / globėjo duomenys (pasirinktinai)</p>
            <p className="text-sm text-gray-500">
              Jei šie duomenys yra žinomi, galite juos užpildyti. Jei ne — palikite tuščia.
            </p>
            <Input value={parent2Name} onChange={(e) => setParent2Name(e.target.value)} placeholder="Antro tėvo vardas ir pavardė" className="rounded-xl" />
            <Input type="email" value={parent2Email} onChange={(e) => setParent2Email(e.target.value)} placeholder="Antro tėvo el. paštas" className="rounded-xl" />
            <Input value={parent2Phone} onChange={(e) => setParent2Phone(e.target.value)} placeholder="Antro tėvo tel. nr." className="rounded-xl" />
            <Input
              value={parent2PersonalCode}
              onChange={(e) => setParent2PersonalCode(e.target.value)}
              placeholder="Antro tėvo asmens kodas"
              className="rounded-xl"
            />
            <Input value={parent2Address} onChange={(e) => setParent2Address(e.target.value)} placeholder="Antro tėvo adresas" className="rounded-xl" />
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <Button type="submit" disabled={submitting} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700">
            {submitting ? 'Saugoma…' : 'Išsaugoti duomenis'}
          </Button>
        </form>
      </div>
    </div>
  );
}
