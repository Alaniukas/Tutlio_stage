import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { hasActiveSubscription, tutorHasPlatformSubscriptionAccess } from '@/lib/subscription';
import {
  Calendar,
  CreditCard,
  Bell,
  Upload,
  MessageSquare,
  Users,
  TrendingUp,
  CheckCircle2,
  ArrowLeft,
  Tag,
  ShieldCheck
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
const DEPLOY_MARKER = 'egg-2026-04-02-a';

export default function TutorSubscribe() {
  const { t } = useTranslation();
  const location = useLocation();
  const isRegistrationSubscription = location.pathname === '/registration/subscription';
  const [searchParams] = useSearchParams();
  const fromRegister = searchParams.get('from') === 'register';
  const canceled = searchParams.get('canceled') === '1';
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | 'subscription_only'>('monthly');
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialUsed, setTrialUsed] = useState<boolean | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSecret, setManualSecret] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualErr, setManualErr] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isRegistrationSubscription) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setManualErr(null);
        setManualOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRegistrationSubscription]);

  const submitManualBypass = async () => {
    setManualLoading(true);
    setManualErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setManualErr(t('subscribe.loginFirst'));
        return;
      }
      const res = await fetch('/api/apply-manual-subscription-exempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ secret: manualSecret.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : t('subscribe.confirmFailed'));
      setManualOpen(false);
      setManualSecret('');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setManualErr(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setManualLoading(false);
    }
  };

  useEffect(() => {
    const loadProfile = async (userId: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_status, organization_id, manual_subscription_exempt')
        .eq('id', userId)
        .maybeSingle();
      return profile;
    };

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isRegistrationSubscription) {
        setTrialUsed(false);
        return;
      }
      let profile = await loadProfile(user.id);
      if (!profile) {
        await new Promise((r) => setTimeout(r, 400));
        profile = await loadProfile(user.id);
      }
      setTrialUsed(false);
      let hasAccess = tutorHasPlatformSubscriptionAccess(profile);
      if (!hasAccess && profile) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          try {
            const res = await fetch('/api/refresh-my-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            });
            const data = res.ok ? await res.json().catch(() => null) : null;
            hasAccess =
              hasActiveSubscription(data?.subscription_status) ||
              ['canceled', 'past_due', 'unpaid'].includes(data?.subscription_status || '');
          } catch (_) {}
        }
      }
      if (hasAccess) navigate('/dashboard', { replace: true });
    };
    check();
  }, [isRegistrationSubscription, navigate]);

  useEffect(() => {
    const sid = searchParams.get('session_id');
    const success = searchParams.get('subscription_success');
    if (!isRegistrationSubscription || !sid || success !== '1') return;
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        await fetch('/api/refresh-my-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        });
      } finally {
        navigate('/dashboard', { replace: true });
      }
    };
    run();
  }, [isRegistrationSubscription, searchParams, navigate]);

  const features = [
    { icon: Calendar, text: t('subscribe.feat_calendar') },
    { icon: CreditCard, text: t('subscribe.feat_payments') },
    { icon: Bell, text: t('subscribe.feat_reminders') },
    { icon: Upload, text: t('subscribe.feat_files') },
    { icon: MessageSquare, text: t('subscribe.feat_comments') },
    { icon: Users, text: t('subscribe.feat_waitlist') },
    { icon: TrendingUp, text: t('subscribe.feat_finance') },
  ];

  const handleSubscribe = async (useTrial = false) => {
    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isRegistrationSubscription) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const plan = useTrial ? 'monthly' : selectedPlan;
      const effectiveCoupon = useTrial ? 'TRIAL' : (couponCode.trim() || undefined);
      const response = await fetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan,
          couponCode: effectiveCoupon,
          successRedirect: isRegistrationSubscription ? 'dashboard' : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('subscribe.failedToCreate'));
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 relative overflow-hidden">
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="w-[95vw] max-w-md sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('subscribe.manualAccess')}</DialogTitle>
            <DialogDescription>{t('subscribe.manualAccessDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input
              type="password"
              autoComplete="off"
              value={manualSecret}
              onChange={(e) => setManualSecret(e.target.value)}
              placeholder={t('subscribe.keyPlaceholder')}
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitManualBypass();
              }}
            />
            {manualErr && <p className="text-sm text-red-600">{manualErr}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setManualOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void submitManualBypass()}
              disabled={manualLoading || !manualSecret.trim()}
            >
              {manualLoading ? t('subscribe.checking') : t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('subscribe.goBack')}
          </button>

          {canceled && (
            <p className="mb-4 text-amber-200 text-sm bg-amber-500/20 border border-amber-500/40 rounded-xl px-4 py-2 inline-block">
              {t('subscribe.paymentCancelledMsg')}
            </p>
          )}

          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
              {t('subscribe.forTutors')}
            </h1>
            <p className="text-xl text-indigo-200 max-w-2xl mx-auto">
              {t('subscribe.allYouNeed')}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-5xl mx-auto">
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`relative bg-white rounded-3xl p-8 text-left transition-all transform hover:scale-105 ${
              selectedPlan === 'monthly'
                ? 'ring-4 ring-indigo-500 shadow-2xl'
                : 'shadow-xl hover:shadow-2xl'
            }`}
          >
            {selectedPlan === 'monthly' && (
              <div className="absolute -top-3 right-6 bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full">
                {t('subscribe.selected')}
              </div>
            )}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('subscribe.monthlyTitle')}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-indigo-600">€19.99</span>
                <span className="text-gray-500">{t('subscribe.perMonth')}</span>
              </div>
            </div>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.allFeatures')}
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.unlimitedStudents')}
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.cancelAnytime')}
              </li>
            </ul>
          </button>

          <button
            onClick={() => setSelectedPlan('yearly')}
            className={`relative bg-white rounded-3xl p-8 text-left transition-all transform hover:scale-105 ${
              selectedPlan === 'yearly'
                ? 'ring-4 ring-indigo-500 shadow-2xl'
                : 'shadow-xl hover:shadow-2xl'
            }`}
          >
            {selectedPlan === 'yearly' && (
              <div className="absolute -top-3 right-6 bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full">
                {t('subscribe.selected')}
              </div>
            )}
            <div className="absolute -top-3 left-6 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
              SUTAUPYK 25%
            </div>
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('subscribe.yearlyTitle')}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-indigo-600">€14.99</span>
                <span className="text-gray-500">{t('subscribe.perMonth')}</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">{t('subscribe.paidAnnually')}</p>
            </div>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.allFeatures')}
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.unlimitedStudents')}
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.save60')}
              </li>
            </ul>
          </button>

          <button
            onClick={() => setSelectedPlan('subscription_only')}
            className={`relative bg-white rounded-3xl p-8 text-left transition-all transform hover:scale-105 ${
              selectedPlan === 'subscription_only'
                ? 'ring-4 ring-amber-500 shadow-2xl'
                : 'shadow-xl hover:shadow-2xl'
            }`}
          >
            {selectedPlan === 'subscription_only' && (
              <div className="absolute -top-3 right-6 bg-amber-600 text-white text-xs font-bold px-4 py-1.5 rounded-full">
                {t('subscribe.selected')}
              </div>
            )}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('subscribe.subscriptionOnlyTitle')}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-amber-600">€35</span>
                <span className="text-gray-500">{t('subscribe.perMonth')}</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">{t('subscribe.subscriptionOnlyDesc')}</p>
            </div>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.allFeatures')}
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.manualPayments')}
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                {t('subscribe.noCommission')}
              </li>
            </ul>
          </button>
        </div>

        <div className="max-w-md mx-auto mb-8">
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6">
            <Label htmlFor="coupon" className="text-white font-medium mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              {t('subscribe.haveCoupon')}
            </Label>
            <div className="flex gap-3 mt-3">
              <Input
                id="coupon"
                type="text"
                placeholder="pvz. TRIAL7D"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="bg-white/90 border-white/40 text-gray-900 placeholder:text-gray-500 font-mono tracking-wider"
              />
            </div>
            {couponCode && (
              <p className="text-xs text-indigo-200 mt-2">
                {t('subscribe.couponApplied')}
              </p>
            )}
          </div>
        </div>

        <div className="max-w-md mx-auto mb-12">
          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-3 text-red-200 text-sm">
              {error}
            </div>
          )}
          <Button
            onClick={() => handleSubscribe(false)}
            disabled={loading}
            className="w-full py-6 text-lg font-semibold bg-white text-indigo-600 hover:bg-indigo-50 rounded-2xl shadow-xl"
          >
            {loading ? t('subscribe.preparing') : (() => {
              const code = couponCode.trim().toUpperCase();
              const isTrialCode = ['TRIAL', 'TRIAL7D', 'BANDYMAS'].includes(code);
              if (selectedPlan === 'monthly' && isTrialCode) return t('subscribe.tryFreeBtn');
              if (selectedPlan === 'yearly') return t('subscribe.payBtn');
              return code ? t('subscribe.continueWithCode') : t('subscribe.continueBtn');
            })()}
          </Button>

          <Button
            onClick={() => handleSubscribe(true)}
            disabled={loading || trialUsed === true}
            className="w-full mt-3 py-5 text-base font-medium rounded-2xl border-2 border-white/60 bg-indigo-900/50 text-white hover:bg-indigo-800/60 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {trialUsed === true
              ? t('subscribe.trialUsed')
              : t('subscribe.tryFree7Days')}
          </Button>

          <div className="mt-6 p-5 bg-white/10 backdrop-blur border border-white/20 rounded-2xl text-left">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">{t('subscribe.cancelInfo')}</p>
                <p className="text-indigo-200 text-sm">
                  {['TRIAL7D', 'TRIAL', 'BANDYMAS'].includes(couponCode.toUpperCase())
                    ? t('subscribe.trialPaymentInfo', { price: selectedPlan === 'yearly' ? '€179.88/year' : '€19.99/mo' })
                    : t('subscribe.safePaymentInfo')
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">
            {t('subscribe.whatYouGet')}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-4 bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-6 h-6 text-indigo-300" />
                </div>
                <p className="text-white font-medium pt-2">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-16 text-center">
          <p className="text-indigo-300/80 text-xs mb-3">
            Deploy marker: {DEPLOY_MARKER}
          </p>
          <p className="text-indigo-200 text-sm">
            {t('subscribe.questionsContact')}{' '}
            <a href="mailto:info@tutlio.lt" className="text-white underline hover:text-indigo-200">
              {t('subscribe.contactUs')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
