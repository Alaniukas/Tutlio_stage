import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="text-sm text-gray-700 leading-relaxed space-y-1.5">{children}</div>
    </section>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <p className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-indigo-400">
      {text}
    </p>
  );
}

export default function OrgTutorPolicyModal({ open, onOpenChange }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900">
                {t('orgTutorPolicy.title')}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">{t('orgTutorPolicy.intro')}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-5 py-4 space-y-5" style={{ maxHeight: 'calc(85vh - 10rem)' }}>
          <PolicySection title={t('orgTutorPolicy.s1Title')}>
            <p>{t('orgTutorPolicy.s1Body')}</p>
          </PolicySection>

          <PolicySection title={t('orgTutorPolicy.s2Title')}>
            <p>{t('orgTutorPolicy.s2Intro')}</p>
            <Bullet text={t('orgTutorPolicy.s2Link')} />
            <Bullet text={t('orgTutorPolicy.s2Calendar')} />
            <Bullet text={t('orgTutorPolicy.s2Security')} />
          </PolicySection>

          <PolicySection title={t('orgTutorPolicy.s3Title')}>
            <p>{t('orgTutorPolicy.s3Intro')}</p>
            <Bullet text={t('orgTutorPolicy.s3Auto')} />
            <Bullet text={t('orgTutorPolicy.s3Rules')} />
          </PolicySection>

          <PolicySection title={t('orgTutorPolicy.s4Title')}>
            <p>{t('orgTutorPolicy.s4Intro')}</p>
            <Bullet text={t('orgTutorPolicy.s4Advance')} />
            <Bullet text={t('orgTutorPolicy.s4Confirmed')} />
            <Bullet text={t('orgTutorPolicy.s4Contact')} />
          </PolicySection>

          <PolicySection title={t('orgTutorPolicy.s5Title')}>
            <p>{t('orgTutorPolicy.s5Intro')}</p>
            <Bullet text={t('orgTutorPolicy.s5Use')} />
            <Bullet text={t('orgTutorPolicy.s5NoCopy')} />
            <Bullet text={t('orgTutorPolicy.s5Notes')} />
            <Bullet text={t('orgTutorPolicy.s5Termination')} />
          </PolicySection>

          <PolicySection title={t('orgTutorPolicy.s6Title')}>
            <p>{t('orgTutorPolicy.s6Body')}</p>
          </PolicySection>

          <PolicySection title={t('orgTutorPolicy.s7Title')}>
            <Bullet text={t('orgTutorPolicy.s7Org')} />
            <Bullet text={t('orgTutorPolicy.s7Tech')} />
          </PolicySection>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-gray-100">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto rounded-xl bg-indigo-600 hover:bg-indigo-700"
          >
            {t('orgTutorPolicy.acceptBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
