import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { orgLoginButtonLabels, orgLoginPath } from '@/lib/orgLoginLinks';
import { useTranslation } from '@/lib/i18n';

export default function EmbedOrgLogin() {
  const { locale } = useTranslation();
  const [params] = useSearchParams();
  const { branding, loading } = useOrgBranding();
  const labels = useMemo(() => orgLoginButtonLabels(locale === 'en' ? 'en' : 'lt'), [locale]);

  const color = branding?.brand_color || '#6366f1';
  const slug = branding?.slug || params.get('org') || '';

  if (loading) {
    return <div className="min-h-[220px] bg-transparent" />;
  }
  if (!branding || !slug) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Organization login is not available.
      </div>
    );
  }

  return (
    <div className="min-h-full p-3 font-sans">
      <div className="flex flex-col gap-2.5 max-w-xs">
        {branding.logo_url && (
          <div className="inline-flex rounded-2xl overflow-hidden bg-white p-1.5 mb-1 w-fit">
            <img src={branding.logo_url} alt={branding.name} className="h-10 max-w-[180px] object-contain rounded-xl" />
          </div>
        )}
        {(['student', 'parent', 'tutor'] as const).map((portal) => (
          <a
            key={portal}
            href={orgLoginPath(slug, portal)}
            target="_top"
            rel="noreferrer"
            className="block text-center text-white font-semibold text-sm py-3 px-4 rounded-xl no-underline"
            style={{ background: color }}
          >
            {labels[portal]}
          </a>
        ))}
      </div>
    </div>
  );
}
