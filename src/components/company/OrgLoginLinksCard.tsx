import { useMemo, useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import {
  orgLoginButtonLabels,
  orgLoginEmbedPath,
  orgLoginPath,
  orgLoginWidgetSrc,
  type OrgLoginPortal,
} from '@/lib/orgLoginLinks';

export function OrgLoginLinksCard({
  slug,
  loginDescription,
  onLoginDescriptionChange,
}: {
  slug: string;
  loginDescription: string;
  onLoginDescriptionChange: (value: string) => void;
}) {
  const { t, locale } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tutlio.lt';
  const labels = useMemo(() => orgLoginButtonLabels(locale === 'en' ? 'en' : 'lt'), [locale]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1600);
    } catch {
      /* ignore */
    }
  };

  const portals: OrgLoginPortal[] = ['student', 'parent', 'tutor'];
  const widget = `<script src="${orgLoginWidgetSrc(origin, slug, locale === 'en' ? 'en' : 'lt')}" async></script>`;
  const iframe = `<iframe src="${origin}${orgLoginEmbedPath(slug)}" title="${slug} login" style="border:0;width:320px;height:220px"></iframe>`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{t('compSet.orgLoginLinksTitle')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('compSet.orgLoginLinksDesc')}</p>
        </div>
      </div>

      {!slug ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {t('compSet.orgLoginNeedSlug')}
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">{t('compSet.orgLoginDescription')}</Label>
            <textarea
              value={loginDescription}
              onChange={(e) => onLoginDescriptionChange(e.target.value)}
              rows={3}
              placeholder={t('compSet.orgLoginDescriptionHint')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            {portals.map((portal) => {
              const url = `${origin}${orgLoginPath(slug, portal)}`;
              return (
                <div key={portal} className="flex items-center gap-2">
                  <Input readOnly value={url} className="rounded-xl text-xs font-mono" />
                  <button
                    type="button"
                    onClick={() => copy(portal, url)}
                    className="shrink-0 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {copied === portal ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <span className="hidden sm:block w-36 text-xs text-gray-500 shrink-0">{labels[portal]}</span>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">{t('compSet.embedScript')}</Label>
            <div className="flex items-start gap-2">
              <textarea readOnly value={widget} rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono" />
              <button
                type="button"
                onClick={() => copy('widget', widget)}
                className="shrink-0 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === 'widget' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">{t('compSet.embedIframe')}</Label>
            <div className="flex items-start gap-2">
              <textarea readOnly value={iframe} rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono" />
              <button
                type="button"
                onClick={() => copy('iframe', iframe)}
                className="shrink-0 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === 'iframe' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
