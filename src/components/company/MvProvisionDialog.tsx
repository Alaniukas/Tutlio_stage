import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import {
  defaultMvProvisionDelivery,
  type MvEmailDelivery,
  resolveMvNotifyTargets,
} from '@/lib/mvProvisionOptions';
import {
  mvNeedsParentAccount,
  mvNeedsStudentAccount,
  type MvStudentAccountRow,
} from '@/lib/mvStudentAccountStatus';

export type MvProvisionDialogSubmit = {
  parentName: string;
  parentEmail: string;
  studentFullName: string;
  studentEmail: string;
  emailDelivery: MvEmailDelivery;
  parentNotifyEmail?: string;
  studentNotifyEmail?: string;
  bothNotifyEmail?: string;
  scope: 'auto' | 'both' | 'parent' | 'student';
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: MvStudentAccountRow & { id: string };
  loading?: boolean;
  onSubmit: (payload: MvProvisionDialogSubmit) => void | Promise<void>;
};

export default function MvProvisionDialog({
  open,
  onOpenChange,
  student,
  loading = false,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const needsParent = mvNeedsParentAccount(student);
  const needsStudent = mvNeedsStudentAccount(student);

  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [studentFullName, setStudentFullName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [delivery, setDelivery] = useState<MvEmailDelivery>('separate');
  const [parentNotifyEmail, setParentNotifyEmail] = useState('');
  const [studentNotifyEmail, setStudentNotifyEmail] = useState('');
  const [bothNotifyEmail, setBothNotifyEmail] = useState('');
  const [createParent, setCreateParent] = useState(true);
  const [createStudent, setCreateStudent] = useState(true);

  useEffect(() => {
    if (!open) return;
    const defaults = defaultMvProvisionDelivery();
    setParentName((student.payer_name || '').trim());
    setParentEmail((student.payer_email || '').trim());
    setStudentFullName((student.full_name || '').trim());
    setStudentEmail((student.email || '').trim());
    setDelivery(defaults.emailDelivery);
    setParentNotifyEmail('');
    setStudentNotifyEmail('');
    setBothNotifyEmail('');
    setCreateParent(needsParent);
    setCreateStudent(needsStudent);
  }, [open, student, needsParent, needsStudent]);

  const previewTargets = useMemo(
    () =>
      resolveMvNotifyTargets({
        emailDelivery: delivery,
        parentAccountEmail: parentEmail,
        studentAccountEmail: studentEmail,
        parentNotifyEmail,
        studentNotifyEmail,
        bothNotifyEmail,
      }),
    [delivery, parentEmail, studentEmail, parentNotifyEmail, studentNotifyEmail, bothNotifyEmail],
  );

  const scope: MvProvisionDialogSubmit['scope'] =
    createParent && createStudent ? 'both' : createParent ? 'parent' : createStudent ? 'student' : 'auto';

  const canSubmit =
    (createParent ? parentName.trim() && parentEmail.trim().includes('@') : true) &&
    (createStudent
      ? studentFullName.trim()
        && (!studentEmail.trim() || studentEmail.trim().includes('@'))
        && previewTargets.studentTo.includes('@')
      : true) &&
    (createParent && createStudent
      ? parentEmail.trim().toLowerCase() !== studentEmail.trim().toLowerCase()
      : true) &&
    (createParent || createStudent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('compStu.provisionDialogTitle')}</DialogTitle>
          <DialogDescription>{t('compStu.provisionDialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('compStu.provisionCreateWhich')}
            </p>
            <div className="flex flex-wrap gap-3">
              {needsParent && (
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={createParent}
                    onChange={(e) => setCreateParent(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  {t('compStu.provisionParentAccount')}
                </label>
              )}
              {needsStudent && (
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={createStudent}
                    onChange={(e) => setCreateStudent(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  {t('compStu.provisionStudentAccount')}
                </label>
              )}
            </div>
          </div>

          {createParent && (
            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-600">{t('compStu.provisionParentAccount')}</p>
              <div className="space-y-2">
                <Label>{t('compStu.parentNameLabel')}</Label>
                <Input value={parentName} onChange={(e) => setParentName(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>{t('compStu.provisionParentLoginEmail')}</Label>
                <Input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  className="rounded-xl"
                  placeholder="tevas@example.com"
                />
              </div>
            </div>
          )}

          {createStudent && (
            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-600">{t('compStu.provisionStudentAccount')}</p>
              <div className="space-y-2">
                <Label>{t('compStu.fullNameRequired')}</Label>
                <Input
                  value={studentFullName}
                  onChange={(e) => setStudentFullName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('compStu.provisionStudentLoginEmail')}</Label>
                <Input
                  type="email"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  className="rounded-xl"
                  placeholder="mokinys@example.com"
                />
                {!studentEmail.trim() && (
                  <p className="text-[11px] text-gray-500">
                    {t('compStu.provisionStudentUsernameHint', { email: previewTargets.studentTo || '—' })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('compStu.provisionDeliveryLabel')}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={delivery === 'separate' ? 'default' : 'outline'}
                className="rounded-xl text-xs"
                onClick={() => setDelivery('separate')}
              >
                {t('compStu.provisionDeliverySeparate')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={delivery === 'parent_both' ? 'default' : 'outline'}
                className="rounded-xl text-xs"
                onClick={() => setDelivery('parent_both')}
              >
                {t('compStu.provisionDeliveryParentBoth')}
              </Button>
            </div>
          </div>

          {delivery === 'separate' ? (
            <div className="space-y-3">
              {createParent && (
                <div className="space-y-2">
                  <Label>{t('compStu.provisionSendParentTo')}</Label>
                  <Input
                    type="email"
                    value={parentNotifyEmail}
                    onChange={(e) => setParentNotifyEmail(e.target.value)}
                    placeholder={parentEmail || t('compStu.provisionNotifyDefaultHint')}
                    className="rounded-xl"
                  />
                </div>
              )}
              {createStudent && (
                <div className="space-y-2">
                  <Label>{t('compStu.provisionSendStudentTo')}</Label>
                  <Input
                    type="email"
                    value={studentNotifyEmail}
                    onChange={(e) => setStudentNotifyEmail(e.target.value)}
                    placeholder={studentEmail || t('compStu.provisionNotifyDefaultHint')}
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t('compStu.provisionSendBothTo')}</Label>
              <Input
                type="email"
                value={bothNotifyEmail}
                onChange={(e) => setBothNotifyEmail(e.target.value)}
                placeholder={parentEmail || t('compStu.provisionNotifyDefaultHint')}
                className="rounded-xl"
              />
            </div>
          )}

          {(createParent || createStudent) && (
            <p className="text-[11px] text-gray-500">
              {createParent && createStudent
                ? t('compStu.provisionDeliveryPreviewBoth', {
                    parent: previewTargets.parentTo,
                    student: previewTargets.studentTo,
                  })
                : createParent
                  ? t('compStu.provisionDeliveryPreviewParent', { email: previewTargets.parentTo })
                  : t('compStu.provisionDeliveryPreviewStudent', { email: previewTargets.studentTo })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            {t('compStu.cancelBtn')}
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-emerald-700 hover:bg-emerald-800"
            disabled={loading || !canSubmit}
            onClick={() =>
              void onSubmit({
                parentName: parentName.trim(),
                parentEmail: parentEmail.trim(),
                studentFullName: studentFullName.trim(),
                studentEmail: studentEmail.trim(),
                emailDelivery: delivery,
                parentNotifyEmail: parentNotifyEmail.trim() || undefined,
                studentNotifyEmail: studentNotifyEmail.trim() || undefined,
                bothNotifyEmail: bothNotifyEmail.trim() || undefined,
                scope,
              })
            }
          >
            {loading ? t('common.loading') : t('compStu.provisionAccountsExisting')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
