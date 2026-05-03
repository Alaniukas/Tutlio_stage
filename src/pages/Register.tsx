import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatLithuanianPhone, validateLithuanianPhone } from '@/lib/utils';
import { Eye, EyeOff, Building2, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Register() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const orgToken = searchParams.get('org_token');
  const normalizedOrgToken = orgToken?.trim().toUpperCase() || null;
  const subscriptionSuccess = searchParams.get('subscription_success');
  const checkoutSessionId = searchParams.get('session_id');
  const requestedPlan = searchParams.get('plan');

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgTokenValid, setOrgTokenValid] = useState<boolean | null>(null);
  const [orgInviteId, setOrgInviteId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);

  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (!normalizedOrgToken) return;
    const validateToken = async () => {
      const response = await fetch('/api/validate-tutor-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: normalizedOrgToken }),
      });
      const data = response.ok ? await response.json().catch(() => null) : null;

      if (!data?.valid) {
        setOrgTokenValid(false);
      } else {
        setOrgTokenValid(true);
        setOrgInviteId(data.inviteId || null);
        setOrgId(data.organizationId || null);
        setOrgName(data.orgName || null);
      }
    };
    validateToken();
  }, [normalizedOrgToken]);

  useEffect(() => {
    if (subscriptionSuccess === 'true' && checkoutSessionId) {
      setHasSubscription(true);
      sessionStorage.setItem('stripe_checkout_session_id', checkoutSessionId);
    }
  }, [subscriptionSuccess, checkoutSessionId]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== passwordConfirm) {
      setError(t('auth.passwordMismatch'));
      setLoading(false);
      return;
    }

    if (normalizedOrgToken && !orgTokenValid) {
      setError(t('register.invalidInviteError'));
      setLoading(false);
      return;
    }

    if (!validateLithuanianPhone(phone)) {
      setError(t('register.phoneError'));
      setLoading(false);
      return;
    }

    if (!agreePrivacy || !agreeTerms) {
      setError(t('register.mustAgree'));
      setLoading(false);
      return;
    }

    const acceptedAt = new Date().toISOString();

    const stripeCheckoutSessionId = sessionStorage.getItem('stripe_checkout_session_id');

    const appOrigin = import.meta.env.VITE_APP_URL || window.location.origin;
    let authData: any = null;

    if (normalizedOrgToken) {
      const inviteRegisterRes = await fetch('/api/register-tutor-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone,
          orgToken: normalizedOrgToken,
          acceptedAt,
        }),
      });
      const inviteRegisterBody = await inviteRegisterRes.json().catch(() => ({}));
      if (!inviteRegisterRes.ok) {
        setError(inviteRegisterBody?.error || t('auth.registerError'));
        setLoading(false);
        return;
      }

      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      if (signInResult.error || !signInResult.data.user) {
        setError(signInResult.error?.message || t('auth.loginError'));
        setLoading(false);
        return;
      }
      authData = signInResult.data;
    } else {
      const emailRedirectTo = `${appOrigin}/registration/subscription`;
      const signUpResult = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: fullName,
            phone,
            accepted_privacy_policy_at: acceptedAt,
            accepted_terms_at: acceptedAt,
            ...(stripeCheckoutSessionId ? { stripe_checkout_session_id: stripeCheckoutSessionId } : {}),
          },
        },
      });

      if (signUpResult.error) {
        setError(signUpResult.error.message);
        setLoading(false);
        return;
      }
      authData = signUpResult.data;
    }

    if (authData.session && authData.user) {
      const user = authData.user;
      const meta = user.user_metadata || {};

      let profileData: any = {
        id: user.id,
        full_name: meta.full_name,
        phone: meta.phone || '',
        email: user.email,
        accepted_privacy_policy_at: meta.accepted_privacy_policy_at || acceptedAt,
        accepted_terms_at: meta.accepted_terms_at || acceptedAt,
      };

      if (meta.stripe_checkout_session_id) {
        try {
          const response = await fetch(`${import.meta.env.VITE_APP_URL || window.location.origin}/api/get-subscription-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: meta.stripe_checkout_session_id }),
          });

          if (response.ok) {
            const subData = await response.json();
            profileData.stripe_customer_id = subData.customerId;
            profileData.stripe_subscription_id = subData.subscriptionId;
            profileData.subscription_status = subData.status;
            profileData.subscription_plan = subData.plan;
            profileData.subscription_current_period_end = subData.currentPeriodEnd;
          }
        } catch (err) {
          console.error('[Register] Error fetching subscription info:', err);
        }

        sessionStorage.removeItem('stripe_checkout_session_id');
      }

      if (meta.org_token && authData.session?.access_token) {
        const metaOrgToken = String(meta.org_token).trim().toUpperCase();
        const claimRes = await fetch('/api/claim-tutor-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authData.session.access_token}`,
          },
          body: JSON.stringify({ token: metaOrgToken }),
        });
        const claimData = claimRes.ok ? await claimRes.json().catch(() => null) : null;
        if (claimData?.organizationId) {
          profileData = { ...profileData, organization_id: claimData.organizationId };
        }
      }

      const { error: upsertError } = await supabase.from('profiles').upsert(profileData);
      if (upsertError) {
        console.error('[Register] Profile upsert error:', upsertError);
      }

      const hasAccess = orgToken || profileData.subscription_status;
      const subPath = requestedPlan
        ? `/registration/subscription?plan=${encodeURIComponent(requestedPlan)}`
        : '/registration/subscription';
      navigate(hasAccess ? '/dashboard' : subPath);
      return;
    }

    setIsSuccess(true);
    setLoading(false);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start sm:justify-center py-12 px-4">
        <Card className="w-full max-w-md text-center py-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">📧</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900 mb-2">{t('register.success')}</CardTitle>
          <CardDescription className="text-gray-500 mb-6 px-6">
            {t('register.successDesc', { email })}
          </CardDescription>
          <Button onClick={() => navigate('/login')} className="w-[200px]" variant="outline">
            {t('auth.backToLogin')}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start sm:justify-center py-8 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('register.title')}</CardTitle>
          <CardDescription>
            {orgName ? t('register.orgInvite', { orgName }) : t('register.createAccount')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {normalizedOrgToken && orgTokenValid === true && orgName && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4">
              <Building2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-indigo-900">{t('register.orgInviteBanner')}</p>
                <p className="text-xs text-indigo-600">{t('register.orgInviteDesc', { orgName })}</p>
              </div>
            </div>
          )}
          {normalizedOrgToken && orgTokenValid === false && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('register.invalidInvite')}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('register.fullName')}</Label>
              <Input id="fullName" type="text" placeholder={t('register.fullNamePlaceholder')} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('register.phone')}</Label>
              <Input id="phone" type="tel" placeholder={t('register.phonePlaceholder')} value={phone} onChange={(e) => setPhone(formatLithuanianPhone(e.target.value))} required />
              <p className="text-xs text-gray-500">{t('register.phoneHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <Input id="email" type="email" placeholder={t('register.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('common.password')}</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">{t('register.repeatPassword')}</Label>
              <div className="relative">
                <Input id="passwordConfirm" type={showPasswordConfirm ? 'text' : 'password'} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required className="pr-10" />
                <button type="button" onClick={() => setShowPasswordConfirm(!showPasswordConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-gray-600">
                  {t('register.agreePrivacy')}{' '}
                  <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">{t('register.privacyPolicy')}</Link>
                  . <span className="text-red-500">*</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-gray-600">
                  {t('register.agreeTerms')}{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">{t('register.terms')}</Link>
                  . <span className="text-red-500">*</span>
                </span>
              </label>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || (normalizedOrgToken !== null && orgTokenValid === false)}>
              {loading ? t('common.registering') : t('common.register')}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex justify-center">
          <p className="text-sm text-gray-500">
            {t('register.haveAccount')}{' '}
            <Link to="/login" className="text-blue-600 hover:underline">{t('common.login')}</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
