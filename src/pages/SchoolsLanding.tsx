import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  LineChart,
  MessageSquareText,
  ShieldCheck,
  Users2,
  Video,
  BellRing,
  CreditCard,
} from 'lucide-react';

type SchoolsCopy = {
  badge: string;
  title: string;
  subtitle: string;
  ctaSecondary: string;
  trust: string;
  problemTitle: string;
  problems: string[];
  solutionTitle: string;
  solutionLead: string;
  featuresTitle: string;
  features: { title: string; desc: string }[];
  processTitle: string;
  process: { step: string; title: string; desc: string }[];
  finalTitle: string;
  finalDesc: string;
};

const ltCopy: SchoolsCopy = {
  badge: 'Tutlio Schools',
  title: 'Profesionali platforma mokyklų valdymui',
  subtitle:
    'Tvarkykite mokytojus, mokinius, sutartis ir mokėjimus vienoje saugioje sistemoje. Mažiau rankinio darbo, daugiau kokybiškų pamokų.',
  ctaSecondary: 'Susisiekti',
  trust: 'Sukurta mokykloms, kurios nori skaitmenizuoti administravimą ir pamokų valdymą.',
  problemTitle: 'Kas dažniausiai stabdo mokyklas',
  problems: [
    'Tvarkaraščiai, registracijos ir mokinių sąrašai išsibarstę per kelis įrankius.',
    'Mokytojai neturi vieningos vietos, kur matyti pamokas, mokinius ir užduotis.',
    'Sutarčių ir mokėjimų administravimas vis dar atliekamas rankiniu būdu.',
  ],
  solutionTitle: 'Vieninga valdymo erdvė mokykloms',
  solutionLead:
    'Tutlio Schools sujungia planavimą, komunikaciją ir mokėjimų valdymą, kad administracija galėtų susitelkti į mokymo kokybę.',
  featuresTitle: 'Viskas, ko reikia mokyklos valdymui',
  features: [
    {
      title: 'Pamokų planavimas',
      desc: 'Valdykite vienkartines ir pasikartojančias pamokas, temas ir mokytojų apkrovas viename kalendoriuje.',
    },
    {
      title: 'Mokytojų ir mokinių valdymas',
      desc: 'Priskirkite mokytojus, mokinių grupes ir atsakomybes be rankinių sąrašų ar pasikartojančių el. laiškų.',
    },
    {
      title: 'Mokinių patirtis',
      desc: 'Aiški prisijungimo ir pamokų aplinka mokiniams: tvarkaraštis, priminimai ir visa svarbi informacija vienoje vietoje.',
    },
    {
      title: 'Ataskaitos ir KPI',
      desc: 'Stebėkite lankomumą, aktyvumą ir mokymosi rezultatus, kad greitai matytumėte poveikį.',
    },
    {
      title: 'Sauga ir patikimumas',
      desc: 'Rolėmis paremta prieiga, centralizuoti duomenys ir procesai, kurie tinka augančioms mokykloms.',
    },
    {
      title: 'Automatizuota komunikacija',
      desc: 'Automatiniai priminimai ir pranešimai sumažina neatvykimų skaičių ir administracinį triukšmą.',
    },
  ],
  processTitle: 'Kaip tai veikia',
  process: [
    {
      step: '01',
      title: 'Sukuriate mokyklos struktūrą',
      desc: 'Sukuriate dalykus, grupes, mokytojų roles ir pamokų taisykles pagal savo mokyklos poreikius.',
    },
    {
      step: '02',
      title: 'Paleidžiate procesą',
      desc: 'Pakviečiate mokinius, suplanuojate pamokas ir aktyvuojate automatinius priminimus.',
    },
    {
      step: '03',
      title: 'Matuojate rezultatą',
      desc: 'Realiu laiku matote lankomumą ir progresą, o komandai pateikiate aiškias ataskaitas.',
    },
  ],
  finalTitle: 'Paruoškite savo mokyklą augimui',
  finalDesc:
    'Jei jūsų mokykla ieško profesionalaus įrankio administravimui, Tutlio Schools padės dirbti struktūruotai, skaidriai ir efektyviai.',
};

