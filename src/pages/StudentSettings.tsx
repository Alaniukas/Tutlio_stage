import { useEffect, useState } from 'react';
import StudentLayout from '@/components/StudentLayout';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { Eye, EyeOff, Trash2, AlertTriangle, Check, LogOut, Mail } from 'lucide-react';
import { formatLithuanianPhone, validateLithuanianPhone } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { buildPlatformPath } from '@/lib/platform';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import { authHeaders } from '@/lib/apiHelpers';

export default function StudentSettings() {
    const { t, locale } = useTranslation();
    const { user: ctxUser } = useUser();
    const [studentName, setStudentName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [age, setAge] = useState('');
    const [grade, setGrade] = useState('');
    const [studentId, setStudentId] = useState('');

    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);

    const [saving, setSaving] = useState(false);
    const [savingPass, setSavingPass] = useState(false);
    const [successProfile, setSuccessProfile] = useState(false);
    const [successPass, setSuccessPass] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';

    const [payerEmailDisp, setPayerEmailDisp] = useState('');
    const [payerNameDisp, setPayerNameDisp] = useState('');
    const [paymentPayer, setPaymentPayer] = useState<string | null>(null);
    const [registeredParents, setRegisteredParents] = useState<Array<{ full_name: string | null; email: string | null }>>(
        [],
    );
    const [draftPayerName, setDraftPayerName] = useState('');
    const [draftPayerEmail, setDraftPayerEmail] = useState('');
    const [inviteSending, setInviteSending] = useState(false);
    const [savingPayerInvite, setSavingPayerInvite] = useState(false);
    const [inviteBanner, setInviteBanner] = useState<'none' | 'ok' | 'err'>('none');
    /** Mokėtojo pasirinkimas nustatymuose („aš“ / „tėvai“), kol nepakviesta tėvų paskyra. */
    const [desiredPayer, setDesiredPayer] = useState<'self' | 'parent'>('self');
    const [savingPayerSelf, setSavingPayerSelf] = useState(false);

    useEffect(() => {
        if (!ctxUser) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctxUser?.id]);

    const fetchData = async () => {
        if (!ctxUser) return;
        const user = ctxUser;
        setEmail(user.email || '');

        const selectedStudentId = typeof window !== 'undefined'
            ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY)
            : null;
        let { data: studentRows, error: rpcError } = await supabase.rpc('get_student_profiles', {
            p_user_id: user.id,
            p_student_id: selectedStudentId || null,
        });
        if (rpcError) {
            console.error('[StudentSettings] get_student_profiles', rpcError);
            return;
        }
        let data = studentRows?.[0];
        if (!data && selectedStudentId) {
            const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_student_profiles', {
                p_user_id: user.id,
                p_student_id: null,
            });
            if (fallbackError) {
                console.error('[StudentSettings] get_student_profiles fallback', fallbackError);
                return;
            }
            data = fallbackRows?.[0];
            if (data && typeof window !== 'undefined') {
                localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, data.id);
            }
        }

        if (data) {
            setStudentId(data.id);
            setStudentName(data.full_name || '');
            setPhone(data.phone || '');
            setAge(data.age?.toString() || '');
            setGrade(data.grade || '');
            const pe = String((data as { payer_email?: string | null }).payer_email ?? '').trim();
            const pn = String((data as { payer_name?: string | null }).payer_name ?? '').trim();
            setPayerEmailDisp(pe);
            setPayerNameDisp(pn);
            setPaymentPayer((data.payment_payer as string | null) ?? null);
            setDraftPayerName(pn);
            setDraftPayerEmail(pe);
            setInviteBanner('none');
            setDesiredPayer(String((data.payment_payer as string | null) ?? '').toLowerCase() === 'parent' ? 'parent' : 'self');

            const { data: regs } = await supabase.rpc('get_registered_parents_for_linked_student', {
                p_student_id: data.id,
                p_linked_user_id: user.id,
            });
            setRegisteredParents(
                (regs as Array<{ full_name: string | null; email: string | null }> | null) ?? [],
            );
        }
    };

    const paymentIsParent = String(paymentPayer ?? '').toLowerCase() === 'parent';
    const payerEmailLooksValid = payerEmailDisp.includes('@');
    const hasRegisteredParentPortal = registeredParents.length > 0;
    /** Tėvų kvietimas vienu paspaudimu: DB mokėtojas – tėvai ir yra mokėtojo el. paštas + pasirinkta „tėvai“. */
    const canOneClickInvite =
        !hasRegisteredParentPortal &&
        desiredPayer === 'parent' &&
        payerEmailLooksValid &&
        paymentIsParent;
    /** Buvo „moku pats“, bet mokėtojo el. yra — prieš kvietimą užtenka įrašyti payment_payer = parent. */
    const canPromoteSelfToParentInvite =
        !hasRegisteredParentPortal &&
        desiredPayer === 'parent' &&
        payerEmailLooksValid &&
        !paymentIsParent;
    const needsParentContactForm =
        !hasRegisteredParentPortal && desiredPayer === 'parent' && !payerEmailLooksValid;

    const sendParentInvite = async () => {
        setInviteBanner('none');
        setInviteSending(true);
        try {
            const res = await fetch('/api/student-invite-parent', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({}),
            });
            const body = await res.json().catch(() => ({} as Record<string, unknown>));
            if (res.status === 409 && Array.isArray(body.parents)) {
                const normalized = (
                    body.parents as Array<{ full_name?: string | null; email?: string | null }>
                ).map((p) => ({ full_name: p.full_name ?? null, email: p.email ?? null }));
                setRegisteredParents(normalized);
                setInviteBanner('none');
                return;
            }
            if (!res.ok) {
                setInviteBanner('err');
                return;
            }
            setInviteBanner('ok');
        } catch {
            setInviteBanner('err');
        } finally {
            setInviteSending(false);
        }
    };

    const savePayerContactsAndInvite = async () => {
        if (!studentId || !ctxUser) return;
        const n = draftPayerName.trim();
        const e = draftPayerEmail.trim().toLowerCase();
        if (!n) {
            setError(t('onboard.parentNameReq'));
            return;
        }
        if (!e.includes('@')) {
            setError(t('onboard.parentEmailReq'));
            return;
        }
        setSavingPayerInvite(true);
        setError(null);
        setInviteBanner('none');
        const { error: uErr } = await supabase
            .from('students')
            .update({
                payer_name: n,
                payer_email: e,
                payment_payer: 'parent',
            })
            .eq('id', studentId);
        if (uErr) {
            console.warn('[StudentSettings] payer contacts update:', uErr);
            setError(t('studentSettings.profileSaveError'));
            setSavingPayerInvite(false);
            return;
        }
        setPayerNameDisp(n);
        setPayerEmailDisp(e);
        setPaymentPayer('parent');
        await sendParentInvite();
        setSavingPayerInvite(false);
    };

    /** DB nustatyta „moka tėvas“, naudotojas pasirinkęs vėl „moku pats“ (tėvai dar neįsiregistravę portaluose). */
    const persistPaymentPayerSelf = async () => {
        if (!studentId || !ctxUser) return;
        setSavingPayerSelf(true);
        setError(null);
        try {
            const { error: uErr } = await supabase.from('students').update({ payment_payer: 'self' }).eq('id', studentId);
            if (uErr) {
                setError(t('studentSettings.profileSaveError'));
                return;
            }
            setPaymentPayer('self');
            setDesiredPayer('self');
        } finally {
            setSavingPayerSelf(false);
        }
    };

    const promoteSelfToParentAndInvite = async () => {
        if (!studentId || !ctxUser) return;
        setInviteBanner('none');
        setInviteSending(true);
        setError(null);
        try {
            const { error: uErr } = await supabase.from('students').update({ payment_payer: 'parent' }).eq('id', studentId);
            if (uErr) {
                setError(t('studentSettings.profileSaveError'));
                return;
            }
            setPaymentPayer('parent');
            await sendParentInvite();
        } catch {
            setInviteBanner('err');
        } finally {
            setInviteSending(false);
        }
    };

    const saveProfile = async () => {
        setSaving(true);
        setError(null);
        if (phone && !validateLithuanianPhone(phone)) {
            setError(t('studentSettings.phoneFormatError'));
            setSaving(false);
            return;
        }
        const { error: e1 } = await supabase.from('students').update({ phone, age: age ? parseInt(age) : null, grade }).eq('id', studentId);
        if (e1) { setError(t('studentSettings.profileSaveError')); setSaving(false); return; }
        setSuccessProfile(true);
        setTimeout(() => setSuccessProfile(false), 3000);
        setSaving(false);
    };

    const changePassword = async () => {
        if (password !== passwordConfirm) { setError(t('studentSettings.passwordMismatch')); return; }
        if (password.length < 6) { setError(t('studentSettings.minChars')); return; }
        setSavingPass(true);
        setError(null);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { setError(error.message); setSavingPass(false); return; }
        setSuccessPass(true);
        setPassword(''); setPasswordConfirm('');
        setTimeout(() => setSuccessPass(false), 3000);
        setSavingPass(false);
    };

    const deleteAccount = async () => {
        await supabase.auth.signOut();
        window.location.href = `${window.location.origin}${buildPlatformPath('/login')}`;
    };

    const handleLogout = async () => {
        sessionStorage.setItem('tutlio_logout_intent', '1');
        void supabase.auth.signOut();
        window.location.href = `${window.location.origin}${buildPlatformPath('/login')}`;
    };

    return (
        <StudentLayout>
            <div className="px-4 pt-6 space-y-6 pb-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 mb-1">{t('studentSettings.title')}</h1>
                    <p className="text-gray-400 text-sm">{t('studentSettings.manageAccount')}</p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-600 font-medium">
                        {error}
                    </div>
                )}

                <div className="bg-white rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-gray-900">{t('studentSettings.personalInfo')}</h2>
                        {successProfile && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> {t('studentSettings.saved')}</span>}
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('common.name')}</label>
                            <p className="px-4 py-3 bg-gray-50 rounded-2xl text-sm text-gray-700 font-medium">{studentName}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('common.email')}</label>
                            <p className="px-4 py-3 bg-gray-50 rounded-2xl text-sm text-gray-700 font-medium">{email}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('common.phone')}</label>
                            <input type="tel" value={phone} onChange={(e) => setPhone(formatLithuanianPhone(e.target.value))} className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-transparent" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('studentSettings.age')}</label>
                                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min="5" max="99" className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('studentSettings.grade')}</label>
                                <Select value={grade} onValueChange={setGrade}>
                                    <SelectTrigger className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm border-transparent">
                                        <SelectValue placeholder={t('paymentModel.selectPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <SelectItem key={i} value={`${i + 1} klasė`}>
                                                {locale === 'en' ? `Grade ${i + 1}` : `${i + 1} klasė`}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="Studentas">{locale === 'en' ? 'University' : 'Studentas'}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <button onClick={saveProfile} disabled={saving} className="mt-4 w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors">
                        {saving ? t('studentSettings.saving') : t('common.save')}
                    </button>
                </div>

                {studentId ? (
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-violet-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Mail className="w-5 h-5 text-violet-600" />
                            <h2 className="font-bold text-gray-900">{t('studentSettings.parentInviteSectionTitle')}</h2>
                        </div>
                        {hasRegisteredParentPortal ? (
                            <>
                                <p className="text-sm font-semibold text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-2">
                                    {t('studentSettings.parentAccountLinkedTitle')}
                                </p>
                                <p className="text-xs text-gray-500 mb-3">{t('studentSettings.parentAccountLinkedDesc')}</p>
                                <ul className="space-y-2 mb-3">
                                    {registeredParents.map((p, i) => (
                                        <li key={i} className="text-sm text-gray-800 bg-gray-50 rounded-xl px-3 py-2">
                                            <span className="font-semibold">{p.full_name ?? '—'}</span>
                                            {p.email ? (
                                                <>
                                                    {' '}
                                                    <span className="text-gray-400">·</span>{' '}
                                                    <a href={`mailto:${p.email}`} className="text-violet-600 font-medium underline">
                                                        {p.email}
                                                    </a>
                                                </>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-gray-500">{t('studentSettings.parentInviteBlockedLinked')}</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-600 mb-3">{t('studentSettings.payerChoiceIntro')}</p>
                                <div className="flex rounded-2xl border border-gray-200 p-1 bg-gray-50 gap-1 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setDesiredPayer('self')}
                                        className={`flex-1 py-2.5 px-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors ${
                                            desiredPayer === 'self'
                                                ? 'bg-white text-violet-700 shadow-sm border border-violet-100'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        {t('studentSettings.payerOptionSelf')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDesiredPayer('parent')}
                                        className={`flex-1 py-2.5 px-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors ${
                                            desiredPayer === 'parent'
                                                ? 'bg-white text-violet-700 shadow-sm border border-violet-100'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        {t('studentSettings.payerOptionParent')}
                                    </button>
                                </div>

                                {desiredPayer === 'self' ? (
                                    <div className="space-y-3">
                                        <p className="text-sm text-gray-600">{t('studentSettings.payerChoiceSelfExplanation')}</p>
                                        {paymentIsParent ? (
                                            <button
                                                type="button"
                                                disabled={savingPayerSelf}
                                                onClick={() => void persistPaymentPayerSelf()}
                                                className="w-full py-3 rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 font-bold text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
                                            >
                                                {savingPayerSelf ? t('studentSettings.saving') : t('studentSettings.savePayerIsSelfCta')}
                                            </button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-sm text-gray-500 mb-4">{t('studentSettings.parentInviteSectionDesc')}</p>
                                        {inviteBanner === 'ok' ? (
                                            <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2 mb-3">
                                                {t('studentSettings.inviteParentSuccess')}
                                            </p>
                                        ) : null}
                                        {inviteBanner === 'err' ? (
                                            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">
                                                {t('studentSettings.inviteParentError')}
                                            </p>
                                        ) : null}
                                        {needsParentContactForm ? (
                                            <div className="space-y-3">
                                                <p className="text-sm text-gray-600">{t('studentSettings.parentDraftExplain')}</p>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                                                        {t('studentSettings.payerDraftNameLabel')}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={draftPayerName}
                                                        onChange={(e) => setDraftPayerName(e.target.value)}
                                                        className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-transparent"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                                                        {t('studentSettings.payerDraftEmailLabel')}
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={draftPayerEmail}
                                                        onChange={(e) => setDraftPayerEmail(e.target.value)}
                                                        className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-transparent"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={savingPayerInvite || inviteSending}
                                                    onClick={() => void savePayerContactsAndInvite()}
                                                    className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {savingPayerInvite || inviteSending
                                                        ? t('studentSettings.inviteParentSending')
                                                        : t('studentSettings.savePayerContactsCta')}
                                                </button>
                                            </div>
                                        ) : canOneClickInvite ? (
                                            <div className="space-y-3">
                                                {payerNameDisp ? (
                                                    <p className="text-xs text-gray-500 mb-1">
                                                        <span className="font-semibold text-gray-600">{t('studentSettings.payerName')}: </span>
                                                        {payerNameDisp}
                                                    </p>
                                                ) : null}
                                                <p className="text-xs text-gray-500 mb-4">
                                                    <span className="font-semibold text-gray-600">{t('studentSettings.payerEmail')}: </span>
                                                    {payerEmailDisp}
                                                </p>
                                                <button
                                                    type="button"
                                                    disabled={inviteSending}
                                                    onClick={() => void sendParentInvite()}
                                                    className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {inviteSending ? t('studentSettings.inviteParentSending') : t('studentSettings.inviteParentCta')}
                                                </button>
                                            </div>
                                        ) : canPromoteSelfToParentInvite ? (
                                            <div className="space-y-3">
                                                {payerNameDisp ? (
                                                    <p className="text-xs text-gray-500 mb-1">
                                                        <span className="font-semibold text-gray-600">{t('studentSettings.payerName')}: </span>
                                                        {payerNameDisp}
                                                    </p>
                                                ) : null}
                                                <p className="text-xs text-gray-500 mb-1">
                                                    <span className="font-semibold text-gray-600">{t('studentSettings.payerEmail')}: </span>
                                                    {payerEmailDisp}
                                                </p>
                                                <button
                                                    type="button"
                                                    disabled={inviteSending}
                                                    onClick={() => void promoteSelfToParentAndInvite()}
                                                    className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {inviteSending ? t('studentSettings.inviteParentSending') : t('studentSettings.promoteParentAndInvite')}
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500">{t('studentSettings.inviteParentNoEmail')}</p>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                ) : null}

                <div className="bg-white rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-gray-900">{t('studentSettings.passwordTitle')}</h2>
                        {successPass && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> {t('studentSettings.changed')}</span>}
                    </div>
                    <div className="space-y-3">
                        <div className="relative">
                            <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('studentSettings.newPassword')} className="w-full px-4 py-3 pr-12 bg-gray-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-transparent" />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400">
                                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        <input type={showPass ? 'text' : 'password'} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder={t('studentSettings.repeatPassword')} className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-transparent" />
                    </div>
                    <button onClick={changePassword} disabled={savingPass || !password} className="mt-4 w-full py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
                        {savingPass ? t('studentSettings.changing') : t('studentSettings.changePassword')}
                    </button>
                </div>

                <div className="bg-white rounded-3xl p-5 shadow-sm border border-red-50">
                    <h2 className="font-bold text-gray-900 mb-1">{t('studentSettings.dangerZone')}</h2>
                    <p className="text-xs text-gray-400 mb-4">{t('studentSettings.actionsIrreversible')}</p>
                    {!deleteConfirm ? (
                        <button onClick={() => setDeleteConfirm(true)} className="w-full py-3 rounded-2xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                            <Trash2 className="w-4 h-4" /> {t('studentSettings.deleteAccount')}
                        </button>
                    ) : (
                        <div className="bg-red-50 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                <p className="text-sm text-red-700 font-medium">{t('studentSettings.confirmDeleteMsg')}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white">
                                    {t('common.cancel')}
                                </button>
                                <button onClick={deleteAccount} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold">
                                    {t('common.delete')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <PwaInstallGuide />

                <button onClick={handleLogout} className="w-full py-4 mt-6 rounded-3xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                    <LogOut className="w-5 h-5" /> {t('common.logout')}
                </button>

                <div className="pb-4" />
            </div>
        </StudentLayout>
    );
}
