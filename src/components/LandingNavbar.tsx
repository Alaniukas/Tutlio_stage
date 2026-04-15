import { Link } from 'react-router-dom';
import { GraduationCap, AppWindow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import LanguageSelector from '@/components/LanguageSelector';
import { buildLocalizedPath } from '@/lib/i18n';

export default function LandingNavbar() {
    const { t, locale } = useTranslation();
    return (
        <nav className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-indigo-50 z-50 flex items-center">
            <div className="max-w-6xl mx-auto px-4 w-full flex items-center justify-between">
                <Link to={buildLocalizedPath('/', locale)} className="flex items-center gap-2 group">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                        <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                    <span className="font-black text-xl text-gray-900 tracking-tight">Tutlio</span>
                </Link>
                <div className="flex items-center gap-8">
                    <div className="hidden md:flex items-center gap-6">
                        <Link to={buildLocalizedPath('/apie-mus', locale)} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
                            {t('nav.aboutUs')}
                        </Link>
                        <Link to={buildLocalizedPath('/pricing', locale)} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
                            {t('common.prices')}
                        </Link>
                        <Link to={buildLocalizedPath('/kontaktai', locale)} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
                            {t('common.contacts')}
                        </Link>
                    </div>
                    <LanguageSelector />
                    <Link to="/login">
                        <Button className="rounded-xl px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wide shadow-md shadow-indigo-200 gap-2">
                            {t('common.login')}
                            <AppWindow className="w-4 h-4" />
                        </Button>
                    </Link>
                </div>
            </div>
        </nav>
    );
}
