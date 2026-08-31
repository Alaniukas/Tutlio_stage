import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Check, ArrowRight, AlertCircle, Eye, EyeOff, ChevronLeft, User, Users, Mail, Phone } from 'lucide-react';
import { cn, formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { proKlaseLegalHref, usesProKlaseLegalDocs } from '@/lib/proKlaseLegal';

type Step = 'verify' | 'profile' | 'account' | 'done';

interface StudentData {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    tutor_id: string | null;
    payer_name?: string | null;
    payer_email?: string | null;
    payer_phone?: string | null;
    child_birth_date?: string | null;
    organization_id?: string | null;
    tutor_full_name?: string | null;
    tutor_cancellation_hours?: number | null;
    tutor_cancellation_fee_percent?: number | null;
    tutor?: { full_name: string };
    organization_entity_type?: string | null;
}

/** Parent/guardian data from DB is trustworthy for onboarding UI when formatted phone validates */
function schoolParentPayerCompleteFromInvite(
    isSchool: boolean,
    name: string,
    email: string,
    phoneRaw: string,
    locale: string,
): boolean {
    if (!isSchool) return false;
    const n = name.trim();
    const e = email.trim();
    const p = formatLocalizedPhone((phoneRaw || '').trim(), locale);
    if (!n || !e || !p.trim()) return false;
    return validateLocalizedPhone(p, locale);
}

interface Subject {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
    color: string;
}

const STEPS = ['verify', 'profile', 'account', 'done'] as const;

const GRADES_LT = [
    '1 klasė', '2 klasė', '3 klasė', '4 klasė', '5 klasė',
    '6 klasė', '7 klasė', '8 klasė', '9 klasė', '10 klasė',
    '11 klasė', '12 klasė', 'Studentas', 'Kita',
];
function StepIndicator({ current }: { current: Step }) {
    const { t } = useTranslation();
    const STEP_LABELS = [t('onboard.stepVerify'), t('onboard.stepProfile'), t('onboard.stepAccount'), t('onboard.stepDone')];
    const currentIdx = STEPS.indexOf(current);
    return (
        <div className="flex items-center justify-center gap-2 mb-8 overflow-x-auto px-1 py-1" style={{ scrollbarWidth: 'none' }}>
            {STEPS.slice(0, 3).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                    <div className="flex shrink-0 items-center justify-center w-10 h-10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i < currentIdx ? 'bg-violet-600 text-white' :
                            i === currentIdx ? 'bg-violet-600 text-white ring-4 ring-violet-200' :
                                'bg-gray-100 text-gray-400'
                            }`}>
                            {i < currentIdx ? <Check className="w-4 h-4" /> : i + 1}
                        </div>
                    </div>
                    <span
                        className={`text-xs font-medium hidden sm:block ${
                            i === currentIdx
                                ? 'text-white'
                                : i < currentIdx
                                    ? 'text-violet-200'
                                    : 'text-violet-300/80'
                        }`}
                    >
                        {STEP_LABELS[i]}
                    </span>
                    {i < 2 && (
                        <div
                            className={`w-8 h-0.5 ${
                                i < currentIdx ? 'bg-violet-400' : 'bg-white/25'
                            }`}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

export default function StudentOnboarding() {
    const { t, locale } = useTranslation();
    const { inviteCode } = useParams();
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>('verify');
    const [studentData, setStudentData] = useState<StudentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const errorBannerRef = useRef<HTMLParagraphElement | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const showError = useCallback((message: string) => {
        setError(message);
        requestAnimationFrame(() => {
            errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }, []);

    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

    const [age, setAge] = useState('');
    const [grade, setGrade] = useState('');
    /** Admin already set the class — skip the grade step entirely. */
    const [gradePrefilled, setGradePrefilled] = useState(false);
    const [subjectId, setSubjectId] = useState('');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    /** Org whitelabel branding (logo) for the registration header; null = default Tutlio. */
    const [orgBranding, setOrgBranding] = useState<{ name: string; logo_url: string | null } | null>(null);
    const [legalOrgId, setLegalOrgId] = useState<string | null>(null);

    const [payerType, setPayerType] = useState<'self' | 'parent'>('self');
    const [payerName, setPayerName] = useState('');
    const [payerEmail, setPayerEmail] = useState('');
    const [payerPhone, setPayerPhone] = useState('');

    /** Non-school: whether to create payer as parent + send parent portal invite */
    const [wantsParentAccount, setWantsParentAccount] = useState(false);
    /** After registration: parent invite email outcome */
    const [parentInviteOutcome, setParentInviteOutcome] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'skipped'>('idle');
    const [parentInviteCode, setParentInviteCode] = useState<string | null>(null);

    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [agreeProKlasePrivacy, setAgreeProKlasePrivacy] = useState(false);
    const [agreeProKlaseTerms, setAgreeProKlaseTerms] = useState(false);

    const [cancellationHours, setCancellationHours] = useState(24);
    const [cancellationFeePercent, setCancellationFeePercent] = useState(0);
    const [isSchoolInvite, setIsSchoolInvite] = useState(false);

    const schoolInviteParentLocked = useMemo(
        () =>
            schoolParentPayerCompleteFromInvite(
                isSchoolInvite,
                payerName,
                payerEmail,
                payerPhone,
                locale,
            ),
        [isSchoolInvite, payerName, payerEmail, payerPhone, locale],
    );

    const calculateAgeFromDate = (dateValue?: string | null): string => {
        if (!dateValue) return '';
        const birth = new Date(dateValue);
        if (Number.isNaN(birth.getTime())) return '';
        const today = new Date();
        let years = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
        return years > 0 ? String(years) : '';
    };

    useEffect(() => {
        if (inviteCode) fetchStudent();
    }, [inviteCode]);

    const fetchStudent = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: studentRows, error } = await supabase
                .rpc('get_student_by_invite_code', { p_invite_code: inviteCode?.toUpperCase() });

            const data = studentRows?.[0] ?? null;

            if (error || !data) {
                setError(t('onboard.invalidCode'));
                setStudentData(null);
                return;
            }

            if (data.linked_user_id) {
                navigate('/login');
                return;
            }

            const tutorProfile = data.tutor_full_name
                ? { full_name: data.tutor_full_name }
                : null;

            const orgType = String((data as { organization_entity_type?: string }).organization_entity_type || '').trim();
            const isSchoolOrg = orgType === 'school';

            setStudentData({ ...data, tutor: tutorProfile ?? undefined });
            setEmail(data.email || '');
            setPhone(data.phone || '');
            setIsSchoolInvite(isSchoolOrg);

            // Admin-set class skips the grade step at registration.
            const adminGrade = String((data as { grade?: string | null }).grade || '').trim();
            if (adminGrade) {
                setGrade(adminGrade);
                setGradePrefilled(true);
            }

            // Org logo in the header (public endpoint; 404 when whitelabel off →
            // default Tutlio header stays). Fire-and-forget so it never blocks.
            const brandingOrgId =
                (data as { resolved_organization_id?: string | null }).resolved_organization_id ||
                data.organization_id;
            setLegalOrgId(brandingOrgId ? String(brandingOrgId) : null);
            if (brandingOrgId) {
                void fetch(`/api/org-branding?id=${encodeURIComponent(String(brandingOrgId))}`)
                    .then(async (resp) => (resp.ok ? resp.json() : null))
                    .then((branding) => {
                        if (branding?.name) {
                            setOrgBranding({ name: String(branding.name), logo_url: branding.logo_url ?? null });
                        }
                    })
                    .catch(() => { /* default header */ });
            }
            setPayerType(isSchoolOrg ? 'parent' : 'self');
            setPayerName(isSchoolOrg ? (data.payer_name || '') : '');
            setPayerEmail(isSchoolOrg ? (data.payer_email || '') : '');
            setPayerPhone(isSchoolOrg ? formatLocalizedPhone(data.payer_phone || '', locale) : '');
            setAge(calculateAgeFromDate(data.child_birth_date));

            if (data.tutor_id) {
                setCancellationHours(data.tutor_cancellation_hours ?? 24);
                setCancellationFeePercent(data.tutor_cancellation_fee_percent ?? 0);

                const { data: subs } = await supabase
                    .from('subjects')
                    .select('id, name, price, duration_minutes, color')
                    .eq('tutor_id', data.tutor_id)
                    .order('name');
                setSubjects(subs || []);
            } else {
                setSubjects([]);
            }
        } catch (e) {
            console.error('[StudentOnboarding] fetchStudent failed:', e);
            setError(t('common.error'));
            setStudentData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = () => {
        if (!email.trim()) { showError(t('onboard.emailMandatory')); return; }
        if (!phone.trim()) { showError(t('onboard.phoneMandatory')); return; }
        if (!validateLocalizedPhone(phone, locale)) { showError(t('onboard.phoneFormatError')); return; }
        setError(null);
        setStudentData((prev) => prev ? { ...prev, email: email.trim(), phone: phone.trim() } : prev);
        setStep('profile');
    };

    const handleProfile = () => {
        if (!grade) { showError(t('onboard.selectGrade')); return; }
        const effectivePayerType = isSchoolInvite || wantsParentAccount ? 'parent' : 'self';
        if (effectivePayerType === 'parent' && !schoolInviteParentLocked) {
            if (!payerName.trim()) { showError(t('onboard.parentNameReq')); return; }
            if (!payerEmail.trim()) { showError(t('onboard.parentEmailReq')); return; }
            if (!payerPhone.trim()) { showError(t('onboard.parentPhoneReq')); return; }
            const pNorm = formatLocalizedPhone(payerPhone, locale);
            if (!validateLocalizedPhone(pNorm, locale)) { showError(t('onboard.parentPhoneFormat')); return; }
        }
        setError(null);
        setStep('account');
    };

    const mapRegisterStudentError = (body: { error?: string; code?: string }) => {
        if (body?.code === 'email_already_registered') {
            return t('onboard.emailAlreadyRegistered');
        }
        if (body?.code === 'create_user_failed' && body?.error) {
            return body.error;
        }
        return body?.error || t('onboard.createError');
    };

    const handleCreateAccount = async () => {
        if (!studentData) return;
        if (password !== passwordConfirm) { showError(t('onboard.passwordMismatch')); return; }
        if (password.length < 6) { showError(t('onboard.passwordTooShort')); return; }
        if (!agreePrivacy || !agreeTerms) {
            showError(t('onboard.mustAgree'));
            return;
        }
        if (usesProKlaseLegalDocs(legalOrgId) && (!agreeProKlasePrivacy || !agreeProKlaseTerms)) {
            showError(t('onboard.mustAgree'));
            return;
        }
        setSubmitting(true);
        setError(null);

        const acceptedAt = new Date().toISOString();
        const effectivePayerType = isSchoolInvite || wantsParentAccount ? 'parent' : 'self';
        const accountEmail = (studentData.email || email).trim().toLowerCase();

        try {
            const apiRes = await fetch('/api/register-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: accountEmail,
                    password,
                    studentId: studentData.id,
                    fullName: studentData.full_name,
                    phone: studentData.phone,
                    age,
                    grade,
                    subjectId,
                    payerType: effectivePayerType,
                    payerName: effectivePayerType === 'parent' ? payerName.trim() : null,
                    payerEmail: effectivePayerType === 'parent' ? payerEmail.trim() : null,
                    payerPhone: effectivePayerType === 'parent' ? payerPhone.trim() : null,
                    acceptedAt,
                    suppressParentInvite: isSchoolInvite,
                    locale,
                }),
            });

            const body = await apiRes.json().catch(() => ({})) as {
                error?: string;
                code?: string;
                parentInviteSent?: boolean;
                parentInviteCode?: string | null;
            };

            if (!apiRes.ok) {
                showError(mapRegisterStudentError(body));
                return;
            }

            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: accountEmail,
                password,
            });
            if (!signInError) {
                navigate('/student');
                return;
            }
            console.warn('[StudentOnboarding] auto sign-in after register failed:', signInError);

            setStep('done');

            if (isSchoolInvite || effectivePayerType !== 'parent') {
                setParentInviteOutcome('skipped');
                setParentInviteCode(null);
                return;
            }

            if (!payerEmail.trim()) {
                setParentInviteOutcome('failed');
                setParentInviteCode(null);
                return;
            }

            setParentInviteCode(body.parentInviteCode?.trim() || null);
            setParentInviteOutcome(body.parentInviteSent ? 'sent' : 'failed');
        } catch (e) {
            console.error('[StudentOnboarding] register-student failed:', e);
            showError(t('onboard.networkError'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    if (!studentData && !loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-7 h-7 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{t('onboard.codeNotFound')}</h2>
                    <p className="text-gray-500 text-sm">{error || t('onboard.invalidCode')}</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="mt-6 w-full py-3 rounded-2xl bg-violet-600 text-white font-semibold text-sm"
                    >
                        {t('onboard.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 flex items-center justify-center p-4">
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative w-full max-w-md">
                <div className="text-center mb-6">
                    {orgBranding?.logo_url ? (
                        <img
                            src={orgBranding.logo_url}
                            alt={orgBranding.name}
                            className="max-h-14 max-w-[180px] mx-auto mb-3 rounded-xl bg-white/90 p-1.5"
                        />
                    ) : (
                        <img src="/logo-icon.png" alt="Tutlio" className="w-14 h-14 rounded-2xl mx-auto mb-3" />
                    )}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white">{orgBranding?.name || 'Tutlio'}</h1>
                        {orgBranding && (
                            <p className="text-violet-300/80 text-xs mt-1">powered by Tutlio</p>
                        )}
                        <p className="text-indigo-200 mt-2">{t('onboard.joinTutor')}</p>
                    </div>
                    {step !== 'done' && (
                        <p className="text-violet-300 text-sm mt-1">
                            {t('onboard.greeting', { name: studentData?.full_name || '' })}
                        </p>
                    )}
                </div>

                {step !== 'done' && <StepIndicator current={step} />}

                {step === 'verify' && (
                    <div className="bg-white rounded-3xl p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('onboard.verifyTitle')}</h2>
                        <p className="text-sm text-gray-500 mb-5">{t('onboard.verifyDesc')}</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('onboard.emailRequired')}</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={t('onboard.emailPlaceholder')}
                                    required
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                    {t('onboard.phoneRequired')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(formatLocalizedPhone(e.target.value, locale))}
                                    placeholder={getLocalizedPhonePlaceholder(locale)}
                                    required
                                    className={`w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50 ${!phone.trim() && error ? 'border-red-400' : 'border-gray-200'}`}
                                />
                            </div>
                        </div>

                        {error && (
                            <p ref={errorBannerRef} className="text-sm text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2">{error}</p>
                        )}

                        <button
                            onClick={handleVerify}
                            disabled={submitting}
                            className="mt-5 w-full py-3.5 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <span>{t('onboard.continue')}</span><ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {step === 'profile' && (
                    <div className="bg-white rounded-3xl p-6 shadow-2xl">
                        <button onClick={() => setStep('verify')} className="flex items-center gap-1 text-gray-400 text-sm mb-4 hover:text-gray-700">
                            <ChevronLeft className="w-4 h-4" /> {t('common.back')}
                        </button>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('onboard.profileTitle')}</h2>
                        <p className="text-sm text-gray-500 mb-5">{t('onboard.profileDesc')}</p>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('onboard.ageLabel')}</label>
                                <input
                                    type="number"
                                    value={age}
                                    onChange={(e) => setAge(e.target.value)}
                                    placeholder="pvz. 15"
                                    min="5" max="99"
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                />
                            </div>

                            {/* Admin-set class skips the grade step entirely. */}
                            {!gradePrefilled && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                        {t('onboard.gradeLabel')} <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {GRADES_LT.map((g, idx) => (
                                            <button
                                                key={g}
                                                type="button"
                                                onClick={() => { setGrade(g); setError(null); }}
                                                className={`py-2 px-2 rounded-xl text-xs font-medium border transition-all ${grade === g
                                                        ? 'bg-violet-600 border-violet-600 text-white'
                                                        : (error && !grade ? 'bg-red-50 border-red-300 text-gray-700 hover:border-violet-300' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-violet-300')
                                                    }`}
                                            >
                                                {idx < 12 ? t('onboard.gradeN', { n: idx + 1 }) : idx === 12 ? t('lessonSet.gradeUniversity') : t('onboard.gradeOther')}
                                            </button>
                                        ))}
                                    </div>
                                    {error && !grade && <p className="text-xs text-red-500 mt-1">{t('onboard.selectGrade')}</p>}
                                </div>
                            )}

                            <div>
                                {!isSchoolInvite && (
                                    <>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                            {t('onboard.parentAccountQ')} <span className="text-red-500">*</span>
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                            <button
                                                type="button"
                                                onClick={() => { setWantsParentAccount(true); setError(null); }}
                                                className={cn(
                                                    'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all',
                                                    wantsParentAccount ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-gray-50 hover:border-violet-300'
                                                )}
                                            >
                                                <Users className="w-5 h-5 text-gray-600" />
                                                <span className="text-sm font-semibold text-gray-900">{t('common.yes')}</span>
                                                <span className="text-xs text-gray-500 leading-tight">
                                                    {t('onboard.parentPaysDesc')}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setWantsParentAccount(false);
                                                    setPayerType('self');
                                                    setPayerName('');
                                                    setPayerEmail('');
                                                    setPayerPhone('');
                                                    setError(null);
                                                }}
                                                className={cn(
                                                    'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all',
                                                    !wantsParentAccount ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-gray-50 hover:border-violet-300'
                                                )}
                                            >
                                                <User className="w-5 h-5 text-gray-600" />
                                                <span className="text-sm font-semibold text-gray-900">{t('common.no')}</span>
                                                <span className="text-xs text-gray-500 leading-tight">
                                                    {t('onboard.selfPaysDesc')}
                                                </span>
                                            </button>
                                        </div>
                                        {wantsParentAccount && (
                                            <p className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 mb-2">
                                                {t('onboard.parentWillBeSet')}
                                            </p>
                                        )}
                                    </>
                                )}

                                {(isSchoolInvite || wantsParentAccount) && !schoolInviteParentLocked && (
                                    <div className="space-y-3 pt-2 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 pt-2">
                                            {isSchoolInvite ? t('onboard.parentDetailsFill') : t('onboard.parentInfo')}
                                        </p>
                                        <div>
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                                <User className="w-3 h-3" /> {t('onboard.parentName')}
                                            </label>
                                            <input
                                                type="text"
                                                value={payerName}
                                                onChange={(e) => setPayerName(e.target.value)}
                                                placeholder={t('settings.namePlaceholder')}
                                                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                                <Mail className="w-3 h-3" /> {t('onboard.parentEmail')}
                                            </label>
                                            <input
                                                type="email"
                                                value={payerEmail}
                                                onChange={(e) => setPayerEmail(e.target.value)}
                                                placeholder={locale === 'es' ? 'padre@ejemplo.es' : 'parent@example.com'}
                                                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                                <Phone className="w-3 h-3" /> {t('onboard.parentPhone')}
                                            </label>
                                            <input
                                                type="tel"
                                                value={payerPhone}
                                                onChange={(e) => setPayerPhone(formatLocalizedPhone(e.target.value, locale))}
                                                placeholder={getLocalizedPhonePlaceholder(locale)}
                                                required
                                                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && (
                            <p ref={errorBannerRef} className="text-sm text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2">{error}</p>
                        )}

                        <button
                            onClick={handleProfile}
                            disabled={submitting}
                            className="mt-5 w-full py-3.5 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <span>{t('onboard.continue')}</span><ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {step === 'account' && (
                    <div className="bg-white rounded-3xl p-6 shadow-2xl">
                        <button onClick={() => setStep('profile')} className="flex items-center gap-1 text-gray-400 text-sm mb-4 hover:text-gray-700">
                            <ChevronLeft className="w-4 h-4" /> {t('common.back')}
                        </button>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('onboard.createAccountTitle')}</h2>
                        <p className="text-sm text-gray-500 mb-5">
                            {t('onboard.loginWith', { email: studentData?.email || '' })}
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('onboard.passwordLabel')}</label>
                                <div className="relative">
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={t('onboard.minChars')}
                                        className="w-full px-4 py-3 pr-12 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                    />
                                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                                        {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('onboard.confirmPassword')}</label>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    placeholder={t('onboard.enterAgain')}
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                />
                            </div>

                            <div className="space-y-3 pt-2">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={agreePrivacy}
                                        onChange={(e) => setAgreePrivacy(e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    <span className="text-sm text-gray-600">
                                        {t('auth.agreeWith')}{' '}
                                        <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.privacyPolicy')}</Link>
                                        . <span className="text-red-500">*</span>
                                    </span>
                                </label>
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={agreeTerms}
                                        onChange={(e) => setAgreeTerms(e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    <span className="text-sm text-gray-600">
                                        {t('auth.agreeWith')}{' '}
                                        <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.termsOfService')}</Link>
                                        . <span className="text-red-500">*</span>
                                    </span>
                                </label>
                                {usesProKlaseLegalDocs(legalOrgId) && (
                                    <>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={agreeProKlasePrivacy}
                                                onChange={(e) => setAgreeProKlasePrivacy(e.target.checked)}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm text-gray-600">
                                                {t('auth.agreeWith')}{' '}
                                                <a href={proKlaseLegalHref('privacy')} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.proklasePrivacyPolicy')}</a>
                                                . <span className="text-red-500">*</span>
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={agreeProKlaseTerms}
                                                onChange={(e) => setAgreeProKlaseTerms(e.target.checked)}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm text-gray-600">
                                                {t('auth.agreeWith')}{' '}
                                                <a href={proKlaseLegalHref('terms')} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.proklaseTermsOfService')}</a>
                                                . <span className="text-red-500">*</span>
                                            </span>
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div className="mt-3 space-y-2">
                                <p ref={errorBannerRef} className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
                                <Link
                                    to="/login"
                                    className="inline-flex w-full items-center justify-center rounded-2xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"
                                >
                                    {t('onboard.backToLogin')}
                                </Link>
                            </div>
                        )}

                        <button
                            onClick={handleCreateAccount}
                            disabled={submitting || !password || !passwordConfirm || !agreePrivacy || !agreeTerms || (usesProKlaseLegalDocs(legalOrgId) && (!agreeProKlasePrivacy || !agreeProKlaseTerms))}
                            className="mt-5 w-full py-3.5 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {submitting ? t('onboard.creatingAccount') : <><span>{t('onboard.createAccountBtn')}</span><ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </div>
                )}

                {step === 'done' && (
                    <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
                        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                            <Check className="w-10 h-10 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('onboard.doneTitle')}</h2>
                        <p className="text-gray-500 text-sm mb-4">
                            {t('onboard.doneDesc')}
                        </p>
                        <div className="bg-green-50 p-4 border border-green-100 rounded-xl mb-6 text-sm text-green-800 text-left flex items-start gap-3 shadow-inner">
                            <Check className="w-5 h-5 flex-shrink-0 text-green-600 mt-0.5" />
                            <div>
                                {t('onboard.accountReady')}
                            </div>
                        </div>

                        {(parentInviteOutcome === 'sending' || parentInviteOutcome === 'sent' || parentInviteOutcome === 'failed') && (
                            <div
                                className={`rounded-xl p-4 mb-4 text-left text-sm ${
                                    parentInviteOutcome === 'sent'
                                        ? 'bg-green-50 border border-green-200 text-green-800'
                                        : parentInviteOutcome === 'sending'
                                            ? 'bg-violet-50 border border-violet-200 text-violet-900'
                                        : 'bg-amber-50 border border-amber-200 text-amber-900'
                                }`}
                            >
                                {parentInviteOutcome === 'sent' ? (
                                    <>
                                        <Check className="w-4 h-4 inline mr-1" />
                                        {t('onboard.parentInviteSent', { email: payerEmail.trim() })}
                                    </>
                                ) : parentInviteOutcome === 'sending' ? (
                                    <>
                                        <div className="w-4 h-4 inline-block mr-2 align-[-2px] border-2 border-violet-300 border-t-violet-700 rounded-full animate-spin" />
                                        {t('onboard.sendingParentInvite')}
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="w-4 h-4 inline mr-1" />
                                        {parentInviteCode ? (
                                            <>
                                                {t('onboard.parentInviteEmailFailedPre')}{' '}
                                                <strong>tutlio.lt/parent-register</strong> {t('onboard.parentInviteEmailFailedMid')}{' '}
                                                <strong className="font-mono tracking-widest">{parentInviteCode}</strong>
                                            </>
                                        ) : (
                                            t('onboard.parentInviteCreateFailed')
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => navigate('/login')}
                            className="mt-2 w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors"
                        >
                            {t('onboard.backToLogin')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
