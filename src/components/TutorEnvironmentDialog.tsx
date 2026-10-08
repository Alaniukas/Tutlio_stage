import { Building2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import type { useTutorEnvironments } from '@/hooks/useTutorEnvironments';

export default function TutorEnvironmentDialog({ open, onOpenChange, tutorId, controller }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tutorId: string;
  controller: ReturnType<typeof useTutorEnvironments>;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (controller.busy) return;
      if (!next) controller.clearError();
      onOpenChange(next);
    }}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] rounded-2xl" hideClose={controller.busy}>
        <DialogHeader>
          <DialogTitle>{t('tutorEnv.choose')}</DialogTitle>
          <DialogDescription>{t('tutorEnv.chooseHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {controller.environments.map((environment) => (
            <button key={environment.tutorId} type="button"
              disabled={controller.busy || environment.tutorId === tutorId}
              onClick={() => void controller.switchEnvironment(environment.tutorId)}
              className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50 disabled:cursor-default">
              <Building2 className="h-5 w-5 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{environment.organizationName}</span>
                <span className="block truncate text-xs text-gray-500">{environment.email}</span>
              </span>
              {environment.tutorId === tutorId
                ? <Check className="h-5 w-5 shrink-0 text-[var(--org-brand)]" aria-label={t('tutorEnv.current')} />
                : <span className="shrink-0 text-sm font-semibold text-[var(--org-brand)]">{t('tutorEnv.switch')}</span>}
            </button>
          ))}
        </div>
        {controller.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(`tutorEnv.error.${controller.error}`)}</p>}
      </DialogContent>
    </Dialog>
  );
}
