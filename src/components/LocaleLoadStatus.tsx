import { LOCALE_LOAD_COPY } from '@/lib/i18n/localeLoadCopy';
import { htmlLanguageCode, localeDirection, LOCALE_NAMES, type Locale } from '@/lib/i18n/locales';

export default function LocaleLoadStatus({ locale, failed, retry, compact = false, warnBeforeReload = true,
  reload = () => window.location.reload(),
}: {
  locale: Locale; failed: boolean; retry: () => void; compact?: boolean;
  warnBeforeReload?: boolean; reload?: () => void;
}) {
  const copy = LOCALE_LOAD_COPY[locale];
  return <div lang={htmlLanguageCode(locale)} dir={localeDirection(locale)}
    className={compact ? 'fixed bottom-4 inset-x-4 z-[100] mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-lg' : 'flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-6 text-center text-gray-900'}
    role={failed ? 'alert' : 'status'}>
    <bdi className="font-semibold">{LOCALE_NAMES[locale]}</bdi>
    <p>{failed ? copy.error : copy.loading}</p>
    {failed && <button type="button" onClick={retry}
      className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
      {copy.retry}
    </button>}
    {failed && <>
      {warnBeforeReload && <p className="mt-3 text-sm">{copy.reloadWarning}</p>}
      <button type="button" className="mt-3 rounded-lg border border-gray-300 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onClick={() => { if (!warnBeforeReload || window.confirm(copy.reloadWarning)) reload(); }}>
        {copy.reload}
      </button>
    </>}
  </div>;
}
