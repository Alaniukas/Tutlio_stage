import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Check, ArrowRight, GraduationCap, AlertCircle, Eye, EyeOff, ChevronLeft, User, Users, Mail, Phone, Info } from 'lucide-react';
import { formatLithuanianPhone, validateLithuanianPhone } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

type Step = 'verify' | 'profile' | 'account' | 'done';

interface StudentData {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    tutor_id: string | null;
    tutor?: { full_name: string };
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
const GRADES_EN = [
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
    'Grade 11', 'Grade 12', 'University', 'Other',
];

function StepIndicator({ current }: { current: Step }) {
    const { t } = useTranslation();
    const STEP_LABELS = [t('onboard.stepVerify'), t('onboard.stepProfile'), t('onboard.stepAccount'), t('onboard.stepDone')];
    const currentIdx = STEPS.indexOf(current);
    return (
        <div className="flex items-center justify-center gap-2 mb-8 overflow-x-auto px-1" style={{ scrollbarWidth: 'none' }}>
            {STEPS.slice(0, 3).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i < currentIdx ? 'bg-violet-600 text-white' :
                        i === currentIdx ? 'bg-violet-600 text-white ring-4 ring-violet-200' :
                            'bg-gray-100 text-gray-400'
                        }`}>
                        {i < currentIdx ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${i === currentIdx ? 'text-gray-900' : 'text-gray-400'}`}>
                        {STEP_LABELS[i]}
                    </span>
                    {i < 2 && <div className={`w-8 h-0.5 ${i < currentIdx ? 'bg-violet-600' : 'bg-gray-200'}`} />}
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
    const [submitting, setSubmitting] = useState(false);

    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

    const [age, setAge] = useState('');
    const [grade, setGrade] = useState('');
    const [subjectId, setSubjectId] = useState('');
    const [subjects, setSubjects] = useState<Subject[]>([]);

    const [payerType, setPayerType] = useState<'self' | 'parent'>('self');
    const [payerName, setPayerName] = useState('');
    const [payerEmail, setPayerEmail] = useState('');
    const [payerPhone, setPayerPhone] = useState('');

    const [wantsParentAccount, setWantsParentAccount] = useState(false);
    const [parentRegEmail, setParentRegEmail] = useState('');
    const [parentRegSent, setParentRegSent] = useState(false);
    const [parentRegError, setParentRegError] = useState<string | null>(null);
    const [parentRegSubmitting, setParentRegSubmitting] = useState(false);

    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(false);

    const [cancellationHours, setCancellationHours] = useState(24);
    const [cancellationFeePercent, setCancellationFeePercent] = useState(0);

    useEffect(() => {
        if (inviteCode) fetchStudent();
    }, [inviteCode]);

    const fetchStudent = async () => {
        setLoading(true);
        const { data: studentRows, error } = await supabase
            .rpc('get_student_by_invite_code', { p_invite_code: inviteCode?.toUpperCase() });

        const data = studentRows?.[0] ?? null;

        if (error || !data) {
            setError(t('onboard.invalidCode'));
        } else {
            if (data.linked_user_id) {
                navigate('/login');
                return;
            }

            let tutorProfile: { full_name: string } | null = null;
            if (data.tutor_id) {
                const { data: tp } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', data.tutor_id)
                    .single();
                tutorProfile = tp;
            }

            setStudentData({ ...data, tutor: tutorProfile ?? undefined });
            setEmail(data.email || '');
            setPhone(data.phone || '');

            if (data.tutor_id) {
                const { data: tutorSettings } = await supabase
                    .from('profiles')
                    .select('cancellation_hours, cancellation_fee_percent')
                    .eq('id', data.tutor_id)
                    .single();
                if (tutorSettings) {
                    setCancellationHours(tutorSettings.cancellation_hours ?? 24);
                    setCancellationFeePercent(tutorSettings.cancellation_fee_percent ?? 0);
                }

                const { data: subs } = await supabase
                    .from('subjects')
                    .select('id, name, price, duration_minutes, color')
                    .eq('tutor_id', data.tutor_id)
                    .order('name');
                setSubjects(subs || []);
            } else {
                setSubjects([]);
            }
        }
        setLoading(false);
    };

    const handleVerify = () => {
        if (!email.trim()) { setError(t('onboard.emailMandatory')); return; }
        if (!phone.trim()) { setError(t('onboard.phoneMandatory')); return; }
        if (!validateLithuanianPhone(phone)) { setError(t('onboard.phoneFormatError')); return; }
        setError(null);
        setStudentData((prev) => prev ? { ...prev, email: email.trim(), phone: phone.trim() } : prev);
        setStep('profile');
    };

    const handleProfile = () => {
        if (!grade) { setError(t('onboard.selectGrade')); return; }
        if (payerType === 'parent') {
            if (!payerName.trim()) { setError(t('onboard.parentNameReq')); return; }
            if (!payerEmail.trim()) { setError(t('onboard.parentEmailReq')); return; }
            if (!payerPhone.trim()) { setError(t('onboard.parentPhoneReq')); return; }
            if (!validateLithuanianPhone(payerPhone)) { setError(t('onboard.parentPhoneFormat')); return; }
        }
        setError(null);
        setStep('account');
    };

    const handleCreateAccount = async () => {
        if (!studentData) return;
        if (password !== passwordConfirm) { setError(t('onboard.passwordMismatch')); return; }
        if (password.length < 6) { setError(t('onboard.passwordTooShort')); return; }
        if (!agreePrivacy || !agreeTerms) {
            setError(t('onboard.mustAgree'));
            return;
        }
        setSubmitting(true);
        setError(null);

        const acceptedAt = new Date().toISOString();

        const apiRes = await fetch('/api/register-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: studentData.email,
                password,
                studentId: studentData.id,
                fullName: studentData.full_name,
                phone: studentData.phone,
                age,
                grade,
                subjectId,
                payerType,
                payerName: payerType === 'parent' ? payerName.trim() : null,
                payerEmail: payerType === 'parent' ? payerEmail.trim() : null,
                payerPhone: payerType === 'parent' ? payerPhone.trim() : null,
                acceptedAt,
            }),
        });

        if (!apiRes.ok) {
            const body = await apiRes.json().catch(() => ({}));
            setError(body?.error || t('onboard.createError'));
            setSubmitting(false);
            return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: studentData.email,
            password,
        });

        if (signInError) {
            setError(signInError.message);
            setSubmitting(false);
            return;
        }

        setStep('done');
        setSubmitting(false);
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
                    <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-3">
                        <GraduationCap className="w-7 h-7 text-white" />
                    </div>
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white">Tutlio</h1>
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
                                    placeholder={locale === 'en' ? 'your@email.com' : 'jūsų@email.lt'}
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
                                    onChange={(e) => setPhone(formatLithuanianPhone(e.target.value))}
                                    placeholder="+37060000000"
                                    required
                                    className={`w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50 ${!phone.trim() && error ? 'border-red-400' : 'border-gray-200'}`}
                                />
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

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
                                            {locale === 'en' ? GRADES_EN[idx] : g}
                                        </button>
                                    ))}
                                </div>
                                {error && !grade && <p className="text-xs text-red-500 mt-1">{t('onboard.selectGrade')}</p>}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    {t('onboard.whoPays')} <span className="text-red-500">*</span>
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                    {(['self', 'parent'] as const).map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setPayerType(v)}
                                            className={cn(
                                                'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all',
                                                payerType === v ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-gray-50 hover:border-violet-300'
                                            )}
                                        >
                                            {v === 'self'
                                                ? <User className="w-5 h-5 text-gray-600" />
                                                : <Users className="w-5 h-5 text-gray-600" />}
                                            <span className="text-sm font-semibold text-gray-900">{v === 'self' ? t('onboard.self') : t('onboard.parent')}</span>
                                            <span className="text-xs text-gray-500 leading-tight">{v === 'self' ? t('onboard.selfDesc') : t('onboard.parentDesc')}</span>
                                        </button>
                                    ))}
                                </div>

                                {payerType === 'parent' && (
                                    <div className="space-y-3 pt-2 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 pt-2">{t('onboard.parentInfo')}</p>
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
                                                placeholder="tevas@pavyzdys.lt"
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
                                                onChange={(e) => setPayerPhone(formatLithuanianPhone(e.target.value))}
                                                placeholder="+370 600 00000"
                                                required
                                                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

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
                                        {t('auth.agreeWith')} <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.privacyPolicy')}</Link>. <span className="text-red-500">*</span>
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
                                        {t('auth.agreeWith')} <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">{t('auth.termsOfService')}</Link>. <span className="text-red-500">*</span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

                        <button
                            onClick={handleCreateAccount}
                            disabled={submitting || !password || !passwordConfirm || !agreePrivacy || !agreeTerms}
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
                        <div className="bg-violet-50 p-4 border border-violet-100 rounded-xl mb-6 text-sm text-violet-800 text-left flex items-start gap-3 shadow-inner">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 text-violet-600 mt-0.5" />
                            <div>
                                <span className="font-bold">{t('onboard.confirmEmail')}</span><br />
                                {t('onboard.confirmEmailDesc', { email: studentData?.email || '' })}
                            </div>
                        </div>

                        {/* Parent account registration */}
                        {!parentRegSent ? (
                            <div className="border border-gray-200 rounded-xl p-4 mb-4 text-left">
                                <div className="flex items-center gap-3 mb-3">
                                    <Users className="w-5 h-5 text-violet-600" />
                                    <h3 className="text-sm font-bold text-gray-900">{t('onboard.parentAccountTitle')}</h3>
                                </div>
                                {!wantsParentAccount ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setWantsParentAccount(true);
                                            if (payerType === 'parent' && payerEmail) setParentRegEmail(payerEmail);
                                        }}
                                        className="w-full py-2.5 rounded-xl bg-violet-50 text-violet-700 font-medium text-sm hover:bg-violet-100 transition-colors"
                                    >
                                        {t('onboard.createParentAccount')}
                                    </button>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-xs text-gray-500">{t('onboard.parentAccountDesc')}</p>
                                        <div>
                                            <label className="text-xs text-gray-500 font-medium">{t('onboard.parentAccountEmail')}</label>
                                            <input
                                                type="email"
                                                value={parentRegEmail}
                                                onChange={(e) => setParentRegEmail(e.target.value)}
                                                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                                placeholder="tevas@email.com"
                                            />
                                        </div>
                                        {parentRegError && <p className="text-red-500 text-xs">{parentRegError}</p>}
                                        <button
                                            type="button"
                                            disabled={parentRegSubmitting || !parentRegEmail.trim()}
                                            onClick={async () => {
                                                setParentRegSubmitting(true);
                                                setParentRegError(null);
                                                try {
                                                    const resp = await fetch('/api/create-parent-invite', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            parentEmail: parentRegEmail.trim(),
                                                            studentId: studentData?.id,
                                                            parentName: payerType === 'parent' ? payerName : undefined,
                                                        }),
                                                    });
                                                    if (!resp.ok) {
                                                        const err = await resp.json().catch(() => ({ error: 'Failed' }));
                                                        setParentRegError(err.error || 'Failed to send invite');
                                                    } else {
                                                        setParentRegSent(true);
                                                    }
                                                } catch {
                                                    setParentRegError(t('common.error'));
                                                } finally {
                                                    setParentRegSubmitting(false);
                                                }
                                            }}
                                            className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
                                        >
                                            {parentRegSubmitting ? t('common.loading') : t('onboard.sendParentInvite')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-left text-sm text-green-800">
                                <Check className="w-4 h-4 inline mr-1" />
                                {t('onboard.parentInviteSent', { email: parentRegEmail })}
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
