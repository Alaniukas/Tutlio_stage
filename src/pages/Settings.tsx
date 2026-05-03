import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Mail, Phone, Save, Lock, Building2, Eye, EyeOff, CreditCard, Calendar, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { formatLithuanianPhone, validateLithuanianPhone } from '@/lib/utils';
import { hasActiveSubscription } from '@/lib/subscription';
import { useTranslation } from '@/lib/i18n';
import PwaInstallGuide from '@/components/PwaInstallGuide';

interface TutorProfile {
  full_name: string;
  email: string;
  phone: string;
  organization_id?: string | null;
  stripe_customer_id?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_current_period_end?: string | null;
  subscription_price_amount?: number | null;
  subscription_price_currency?: string | null;
  subscription_price_interval?: string | null;
}

export default function SettingsPage() {
  const { t, dateFnsLocale } = useTranslation();
  const { user: ctxUser } = useUser();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [profile, setProfile] = useState<TutorProfile>({
    full_name: '',
    email: '',
    phone: '',
    organization_id: null,
    stripe_customer_id: null,
    subscription_status: null,
    subscription_plan: null,
    subscription_current_period_end: null,
    subscription_price_amount: null,
    subscription_price_currency: null,
    subscription_price_interval: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [refreshingSubscription, setRefreshingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!ctxUser) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxUser?.id]);

  useEffect(() => {
    if (searchParams.get('from') === 'stripe_portal') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchData = async (skipRefresh = false) => {
    if (!ctxUser) return;
    setLoading(true);
    setSubscriptionError(null);
    const user = ctxUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: tutorData } = await supabase
      .from('profiles')
      .select('full_name, phone, organization_id, organizations(name), stripe_customer_id, subscription_status, subscription_plan, subscription_current_period_end')
      .eq('id', user.id)
      .single();

    const base = tutorData;
    if (base?.organization_id) {
      setOrgName((base.organizations as any)?.name || null);
    }
    setProfile({
      full_name: base?.full_name || '',
      email: user.email || '',
      phone: base?.phone || '',
      organization_id: base?.organization_id || null,
      stripe_customer_id: base?.stripe_customer_id || null,
      subscription_status: base?.subscription_status || null,
      subscription_plan: base?.subscription_plan || null,
      subscription_current_period_end: base?.subscription_current_period_end || null,
      subscription_price_amount: null,
      subscription_price_currency: null,
      subscription_price_interval: null,
    });
    setLoading(false);

    if (base?.organization_id || skipRefresh) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setRefreshingSubscription(true);
      const response = await fetch('/api/refresh-my-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        const refreshData = await response.json().catch(() => null);
        if (refreshData?.subscription_status != null) {
          setProfile(prev => ({
            ...prev,
            subscription_status: refreshData.subscription_status ?? prev.subscription_status,
            subscription_plan: refreshData.subscription_plan ?? prev.subscription_plan,
            subscription_current_period_end: refreshData.subscription_current_period_end ?? prev.subscription_current_period_end,
            subscription_price_amount: refreshData.subscription_price_amount ?? prev.subscription_price_amount,
            subscription_price_currency: refreshData.subscription_price_currency ?? prev.subscription_price_currency,
            subscription_price_interval: refreshData.subscription_price_interval ?? prev.subscription_price_interval,
          }));
        }
      }
    } catch (_) {}
    finally {
      setRefreshingSubscription(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!ctxUser) return;
    setSaving(true);
    const user = ctxUser;

    if (profile.phone && !validateLithuanianPhone(profile.phone)) {
      setProfileError(t('settings.phoneFormat'));
      setSaving(false);
      return;
    }
    setProfileError('');

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        phone: profile.phone,
      })
      .eq('id', user.id);

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleRefreshSubscription = async () => {
    setRefreshingSubscription(true);
    setSubscriptionError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubscriptionError(t('settings.sessionExpired'));
        return;
      }
      const response = await fetch('/api/refresh-my-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        setSubscriptionError(data.error || t('settings.refreshFailed'));
        return;
      }
      await fetchData();
    } finally {
      setRefreshingSubscription(false);
    }
  };

  const handleManageSubscription = async () => {
    setManagingSubscription(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert(t('settings.sessionExpired'));
        return;
      }

      const response = await fetch('/api/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('settings.portalFailed'));
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setManagingSubscription(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('settings.fillAllFields'));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(t('settings.passwordMin6'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordsDontMatch'));
      return;
    }

    setChangingPassword(true);

    if (!ctxUser?.email) {
      setPasswordError(t('settings.userDataFailed'));
      setChangingPassword(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: ctxUser.email,
      password: currentPassword,
    });

    if (signInError) {
      setPasswordError(t('settings.currentPasswordWrong'));
      setChangingPassword(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setPasswordError(t('settings.passwordChangeFailed') + updateError.message);
    } else {
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordSuccess(false);
        setShowPasswordSection(false);
      }, 3000);
    }

    setChangingPassword(false);
  };

  const formatPrice = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (typeof amount !== 'number') return null;
    try {
      return new Intl.NumberFormat('lt-LT', {
        style: 'currency',
        currency: (currency || 'EUR').toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `€${amount.toFixed(2)}`;
    }
  };

  const getPlanLabel = () => {
    const price = formatPrice(profile.subscription_price_amount, profile.subscription_price_currency);
    const interval =
      profile.subscription_price_interval ||
      (profile.subscription_plan === 'yearly' ? 'year' : 'month');
    const suffix = interval === 'year' ? t('settings.perYear') : t('subscribe.perMonth');
    const title =
      profile.subscription_plan === 'yearly'
        ? t('settings.yearlyPlan')
        : profile.subscription_plan === 'subscription_only'
          ? t('subscribe.subscriptionOnlyTitle')
          : t('settings.monthlyPlan');
    if (price) return `${title} (${price}${suffix})`;
    if (profile.subscription_plan === 'yearly') return `${t('settings.yearlyPlan')} (€14.99${t('subscribe.perMonth')})`;
    if (profile.subscription_plan === 'subscription_only') return `${t('subscribe.subscriptionOnlyTitle')} (€35${t('subscribe.perMonth')})`;
    return `${t('settings.monthlyPlan')} (€19.99${t('subscribe.perMonth')})`;
  };

  const getTrialChargeText = () => {
    const price = formatPrice(profile.subscription_price_amount, profile.subscription_price_currency);
    if (price) return price;
    return profile.subscription_plan === 'yearly' ? '€179.88' : '€19.99';
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t('settings.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 font-medium animate-fade-in">
                {t('settings.savedText')}
              </span>
            )}
            <Button onClick={handleSaveProfile} disabled={saving || loading} className="rounded-xl gap-2">
              <Save className="w-4 h-4" />
              {saving ? t('studentSettings.saving') : t('common.save')}
            </Button>
          </div>
        </div>

        {orgName && (
          <div className="flex items-center gap-3 bg-slate-800 rounded-2xl px-5 py-4 text-white shadow-sm">
            <Building2 className="w-5 h-5 text-slate-300 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium">{t('settings.company')}</p>
              <p className="font-semibold text-sm">{orgName}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('settings.profileInfo')}</h2>
              <p className="text-xs text-gray-500">{t('settings.personalData')}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex gap-4 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-lg flex-1" />
              <div className="h-10 bg-gray-100 rounded-lg flex-1" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <User className="w-4 h-4 text-gray-400" /> {t('common.name')}
                </Label>
                <Input
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder={t('settings.namePlaceholder')}
                  className="rounded-xl border-gray-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="w-4 h-4 text-gray-400" /> {t('common.email')}
                </Label>
                <Input
                  value={profile.email}
                  disabled
                  className="rounded-xl border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Phone className="w-4 h-4 text-gray-400" /> {t('common.phone')}
                </Label>
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: formatLithuanianPhone(e.target.value) })}
                  placeholder="+370 600 00000"
                  className="rounded-xl border-gray-200"
                />
                {profileError && <p className="text-sm text-red-500">{profileError}</p>}
              </div>
            </div>
          )}
        </div>

        {!profile.organization_id && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          {profile.stripe_customer_id || profile.subscription_status ? (
            <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{t('settings.subscription')}</h2>
                  <p className="text-xs text-gray-500">{t('settings.manageSubscription')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={managingSubscription}
                  className="rounded-xl"
                >
                  {managingSubscription ? t('common.loading') : t('settings.manageSubBtn')}
                </Button>
                {hasActiveSubscription(profile.subscription_status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageSubscription}
                    disabled={managingSubscription}
                    className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                  >
                    {t('settings.cancelSubBtn')}
                  </Button>
                )}
              </div>
            </div>

            {profile.subscription_status === 'trialing' && profile.subscription_current_period_end && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 mb-1">
                    {t('settings.trialActive')}
                  </p>
                  <p className="text-sm text-amber-700">
                    {t('settings.trialRemaining', {
                      days: Math.max(0, Math.ceil((new Date(profile.subscription_current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
                      date: new Date(profile.subscription_current_period_end).toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' }),
                      amount: getTrialChargeText(),
                    })}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    {t('settings.trialCancelHint')}
                  </p>
                </div>
              </div>
            )}

            {profile.subscription_status === 'canceled' && (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900 mb-1">{t('settings.subCancelled')}</p>
                  <p className="text-sm text-slate-600">
                    {profile.subscription_current_period_end ? (
                      t('settings.subValidUntil', { date: new Date(profile.subscription_current_period_end).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) })
                    ) : (
                      t('settings.canResubscribe')
                    )}
                  </p>
                </div>
                <Link to="/registration/subscription">
                  <Button size="sm" className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                    {t('settings.resubscribe')}
                  </Button>
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium">{t('settings.statusLabel')}</p>
                <div className="flex items-center gap-2">
                  {hasActiveSubscription(profile.subscription_status) ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-700">
                        {profile.subscription_status === 'trialing' ? t('settings.trial7d') : t('settings.active')}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700 capitalize">
                        {profile.subscription_status || t('settings.inactive')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium">{t('settings.planLabel')}</p>
                <p className="text-sm font-medium text-gray-900">
                  {getPlanLabel()}
                </p>
              </div>

              {profile.subscription_current_period_end && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium">
                    {profile.subscription_status === 'canceled'
                      ? t('settings.validUntil')
                      : profile.subscription_status === 'trialing'
                      ? t('settings.trialEnds')
                      : t('settings.nextPayment')}
                  </p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(profile.subscription_current_period_end).toLocaleDateString('lt-LT', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
              {t('settings.manageSubHint')}
            </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{t('settings.subscription')}</h2>
                  <p className="text-xs text-gray-500">{t('settings.noSubDesc')}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {t('settings.noSubText')}
              </p>
              {subscriptionError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{subscriptionError}</p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  size="sm"
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleRefreshSubscription}
                  disabled={refreshingSubscription || loading}
                >
                  {refreshingSubscription ? t('settings.refreshing') : t('settings.refreshSub')}
                </Button>
                <Link to="/pricing">
                  <Button size="sm" variant="outline" className="rounded-xl">
                    {t('settings.viewPlans')}
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('settings.passwordTitle')}</h2>
                <p className="text-xs text-gray-500">{t('settings.changePasswordSubtitle')}</p>
              </div>
            </div>
            {!showPasswordSection && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordSection(true)}
                className="rounded-xl"
              >
                {t('settings.changePasswordBtn')}
              </Button>
            )}
          </div>

          {showPasswordSection && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('settings.currentPassword')}</Label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('settings.newPasswordLabel')}</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('settings.repeatNewPassword')}</Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  {t('settings.passwordChanged')}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordSection(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordError('');
                  }}
                  className="rounded-xl"
                  disabled={changingPassword}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700"
                >
                  {changingPassword ? t('studentSettings.changing') : t('settings.changePasswordBtn')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <PwaInstallGuide />
      </div>
    </Layout>
  );
}
