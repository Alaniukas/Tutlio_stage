

import { Link } from 'react-router-dom';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';

export default function LandingFooter() {
  const { t, locale } = useTranslation();

  return (
    <footer className="bg-gray-900 text-white mt-auto">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 py-10 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <Link to={buildLocalizedPath('/', locale)} className="flex items-center gap-2 mb-4">
              <img src="/logo-icon.png" alt="Tutlio" className="w-7 h-7 rounded-lg" />
              <span className="font-bold text-[15px] text-white tracking-tight">Tutlio</span>
            </Link>
            <h4 className="text-[13px] font-semibold text-white mb-1.5">{t('landing.footerTitle')}</h4>
            <p className="text-[13px] text-gray-500 max-w-xs leading-relaxed">{t('landing.footerTagline')}</p>
          </div>

          <div>
            <h4 className="font-semibold text-[13px] text-white mb-4">{t('landing.footerSolutions')}</h4>
            <ul className="space-y-2.5 text-[13px] text-gray-500">
              <li><Link to={buildLocalizedPath('/pricing', locale)} className="hover:text-white transition-colors">{t('common.prices')}</Link></li>
              <li><Link to="/schools" className="hover:text-white transition-colors">{locale === 'lt' ? 'Mokykloms' : 'For Schools'}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-[13px] text-white mb-4">{t('landing.footerResources')}</h4>
            <ul className="space-y-2.5 text-[13px] text-gray-500">
              <li><Link to={buildLocalizedPath('/apie-mus', locale)} className="hover:text-white transition-colors">{t('nav.aboutUs')}</Link></li>
              <li><Link to={buildLocalizedPath('/kontaktai', locale)} className="hover:text-white transition-colors">{t('common.contacts')}</Link></li>
              <li><Link to={buildLocalizedPath('/blog', locale)} className="hover:text-white transition-colors">{locale === 'lt' ? 'Tinklaraštis' : 'Blog'}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-[13px] text-white mb-4">{t('landing.footerCompany')}</h4>
            <ul className="space-y-2.5 text-[13px] text-gray-500">
              <li><Link to={buildLocalizedPath('/privacy-policy', locale)} className="hover:text-white transition-colors">{t('footer.privacyPolicy')}</Link></li>
              <li><Link to={buildLocalizedPath('/terms', locale)} className="hover:text-white transition-colors">{t('footer.terms')}</Link></li>
              <li><Link to={buildLocalizedPath('/dpa', locale)} className="hover:text-white transition-colors">{t('footer.dpa')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06] text-[12px] text-gray-600 text-center">
          {t('common.allRightsReserved', { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
}