const enCopy: SchoolsCopy = {
  badge: 'Tutlio Schools',
  title: 'A professional platform for school management',
  subtitle:
    'Manage teachers, students, contracts, and payments in one secure system. Less manual work, more high-quality teaching.',
  ctaSecondary: 'Contact us',
  trust: 'Built for schools that want to digitize administration and lesson management.',
  problemTitle: 'Common blockers for schools',
  problems: [
    'Schedules, registrations, and student lists are spread across multiple tools.',
    'Teachers lack one place to see lessons, students, and preparation context.',
    'Contract and payment administration is still done manually.',
  ],
  solutionTitle: 'One operating layer for schools',
  solutionLead:
    'Tutlio Schools unifies planning, communication, and payment management so administration can focus on teaching quality.',
  featuresTitle: 'Everything needed for school management',
  features: [
    {
      title: 'Lesson planning',
      desc: 'Manage one-time and recurring lessons, topics, and teacher workloads in a single calendar.',
    },
    {
      title: 'Teacher and student management',
      desc: 'Assign teachers, student groups, and responsibilities without spreadsheet overhead.',
    },
    {
      title: 'Student experience',
      desc: 'A clear student workspace for schedule, reminders, and lesson context in one place.',
    },
    {
      title: 'Reporting and KPIs',
      desc: 'Track attendance, engagement, and progress to measure educational impact.',
    },
    {
      title: 'Security and governance',
      desc: 'Role-based access and centralized data flows designed for growing schools.',
    },
    {
      title: 'Automated communication',
      desc: 'Automated reminders and operational alerts reduce no-shows and administrative noise.',
    },
  ],
  processTitle: 'How it works',
  process: [
    {
      step: '01',
      title: 'Set up your school structure',
      desc: 'Configure subjects, groups, teacher roles, and lesson rules based on your school.',
    },
    {
      step: '02',
      title: 'Launch and run lessons',
      desc: 'Invite students, publish schedules, and keep operations aligned with automated reminders.',
    },
    {
      step: '03',
      title: 'Measure and optimize',
      desc: 'Use attendance and progress insights to improve program quality and impact.',
    },
  ],
  finalTitle: 'Scale your school operations with confidence',
  finalDesc:
    'If your school is looking for a professional administration tool, Tutlio Schools helps you run a structured, transparent, and efficient operation.',
};

export default function SchoolsLanding() {
  const { locale } = useTranslation();
  const c = locale === 'lt' ? ltCopy : enCopy;

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar />

      <main className="flex-1 pt-20">
        <section className="relative overflow-hidden py-20 lg:py-28 bg-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.35),_transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(20,184,166,0.2),_transparent_45%)]" />
          <div className="max-w-6xl mx-auto px-4 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-100 text-sm font-semibold mb-6">
              <GraduationCap className="w-4 h-4" />
              {c.badge}
            </div>
            <h1 className="text-4xl lg:text-6xl font-black text-white leading-tight max-w-4xl">{c.title}</h1>
            <p className="mt-6 text-lg text-slate-200 max-w-3xl leading-relaxed">{c.subtitle}</p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link to={buildLocalizedPath('/kontaktai', locale)}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 rounded-xl border-slate-500 text-slate-100 bg-transparent hover:bg-slate-800"
                >
                  {c.ctaSecondary}
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-300">{c.trust}</p>
          </div>
        </section>

        <section className="py-16 bg-slate-50 border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-8">{c.problemTitle}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {c.problems.map((p) => (
                <div key={p} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-slate-700 leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">{c.solutionTitle}</h2>
            <p className="text-slate-600 max-w-3xl text-lg leading-relaxed">{c.solutionLead}</p>

            <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Video, ...c.features[0] },
                { icon: Users2, ...c.features[1] },
                { icon: CheckCircle2, ...c.features[2] },
                { icon: LineChart, ...c.features[3] },
                { icon: ShieldCheck, ...c.features[4] },
                { icon: ClipboardCheck, ...c.features[5] },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 p-6 bg-white shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-4">
                    <item.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-slate-50 border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <img src="/landing/dashboard.png" alt="School dashboard overview" className="w-full h-48 object-cover" loading="lazy" />
                <div className="p-5">
                  <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                    <MessageSquareText className="w-4 h-4" />
                    {locale === 'lt' ? 'Susirašinėjimo kanalai' : 'Messaging channels'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {locale === 'lt'
                      ? 'Mokytojai, administratoriai ir mokiniai komunikuoja vienoje vietoje su pilna konteksto istorija.'
                      : 'Teachers, administrators, and students communicate in one place with full context history.'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <img src="/landing/finance.png" alt="Automated payments and finance overview" className="w-full h-48 object-cover" loading="lazy" />
                <div className="p-5">
                  <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4" />
                    {locale === 'lt' ? 'Automatiniai apmokėjimai' : 'Automated payments'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {locale === 'lt'
                      ? 'Mokėjimų surinkimas ir stebėjimas automatizuojamas, kad administracija mažiau laiko skirtų rankiniam darbui.'
                      : 'Collection and tracking are automated so your team spends less time on manual billing operations.'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <img src="/landing/calendar.png" alt="Automated reminders and scheduling" className="w-full h-48 object-cover" loading="lazy" />
                <div className="p-5">
                  <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                    <BellRing className="w-4 h-4" />
                    {locale === 'lt' ? 'Automatiniai priminimai' : 'Automated reminders'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {locale === 'lt'
                      ? 'Sistema primena apie pamokas ir svarbius veiksmus automatiškai, sumažindama neatvykimų riziką.'
                      : 'The system sends reminders automatically, reducing no-shows and missed actions.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-slate-950">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-10">{c.processTitle}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {c.process.map((step) => (
                <div key={step.step} className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
                  <p className="text-indigo-300 text-xs font-bold tracking-[0.2em] mb-3">{step.step}</p>
                  <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 mb-4">
              <Building2 className="w-4 h-4" />
              {locale === 'lt' ? 'Mokyklų valdymas' : 'School management'}
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">{c.finalTitle}</h2>
            <p className="mt-4 text-slate-600 text-lg leading-relaxed">{c.finalDesc}</p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <Link to={buildLocalizedPath('/kontaktai', locale)}>
                <Button size="lg" variant="outline" className="h-12 px-7 rounded-xl border-slate-300 text-slate-700">
                  {c.ctaSecondary}
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
