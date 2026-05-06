import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Building2, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const COUNTRY_DIAL_CODES = [
  { code: 'LT', label: 'Lithuania', dial: '+370' },
  { code: 'LV', label: 'Latvia', dial: '+371' },
  { code: 'EE', label: 'Estonia', dial: '+372' },
  { code: 'PL', label: 'Poland', dial: '+48' },
  { code: 'DE', label: 'Germany', dial: '+49' },
  { code: 'GB', label: 'United Kingdom', dial: '+44' },
  { code: 'IE', label: 'Ireland', dial: '+353' },
  { code: 'NO', label: 'Norway', dial: '+47' },
  { code: 'SE', label: 'Sweden', dial: '+46' },
  { code: 'FI', label: 'Finland', dial: '+358' },
  { code: 'DK', label: 'Denmark', dial: '+45' },
  { code: 'NL', label: 'Netherlands', dial: '+31' },
  { code: 'BE', label: 'Belgium', dial: '+32' },
  { code: 'FR', label: 'France', dial: '+33' },
  { code: 'ES', label: 'Spain', dial: '+34' },
  { code: 'IT', label: 'Italy', dial: '+39' },
  { code: 'PT', label: 'Portugal', dial: '+351' },
  { code: 'US', label: 'United States', dial: '+1' },
  { code: 'CA', label: 'Canada', dial: '+1' },
  { code: 'AU', label: 'Australia', dial: '+61' },
  { code: 'NZ', label: 'New Zealand', dial: '+64' },
  { code: 'IN', label: 'India', dial: '+91' },
  { code: 'BR', label: 'Brazil', dial: '+55' },
  { code: 'MX', label: 'Mexico', dial: '+52' },
  { code: 'UA', label: 'Ukraine', dial: '+380' },
  { code: 'TR', label: 'Turkey', dial: '+90' },
];

const PHONE_EXAMPLES_BY_DIAL: Record<string, string> = {
  '+370': '61234567',
  '+371': '20123456',
  '+372': '51234567',
  '+48': '600123456',
  '+49': '15123456789',
  '+44': '7400123456',
  '+353': '851234567',
  '+47': '41234567',
  '+46': '701234567',
  '+358': '401234567',
  '+45': '20123456',
  '+31': '612345678',
  '+32': '470123456',
  '+33': '612345678',
  '+34': '612345678',
  '+39': '3123456789',
  '+351': '912345678',
  '+1': '6175551234',
  '+61': '412345678',
  '+64': '211234567',
  '+91': '9123456789',
  '+55': '11912345678',
  '+52': '5512345678',
  '+380': '501234567',
  '+90': '5321234567',
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidInternationalPhone(dialCode: string, localNumber: string): boolean {
  const dialDigits = digitsOnly(dialCode);
  const localDigits = digitsOnly(localNumber);
  const total = `${dialDigits}${localDigits}`;
  return total.length >= 7 && total.length <= 15;
}

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
  const [phoneDialCode, setPhoneDialCode] = useState('+370');
  const [phoneLocal, setPhoneLocal] = useState('');
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
  const phoneExampleLocal = PHONE_EXAMPLES_BY_DIAL[phoneDialCode] || '61234567';
  const phoneExampleFull = `${phoneDialCode} ${phoneExampleLocal}`;

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

    if (!isValidInternationalPhone(phoneDialCode, phoneLocal)) {
      setError(t('register.phoneErrorIntl', { example: phoneExampleFull }));
      setLoading(false);
      return;
    }
    const normalizedPhone = `${phoneDialCode}${digitsOnly(phoneLocal)}`;
    setPhone(normalizedPhone);

    if (!agreePrivacy || !agreeTerms) {
      setError(t('register.mustAgree'));
      setLoading(false);
      return;
    }

    const acceptedAt = new Date().toISOString();

    const stripeCheckoutSessionId = sessionStorage.getItem('stripe_checkout_session_id');

    const appOrigin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
    let authData: any = null;

    if (normalizedOrgToken) {
      const inviteRegisterRes = await fetch('/api/register-tutor-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone: normalizedPhone,
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
      // Email confirmation must land on a route that can consume the auth hash.
      // Then we continue to subscription flow via ?next=...
      const emailRedirectTo = `${appOrigin}/auth/callback?next=${encodeURIComponent('/registration/subscription')}`;
      const signUpResult = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: fullName,
            phone: normalizedPhone,
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
        phone: meta.phone || normalizedPhone,
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
              <div className="grid grid-cols-[150px_1fr] gap-2">
                <select
                  aria-label="Country code"
                  value={phoneDialCode}
                  onChange={(e) => setPhoneDialCode(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {COUNTRY_DIAL_CODES.map((c) => (
                    <option key={`${c.code}-${c.dial}`} value={c.dial}>
                      {c.code} {c.dial}
                    </option>
                  ))}
                </select>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={phoneExampleLocal}
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-gray-500">{t('register.phonePlaceholderIntl', { example: phoneExampleLocal })}</p>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                {t('register.phoneHintIntl', { example: phoneExampleFull })}
              </div>
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
