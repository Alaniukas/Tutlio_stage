import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import {
    CalendarDays,
    Users,
    CreditCard,
    BellRing,
    ArrowRight,
    ShieldCheck,
    Zap,
    Clock,
    CheckCircle,
    Wallet
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { buildLocalizedPath } from '@/lib/i18n';
import { usePlatform } from '@/contexts/PlatformContext';
import LecturesLanding from '@/pages/LecturesLanding';

export default function Landing() {
    const { t, locale } = useTranslation();
    const { platform } = usePlatform();

    if (platform === 'lecturers' || platform === 'teachers') {
        return <LecturesLanding />;
    }

    return (
        <div className="min-h-screen bg-[#fffefc] flex flex-col font-sans selection:bg-indigo-200 overflow-x-hidden">
            <LandingNavbar />

            <main className="flex-1 pt-20">
                <section className="relative overflow-hidden pt-16 pb-24 lg:pt-32 lg:pb-40">
                    <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-100/40 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-rose-50/50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 pointer-events-none" />

                    <div className="max-w-6xl mx-auto px-4 relative z-10 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-semibold mb-8 shadow-sm">
                            <Zap className="w-4 h-4 text-orange-500 fill-orange-500" />
                            {t('landing.heroBadge')}
                        </div>

                        <h1 className="text-5xl lg:text-7xl font-black text-gray-900 tracking-tight leading-[1.1] mb-6 max-w-4xl mx-auto">
                            {t('landing.heroTitle')}<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">{t('landing.heroTitleHighlight')}</span>
                        </h1>

                        <p className="text-lg lg:text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed" dangerouslySetInnerHTML={{ __html: t('landing.heroDesc') }} />


                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link to="/register">
                                <Button size="lg" className="h-14 px-8 text-lg rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xl shadow-indigo-200 w-full sm:w-auto">
                                    {t('landing.startFree')}
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                            </Link>
                            <Link to={buildLocalizedPath('/apie-mus', locale)}>
                                <Button variant="outline" size="lg" className="h-14 px-8 text-lg rounded-2xl border-gray-200 text-gray-700 hover:bg-gray-50 font-bold w-full sm:w-auto">
                                    {t('landing.learnMore')}
                                </Button>
                            </Link>
                        </div>

                        <div className="mt-20 relative mx-auto max-w-5xl group">
                            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2.5rem] blur-2xl opacity-20 group-hover:opacity-40 transition duration-1000" />
                            <div className="relative rounded-[2rem] bg-white/80 backdrop-blur-xl border border-white/60 shadow-2xl overflow-hidden">
                                <img
                                    src="/landing/dashboard.png"
                                    alt={t('landing.dashboardAlt')}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-20 bg-white">
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                            <div>
                                <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">
                                    {t('landing.showcaseTitle')}
                                </h2>
                                <p className="text-gray-500 max-w-xl">
                                    {t('landing.showcaseDesc')}
                                </p>
                            </div>
                            <p className="text-xs md:text-sm text-gray-400 max-w-xs">
                                {t('landing.showcaseNote')}
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="group rounded-3xl overflow-hidden bg-gray-100 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 text-left w-full">
                                        <div className="relative h-56 overflow-hidden">
                                            <img src="/landing/calendar.png" alt={t('landing.calendarAlt')} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                                            <div className="absolute bottom-4 left-4 right-4 text-white">
                                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-1 flex items-center gap-1">
                                                    <CalendarDays className="w-3 h-3" /> {t('landing.calendarLabel')}
                                                </p>
                                                <h3 className="text-lg font-bold leading-snug">{t('landing.calendarTitle')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-5 space-y-2">
                                            <p className="text-sm text-gray-600">{t('landing.calendarDesc')}</p>
                                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>{t('landing.calendarNote')}</span>
                                            </p>
                                        </div>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto border-0 bg-transparent p-2 shadow-none">
                                    <img src="/landing/calendar.png" alt={t('landing.calendarAlt')} className="w-full max-h-[85vh] h-auto object-contain rounded-3xl border border-gray-200" />
                                </DialogContent>
                            </Dialog>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="group rounded-3xl overflow-hidden bg-gray-100 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 text-left w-full">
                                        <div className="relative h-56 overflow-hidden">
                                            <img src="/landing/waitlist.png" alt={t('landing.waitlistAlt')} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                                            <div className="absolute bottom-4 left-4 right-4 text-white">
                                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-1 flex items-center gap-1">
                                                    <Users className="w-3 h-3" /> {t('landing.waitlistLabel')}
                                                </p>
                                                <h3 className="text-lg font-bold leading-snug">{t('landing.waitlistTitle')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-5 space-y-2">
                                            <p className="text-sm text-gray-600">{t('landing.waitlistDesc')}</p>
                                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" />
                                                <span>{t('landing.waitlistNote')}</span>
                                            </p>
                                        </div>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto border-0 bg-transparent p-2 shadow-none">
                                    <img src="/landing/waitlist.png" alt={t('landing.waitlistAlt')} className="w-full max-h-[85vh] h-auto object-contain rounded-3xl border border-gray-200" />
                                </DialogContent>
                            </Dialog>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="group rounded-3xl overflow-hidden bg-gray-100 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 text-left w-full">
                                        <div className="relative h-56 overflow-hidden">
                                            <img src="/landing/finance.png" alt={t('landing.paymentsAlt')} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                                            <div className="absolute bottom-4 left-4 right-4 text-white">
                                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-1 flex items-center gap-1">
                                                    <CreditCard className="w-3 h-3" /> {t('landing.paymentsLabel')}
                                                </p>
                                                <h3 className="text-lg font-bold leading-snug">{t('landing.paymentsTitle')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-5 space-y-2">
                                            <p className="text-sm text-gray-600">{t('landing.paymentsDesc')}</p>
                                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3" />
                                                <span>{t('landing.paymentsNote')}</span>
                                            </p>
                                        </div>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto border-0 bg-transparent p-2 shadow-none">
                                    <img src="/landing/finance.png" alt={t('landing.paymentsAlt')} className="w-full max-h-[85vh] h-auto object-contain rounded-3xl border border-gray-200" />
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">{t('landing.featuresTitle')}</h2>
                            <p className="text-gray-500 max-w-2xl mx-auto">{t('landing.featuresDesc')}</p>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {[
                                { icon: Users, title: t('landing.feature.waitlist'), desc: t('landing.feature.waitlistDesc') },
                                { icon: CalendarDays, title: t('landing.feature.calendar'), desc: t('landing.feature.calendarDesc') },
                                { icon: CreditCard, title: t('landing.feature.payments'), desc: t('landing.feature.paymentsDesc') },
                                { icon: BellRing, title: t('landing.feature.reminders'), desc: t('landing.feature.remindersDesc') },
                                { icon: ShieldCheck, title: t('landing.feature.cancellation'), desc: t('landing.feature.cancellationDesc') },
                                { icon: Zap, title: t('landing.feature.comments'), desc: t('landing.feature.commentsDesc') }
                            ].map((f, idx) => (
                                <div key={idx} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
                                        <f.icon className="w-7 h-7 text-indigo-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-3">{f.title}</h3>
                                    <p className="text-gray-500 leading-relaxed">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="mb-8 text-center">
                            <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">{t('landing.insideTitle')}</h2>
                            <p className="text-gray-500 max-w-2xl mx-auto text-sm md:text-base">{t('landing.insideDesc')}</p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left w-full">
                                        <img src="/landing/students.png" alt={t('landing.insideStudentsAlt')} className="w-full h-52 object-cover" loading="lazy" />
                                        <div className="p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500 mb-1">{t('landing.insideStudents')}</p>
                                            <p className="text-sm text-gray-600">{t('landing.insideStudentsDesc')}</p>
                                        </div>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto border-0 bg-transparent p-2 shadow-none">
                                    <img src="/landing/students.png" alt={t('landing.insideStudentsAlt')} className="w-full max-h-[85vh] h-auto object-contain rounded-3xl border border-gray-200" />
                                </DialogContent>
                            </Dialog>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left w-full">
                                        <img src="/landing/settings.png" alt={t('landing.insideSettingsAlt')} className="w-full h-52 object-cover" loading="lazy" />
                                        <div className="p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500 mb-1">{t('landing.insideSettings')}</p>
                                            <p className="text-sm text-gray-600">{t('landing.insideSettingsDesc')}</p>
                                        </div>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto border-0 bg-transparent p-2 shadow-none">
                                    <img src="/landing/settings.png" alt={t('landing.insideSettingsAlt')} className="w-full max-h-[85vh] h-auto object-contain rounded-3xl border border-gray-200" />
                                </DialogContent>
                            </Dialog>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left w-full">
                                        <img src="/landing/student-dashboard.png" alt={t('landing.insideStudentExpAlt')} className="w-full h-52 object-cover" loading="lazy" />
                                        <div className="p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500 mb-1">{t('landing.insideStudentExp')}</p>
                                            <p className="text-sm text-gray-600">{t('landing.insideStudentExpDesc')}</p>
                                        </div>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto border-0 bg-transparent p-2 shadow-none">
                                    <img src="/landing/student-dashboard.png" alt={t('landing.insideStudentExpAlt')} className="w-full max-h-[85vh] h-auto object-contain rounded-3xl border border-gray-200" />
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </section>

                <section className="py-24">
                    <div className="max-w-5xl mx-auto px-4">
                        <div className="bg-gradient-to-br from-indigo-900 to-violet-800 rounded-[40px] p-10 md:p-16 text-center relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[60px]" />
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/30 rounded-full blur-[60px]" />

                            <h2 className="text-3xl md:text-5xl font-black text-white mb-6 relative z-10">
                                {t('landing.ctaTitle')}
                            </h2>
                            <p className="text-indigo-200 text-lg mb-10 max-w-2xl mx-auto relative z-10">
                                {t('landing.ctaDesc')}
                            </p>

                            <Link to="/register" className="relative z-10 inline-block">
                                <Button size="lg" className="h-14 px-8 text-lg rounded-2xl bg-white text-indigo-900 hover:bg-gray-100 font-bold shadow-xl">
                                    {t('landing.ctaButton')}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <LandingFooter />
        </div>
    );
}
