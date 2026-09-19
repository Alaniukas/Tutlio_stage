import { useState } from 'react';
import { AlertTriangle, MoreVertical, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SchoolContractTerminationDialog, {
  type SchoolContractTerminationImpact,
} from '@/components/company/SchoolContractTerminationDialog';

const IMPACT: SchoolContractTerminationImpact = {
  willSuspendGroup: true,
  groupId: 'preview-group',
  groupName: 'Lietuvių kalba 7 klasė',
  activeStudentCount: 3,
  remainingActiveStudentCount: 2,
  groupAlreadySuspended: false,
};

export default function PreviewSchoolGroupSuspension() {
  const [dialogOpen, setDialogOpen] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">VšĮ „Laisvi vaikai“</p>
          <h1 className="mt-2 text-2xl font-bold">Sutarčių ir grupės sustabdymo peržiūra</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Vietinis, duomenų bazės nekeičiantis UI preview 3 mokinių minimumo taisyklei.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-gray-900">Alisa Pekoriūtė – lietuvių kalba – grupinis užsiėmimas</h2>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">Papildomi užsiėmimai</span>
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">Pasirašyta abiejų šalių</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Sutarties Nr. PP-64995946 · Mėnesinis mokestis: €48.00</p>
              <p className="mt-1 text-xs text-gray-500">Mokytojas: Alina Armonienė · Grupė: Lietuvių kalba 7 klasė</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <MoreVertical className="mr-1.5 h-4 w-4" />
              Nutraukti sutartį
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-gray-900">Lietuvių kalba 7 klasė</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Sustabdyta, grupėje mažiau nei 3 aktyvūs mokiniai
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600">Pirmadienis 11:00–11:45 · trečiadienis 09:00–09:45</p>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Aktyvių mokinių skaičius grupėje sumažėjo iki 2. Grupinis užsiėmimas vyksta tik nuo 3 mokinių.</p>
          </div>
          <div className="mt-3 flex items-start gap-2 text-sm text-slate-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>Grupė lieka administratoriaus darbų eilėje, kol vėl galima aktyvuoti bent 3 mokinių sutartis.</p>
          </div>
        </section>
      </div>

      <SchoolContractTerminationDialog
        open={dialogOpen}
        studentName="Alisa Pekoriūtė"
        impact={IMPACT}
        impactLoading={false}
        groupConfirmed={confirmed}
        reason={reason}
        busy={false}
        cancelLabel="Atšaukti"
        onGroupConfirmedChange={setConfirmed}
        onReasonChange={setReason}
        onClose={() => setDialogOpen(false)}
        onSubmit={() => undefined}
      />
    </main>
  );
}
