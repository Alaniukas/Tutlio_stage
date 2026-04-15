import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function ResetPassword() {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [sessionChecked, setSessionChecked] = useState(false);
    const [noValidSession, setNoValidSession] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;

        const checkSession = async () => {
            await new Promise((r) => setTimeout(r, 600));
            if (cancelled) return;
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled) return;
            if (!user) {
                setNoValidSession(true);
            }
            setSessionChecked(true);
        };

        void checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setNoValidSession(false);
            }
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError(t('auth.passwordMismatch'));
            return;
        }

        if (password.length < 6) {
            setError(t('auth.passwordTooShort'));
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            setError(t('auth.passwordResetError') + error.message);
        } else {
            setSuccess(true);
            setTimeout(() => { navigate('/login'); }, 3000);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 selection:bg-indigo-200">
            <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 w-full max-w-md">
                <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-6">
                    <Lock className="w-8 h-8" />
                </div>

                <h1 className="text-2xl font-black text-center text-gray-900 mb-2">{t('auth.createNewPassword')}</h1>
                <p className="text-center text-gray-500 mb-8 max-w-sm mx-auto">{t('auth.createNewPasswordDesc')}</p>

                {sessionChecked && noValidSession ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <p>{t('auth.resetLinkInvalid')}</p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full h-12 rounded-xl font-semibold"
                            onClick={() => navigate('/login')}
                        >
                            {t('auth.goToLogin')}
                        </Button>
                    </div>
                ) : success ? (
                    <div className="text-center animate-in fade-in zoom-in duration-300">
                        <div className="bg-green-50 text-green-700 p-4 rounded-2xl flex flex-col items-center gap-3 border border-green-100">
                            <CheckCircle2 className="w-8 h-8 text-green-500" />
                            <p className="font-medium">{t('auth.passwordChanged')}</p>
                            <p className="text-sm opacity-80">{t('auth.redirectToLogin')}</p>
                        </div>
                    </div>
                ) : !sessionChecked ? (
                    <div className="flex flex-col items-center gap-3 py-8 text-gray-500 text-sm">
                        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        {t('auth.checkingLink')}
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="password">{t('auth.newPassword')}</Label>
                            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-xl border-gray-200" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">{t('auth.repeatPassword')}</Label>
                            <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="rounded-xl border-gray-200" />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}
                        <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold shadow-md">
                            {loading ? t('common.updating') : t('auth.saveNewPassword')}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
