import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { Phone, Mail, MapPin } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Contact() {
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-[#fffefc] flex flex-col font-sans selection:bg-indigo-200">
            <LandingNavbar />

            <main className="flex-1 pt-20">
                <section className="relative overflow-hidden pt-20 pb-20">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-rose-100/40 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
                        <h1 className="text-4xl lg:text-6xl font-black text-gray-900 tracking-tight leading-tight mb-6">{t('contact.title')}</h1>
                        <p className="text-lg lg:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto">{t('contact.subtitle')}</p>
                    </div>
                </section>

                <section className="py-16 pb-32">
                    <div className="max-w-4xl mx-auto px-4">
                        <div className="bg-white rounded-[40px] shadow-xl border border-gray-100 p-8 md:p-12">
                            <div className="grid md:grid-cols-2 gap-12">
                                <div className="space-y-8">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('contact.ourContacts')}</h2>
                                        <p className="text-gray-500 mb-8 leading-relaxed">{t('contact.description')}</p>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100/50">
                                                <Phone className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{t('common.phone')}</p>
                                                <a href="tel:+37062394956" className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors">+370 623 94956</a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100/50">
                                                <Mail className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{t('common.email')}</p>
                                                <a href="mailto:info@tutlio.lt" className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors">info@tutlio.lt</a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100/50">
                                                <MapPin className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{t('common.location')}</p>
                                                <p className="text-lg font-bold text-gray-900">{t('common.lithuania')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-3xl p-8 flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/50 rounded-full blur-[40px] translate-x-1/2 -translate-y-1/2" />
                                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-rose-200/50 rounded-full blur-[40px] -translate-x-1/2 translate-y-1/2" />
                                    <img
                                        src="https://images.unsplash.com/photo-1596524430615-b46475ddff6e?auto=format&fit=crop&w=600&q=80"
                                        alt="Contact support"
                                        className="rounded-2xl shadow-xl w-full h-full object-cover max-h-[300px]"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <LandingFooter />
        </div>
    );
}
