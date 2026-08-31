import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { fetchParentInvitePreviewByCode, fetchParentInvitePreviewByToken } from '@/lib/parentInvitePreview';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Check, Eye, EyeOff, Users } from 'lucide-react';
import { parentLegalAcceptanceMissing, proKlaseLegalHref, usesProKlaseLegalDocs } from '@/lib/proKlaseLegal';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatLocalYmd } from '@/lib/monthlyPackagePlan';
import { normalizeStudentGrade1to12, studentGradeSelectValue } from '@/lib/studentGrade';

function ageFromIso(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export default function ParentRegister() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = (params.get('token') || '').trim();

  const [loading, setLoading] = useState(!!tokenFromUrl);
  const [invite, setInvite] = useState<{ parent_email: string; parent_name: string; student_name: string; parent_phone?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Resolved URL token (from link or from code+email lookup) */
  const [resolvedToken, setResolvedToken] = useState<string | null>(tokenFromUrl || null);

  const [manualCode, setManualCode] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [lookupSubmitting, setLookupSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeProKlasePrivacy, setAgreeProKlasePrivacy] = useState(false);
  const [agreeProKlaseTerms, setAgreeProKlaseTerms] = useState(false);
  const [legalOrgId, setLegalOrgId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Parent-oriented registration (req 7): confirm the child's details.
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childGrade, setChildGrade] = useState('');

  useEffect(() => {
    if (!tokenFromUrl) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error: fetchErr } = await fetchParentInvitePreviewByToken(tokenFromUrl);

      if (fetchErr || !data) {
        setError(t('parent.invalidToken'));
      } else if (data.used) {
        setError(t('parent.tokenUsed'));
      } else {
        setInvite({
          parent_email: data.parent_email,
          parent_name: data.parent_name || '',
          student_name: data.student_full_name || '',
          parent_phone: data.parent_phone ?? null,
        });
        setLegalOrgId(data.organization_id ? String(data.organization_id) : null);
        setFullName(data.parent_name || '');
        setChildGrade(studentGradeSelectValue(data.student_grade || ''));
        setChildBirthDate(String(data.student_birth_date || '').slice(0, 10));
        setResolvedToken(data.token?.trim() || tokenFromUrl);
      }
      setLoading(false);
    })();
  }, [tokenFromUrl, t]);

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();
    const email = manualEmail.trim();
    if (!code || !email) {
      setError(t('parent.manualMissing'));
      return;
    }
    setLookupSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await fetchParentInvitePreviewByCode(code, email);

      if (rpcErr || !data) {
        setError(t('parent.invalidManualInvite'));
        setLookupSubmitting(false);
        return;
      }
      if (data.used) {
        setError(t('parent.tokenUsed'));
        setLookupSubmitting(false);
        return;
      }
      setInvite({
        parent_email: data.parent_email,
        parent_name: data.parent_name || '',
        student_name: data.student_full_name || '',
        parent_phone: data.parent_phone ?? null,
      });
      setLegalOrgId(data.organization_id ? String(data.organization_id) : null);
      setFullName(data.parent_name || '');
      setChildGrade(studentGradeSelectValue(data.student_grade || ''));
      setChildBirthDate(String(data.student_birth_date || '').slice(0, 10));
      setResolvedToken(data.token);
    } catch {
      setError(t('common.error'));
    } finally {
      setLookupSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !password || password.length < 6) {
      setError(t('parent.fillAll'));
      return;
    }
    const grade = normalizeStudentGrade1to12(childGrade);
    if (!grade) {
      setError(t('parent.gradeRequired'));
      return;
    }
    if (!(invite?.parent_email || '').trim() && !manualEmail.trim()) {
      setError(t('parent.fillAll'));
      return;
    }
    if (!resolvedToken && (!manualCode.trim() || !manualEmail.trim())) {
      setError(t('parent.invalidToken'));
      return;
    }

    const privacyOk = agreePrivacy && (!usesProKlaseLegalDocs(legalOrgId) || agreeProKlasePrivacy);
    const termsOk = agreeTerms && (!usesProKlaseLegalDocs(legalOrgId) || agreeProKlaseTerms);
    if (parentLegalAcceptanceMissing({
      orgIdOrSlug: legalOrgId,
      acceptedPrivacy: privacyOk,
      acceptedTerms: termsOk,
    })) {
      setError(t('parent.mustAcceptLegal'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string> = {
        fullName: fullName.trim(),
        password,
      };
      if (resolvedToken) {
        body.token = resolvedToken;
      } else {
        body.code = manualCode.trim().toUpperCase();
        body.email = manualEmail.trim();
      }
      if (childBirthDate.trim()) body.childBirthDate = childBirthDate.trim();
      body.childGrade = grade;
      const payload = {
        ...body,
        acceptedPrivacy: agreePrivacy && (!usesProKlaseLegalDocs(legalOrgId) || agreeProKlasePrivacy),
        acceptedTerms: agreeTerms && (!usesProKlaseLegalDocs(legalOrgId) || agreeProKlaseTerms),
        acceptedAt: new Date().toISOString(),
      };

      const resp = await fetch('/api/register-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: string; code?: string };
        const code = err.code;
        if (code === 'invite_not_found') {
          setError(t('parent.invalidManualInvite'));
        } else if (code === 'invite_used') {
          setError(t('parent.tokenUsed'));
        } else if (code === 'registration_failed' || code === 'email_already_registered') {
          setError(t('parent.registerFailed'));
        } else if (code === 'grade_required') {
          setError(t('parent.gradeRequired'));
        } else if (code === 'legal_required') {
          setError(t('parent.mustAcceptLegal'));
        } else {
          setError(err.error || t('parent.registerFailed'));
        }
        setSubmitting(false);
        return;
      }

      // Sign in right away so activation lands in the portal without a second
      // manual login; the "done" card stays as fallback if sign-in fails.
      const loginEmail = (invite?.parent_email || manualEmail).trim().toLowerCase();
      if (loginEmail) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });
        if (!signInErr) {
          navigate('/parent', { replace: true });
          return;
        }
      }
      setDone(true);
    } catch {
      setError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tutlio</h1>
          <p className="text-sm text-gray-500 mt-1">{t('parent.registerTitle')}</p>
        </div>

        {done ? (
          <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('parent.registerDone')}</h2>
            <p className="text-gray-500 text-sm mb-4">{t('parent.registerDoneDesc')}</p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700"
            >
              {t('parent.goToLogin')}
            </button>
          </div>
        ) : error && !invite && tokenFromUrl ? (
          <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button type="button" onClick={() => navigate('/login')} className="text-violet-600 font-medium text-sm hover:underline">
              {t('parent.goToLogin')}
            </button>
          </div>
        ) : !invite && !tokenFromUrl ? (
          <form onSubmit={handleManualLookup} className="bg-white rounded-3xl p-8 shadow-2xl space-y-4">
            <p className="text-sm text-gray-600 text-center">{t('parent.manualExplain')}</p>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.manualCode')}</label>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono tracking-widest uppercase"
                placeholder="ABC12345"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('common.email')}</label>
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                placeholder="tevas@pastas.lt"
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={lookupSubmitting}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {lookupSubmitting ? t('common.loading') : t('parent.manualContinue')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full text-sm text-violet-600 font-medium hover:underline"
            >
              {t('parent.goToLogin')}
            </button>
          </form>
        ) : invite ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-8 shadow-2xl space-y-4">
            <p className="text-sm text-gray-500 text-center">
              {t('parent.registerFor', { student: invite.student_name })}
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('common.email')} <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={invite.parent_email}
                disabled
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50"
              />
            </div>
            {invite.parent_phone && (
              <div>
                <label className="text-sm font-medium text-gray-700">{t('common.phone')}</label>
                <input
                  type="tel"
                  value={invite.parent_phone}
                  disabled
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.fullName')} <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                placeholder={t('parent.fullNamePlaceholder')}
              />
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-violet-700">
                {t('parent.childInfoTitle', { student: invite.student_name })}
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">{t('parent.childGrade')} <span className="text-red-500">*</span></label>
                <Select value={childGrade || undefined} onValueChange={setChildGrade}>
                  <SelectTrigger className="h-10 mt-1 rounded-xl bg-white">
                    <SelectValue placeholder={t('parent.childGradePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => (
                      <SelectItem key={index + 1} value={String(index + 1)}>
                        {t('onboard.gradeN', { n: index + 1 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  {t('parent.childBirthDate')} ({t('common.optional')})
                </label>
                <DateInput
                  value={childBirthDate}
                  max={formatLocalYmd(new Date())}
                  defaultMonth={new Date(new Date().getFullYear() - 10, 0, 1)}
                  onChange={(e) => setChildBirthDate(e.target.value)}
                  className="mt-1 rounded-xl bg-white"
                />
                {childBirthDate && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t('parent.childAge', { age: String(ageFromIso(childBirthDate) ?? '—') })}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.password')} <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm pr-10"
                  placeholder="Min. 6 simboliai"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600" />
                <span className="text-sm text-gray-600">
                  {t('auth.agreeWith')}{' '}
                  <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.privacyPolicy')}</Link>
                  . <span className="text-red-500">*</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600" />
                <span className="text-sm text-gray-600">
                  {t('auth.agreeWith')}{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.termsOfService')}</Link>
                  . <span className="text-red-500">*</span>
                </span>
              </label>
              {usesProKlaseLegalDocs(legalOrgId) && (
                <>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreeProKlasePrivacy} onChange={(e) => setAgreeProKlasePrivacy(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600" />
                  <span className="text-sm text-gray-600">
                    {t('auth.agreeWith')}{' '}
                    <a href={proKlaseLegalHref('privacy')} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.proklasePrivacyPolicy')}</a>
                    . <span className="text-red-500">*</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreeProKlaseTerms} onChange={(e) => setAgreeProKlaseTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600" />
                  <span className="text-sm text-gray-600">
                    {t('auth.agreeWith')}{' '}
                    <a href={proKlaseLegalHref('terms')} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.proklaseTermsOfService')}</a>
                    . <span className="text-red-500">*</span>
                  </span>
                </label>
                </>
              )}
            </div>
            {error && (
              <div className="space-y-2">
                <p className="text-red-500 text-xs">{error}</p>
                <Link
                  to="/login"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"
                >
                  {t('parent.goToLogin')}
                </Link>
              </div>
            )}
            <button type="submit" disabled={submitting || !fullName.trim() || password.length < 6 || !normalizeStudentGrade1to12(childGrade) || !agreePrivacy || !agreeTerms || (usesProKlaseLegalDocs(legalOrgId) && (!agreeProKlasePrivacy || !agreeProKlaseTerms))} className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50">
              {submitting ? t('common.loading') : t('parent.registerBtn')}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
