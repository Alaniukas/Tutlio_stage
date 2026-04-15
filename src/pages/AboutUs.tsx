import { Link } from 'react-router-dom';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { Button } from '@/components/ui/button';
import { Target, Heart, Shield, Sparkles } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function AboutUs() {
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-[#fffefc] flex flex-col font-sans selection:bg-indigo-200">
            <LandingNavbar />

            <main className="flex-1 pt-20">
                <section className="relative overflow-hidden pt-20 pb-20">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
                        <h1 className="text-4xl lg:text-6xl font-black text-gray-900 tracking-tight leading-tight mb-6">{t('about.title')}</h1>
                        <p className="text-lg lg:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto">{t('about.subtitle')}</p>
                    </div>
                </section>

                <section className="py-16">
                    <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-12 lg:gap-20">
                        <div className="flex-1 space-y-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-sm font-bold uppercase tracking-wider">
                                {t('about.missionBadge')}
                            </div>
                            <h2 className="text-3xl font-bold text-gray-900">{t('about.missionTitle')}</h2>
                            <p className="text-lg text-gray-600 leading-relaxed">{t('about.missionDesc1')}</p>
                            <p className="text-lg text-gray-600 leading-relaxed">{t('about.missionDesc2')}</p>
                        </div>
                        <div className="flex-1 w-full">
                            <img
                                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80"
                                alt={t('about.missionImgAlt')}
                                className="rounded-3xl shadow-xl w-full object-cover aspect-[4/3]"
                            />
                        </div>
                    </div>
                </section>

                <section className="py-20 bg-gray-50/50">
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('about.valuesTitle')}</h2>
                            <p className="text-gray-500 max-w-2xl mx-auto">{t('about.valuesDesc')}</p>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {[
                                { icon: Shield, title: t('about.valueSecurity'), desc: t('about.valueSecurityDesc') },
                                { icon: Target, title: t('about.valueFocus'), desc: t('about.valueFocusDesc') },
                                { icon: Heart, title: t('about.valueCommunity'), desc: t('about.valueCommunityDesc') },
                                { icon: Sparkles, title: t('about.valueInnovation'), desc: t('about.valueInnovationDesc') }
                            ].map((v, i) => (
                                <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm text-center">
                                    <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 mx-auto mb-4">
                                        <v.icon className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">{v.title}</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">{v.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-20 text-center">
                    <div className="max-w-3xl mx-auto px-4">
                        <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('about.joinTitle')}</h2>
                        <p className="text-gray-500 mb-8 max-w-xl mx-auto">{t('about.joinDesc')}</p>
                        <div className="flex justify-center gap-4">
                            <Link to="/kontaktai">
                                <Button size="lg" className="rounded-xl px-8 font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                                    {t('about.contactButton')}
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
