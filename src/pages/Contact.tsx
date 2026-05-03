import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { Phone, Mail, MapPin } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Contact() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f5f5f3] via-[#f0efed] to-white">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-white/40 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-16 pb-20 text-center">
            <h1 className="font-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-bold text-gray-900 tracking-tight leading-[1.1] mb-5">
              {t('contact.title')}
            </h1>
            <p className="text-[15px] lg:text-base text-gray-500 max-w-lg mx-auto leading-relaxed">
              {t('contact.subtitle')}
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="max-w-[1200px] mx-auto px-6 pb-24">
          <div className="max-w-[800px] mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-gray-900 mb-4">{t('contact.ourContacts')}</h2>
                  <p className="text-gray-500 text-[14px] mb-6 leading-relaxed">{t('contact.description')}</p>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#4f46e5] shrink-0">
                      <Phone className="w-[18px] h-[18px]" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{t('common.phone')}</p>
                      <a href="tel:+37062394956" className="text-[15px] font-semibold text-gray-900 hover:text-[#4f46e5] transition-colors">+370 623 94956</a>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#4f46e5] shrink-0">
                      <Mail className="w-[18px] h-[18px]" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{t('common.email')}</p>
                      <a href="mailto:info@tutlio.lt" className="text-[15px] font-semibold text-gray-900 hover:text-[#4f46e5] transition-colors">info@tutlio.lt</a>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#4f46e5] shrink-0">
                      <MapPin className="w-[18px] h-[18px]" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{t('common.location')}</p>
                      <p className="text-[15px] font-semibold text-gray-900">{t('common.lithuania')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#f5f5f3] to-[#eae9e6] rounded-2xl p-6 flex items-center justify-center overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1596524430615-b46475ddff6e?auto=format&fit=crop&w=600&q=80"
                  alt="Contact support"
                  className="rounded-xl w-full h-full object-cover max-h-[280px]"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
