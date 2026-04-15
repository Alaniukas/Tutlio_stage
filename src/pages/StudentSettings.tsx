import { useEffect, useState } from 'react';
import StudentLayout from '@/components/StudentLayout';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Trash2, AlertTriangle, Check, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatLithuanianPhone, validateLithuanianPhone } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { buildPlatformPath } from '@/lib/platform';

export default function StudentSettings() {
    const { t, locale } = useTranslation();
    const navigate = useNavigate();
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

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
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

                <button onClick={handleLogout} className="w-full py-4 mt-6 rounded-3xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                    <LogOut className="w-5 h-5" /> {t('common.logout')}
                </button>

                <div className="pb-4" />
            </div>
        </StudentLayout>
    );
}
