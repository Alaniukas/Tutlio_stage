import { useState } from 'react';
import { CalendarDays, CheckCircle, Gift, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';

type LessonState = 'unpaid' | 'paid' | 'complimentary';

function LessonDetailCard({
  state,
  onPaid,
  onComplimentary,
}: {
  state: LessonState;
  onPaid: () => void;
  onComplimentary: () => void;
}) {
  const complimentary = state === 'complimentary';
  const paid = state === 'paid' || complimentary;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <CalendarDays className="w-4 h-4 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900">Pamokos informacija</h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Korepetitorius</Label>
            <p className="font-medium text-sm mt-1">Augustė Mikelionytė</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Mokinys</Label>
            <p className="font-medium text-sm mt-1">Gabija Petrauskaitė</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Pradžia</Label>
            <p className="font-medium text-sm mt-1">šiandien, 16:00</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Trukmė</Label>
            <p className="font-medium text-sm mt-1">60 min · Matematika</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            status="active"
            paid={paid}
            isComplimentary={complimentary}
            paymentStatus={paid ? 'paid' : 'pending'}
            endTime={new Date(Date.now() + 3600000).toISOString()}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Kaina</Label>
            <p className="font-semibold text-sm mt-1">{complimentary ? 'Nemokama' : '25,00 €'}</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Mokėjimas</Label>
            <p className={`text-sm mt-1 font-medium ${complimentary ? 'text-sky-700' : paid ? 'text-green-600' : 'text-amber-600'}`}>
              {complimentary ? 'Nemokama' : paid ? 'Apmokėta' : 'Laukiama apmokėjimo'}
            </p>
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <Button
            variant="outline"
            className={cn('w-full rounded-xl', paid ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50')}
            onClick={onPaid}
          >
            {paid ? <XCircle className="w-4 h-4 mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            {paid ? 'Pažymėti neapmokėta' : 'Pažymėti apmokėta'}
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50"
            onClick={onComplimentary}
          >
            <Gift className="w-4 h-4 mr-2" />
            {complimentary ? 'Atšaukti nemokamą' : 'Nemokama pamoka'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ complimentary }: { complimentary: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Gabija Petrauskaitė · Matematika</p>
        <p className="text-xs text-gray-500">šiandien 16:00–17:00 · Augustė M.</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge
          status="active"
          paid={complimentary}
          isComplimentary={complimentary}
          paymentStatus={complimentary ? 'paid' : 'pending'}
          endTime={new Date(Date.now() + 3600000).toISOString()}
        />
        <span
          className={cn(
            'inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border',
            complimentary ? 'bg-sky-50 text-sky-800 border-sky-100' : 'bg-amber-50 text-amber-700 border-amber-100',
          )}
        >
          {complimentary ? 'Nemokama' : 'Laukia'}
        </span>
      </div>
    </div>
  );
}

export default function PreviewComplimentaryLesson() {
  const [live, setLive] = useState<LessonState>('unpaid');

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-4 py-5">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs uppercase tracking-wider text-sky-300 font-semibold">Pro Klasė · UX peržiūra</p>
          <h1 className="text-xl font-bold mt-1">Nemokama pamoka — kaip mato administratorius</h1>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl">
            Fake duomenys, be prisijungimo ir be API. Paspauskite mygtukus kairėje kortelėje — taip elgsis
            tvarkaraščio pamokos langas.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-8 space-y-8">
        <section className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Interaktyvu — spauskite mygtukus</h2>
            <LessonDetailCard
              state={live}
              onPaid={() => setLive((s) => (s === 'unpaid' ? 'paid' : 'unpaid'))}
              onComplimentary={() => setLive((s) => (s === 'complimentary' ? 'unpaid' : 'complimentary'))}
            />
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Pamokų sąrašas</h2>
            <div className="space-y-2">
              <SessionRow complimentary={false} />
              <SessionRow complimentary={true} />
            </div>
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-4 text-sm text-sky-950 space-y-1">
              <p className="font-semibold">Kas nesiskaičiuoja, kai pažymėta „Nemokama pamoka“</p>
              <ul className="list-disc pl-5 text-sky-900/90 space-y-0.5">
                <li>paketo kreditai</li>
                <li>pajamos / statistikos pinigai</li>
                <li>dinaminės kainodaros papildomos pamokos</li>
                <li>mokėtojo sąskaita faktūra</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">1. Prieš — neapmokėta (šalia „Apmokėti“)</h2>
            <LessonDetailCard state="unpaid" onPaid={() => undefined} onComplimentary={() => undefined} />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">2. Po — nemokama pamoka</h2>
            <LessonDetailCard state="complimentary" onPaid={() => undefined} onComplimentary={() => undefined} />
          </div>
        </section>
      </main>
    </div>
  );
}
