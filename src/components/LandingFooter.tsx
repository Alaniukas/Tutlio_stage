import { GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { buildLocalizedPath } from '@/lib/i18n';

export default function LandingFooter() {
    const { t, locale } = useTranslation();
    return (
        <footer className="bg-gray-50 border-t border-gray-200 py-12 mt-auto">
            <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-2 opacity-80 mix-blend-multiply">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <GraduationCap className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-gray-900 tracking-tight">Tutlio</span>
                </div>

                <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm font-medium text-gray-500">
                    <Link to={buildLocalizedPath('/apie-mus', locale)} className="hover:text-indigo-600 transition-colors">{t('nav.aboutUs')}</Link>
                    <Link to={buildLocalizedPath('/kontaktai', locale)} className="hover:text-indigo-600 transition-colors">{t('common.contacts')}</Link>
                    <Link to={buildLocalizedPath('/privacy-policy', locale)} className="hover:text-indigo-600 transition-colors">{t('footer.privacyPolicy')}</Link>
                    <Link to={buildLocalizedPath('/terms', locale)} className="hover:text-indigo-600 transition-colors">{t('footer.terms')}</Link>
                    <Link to={buildLocalizedPath('/dpa', locale)} className="hover:text-indigo-600 transition-colors">{t('footer.dpa')}</Link>
                    <Link to="/login" className="hover:text-indigo-600 transition-colors">{t('common.login')}</Link>
                </div>

                <p className="text-xs text-gray-400">
                    {t('common.allRightsReserved', { year: new Date().getFullYear() })}
                </p>
            </div>
        </footer>
    );
}
