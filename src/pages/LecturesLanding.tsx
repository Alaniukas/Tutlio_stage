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

type LecturesCopy = {
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

const ltCopy: LecturesCopy = {
  badge: 'Tutlio Lectures',
  title: 'Profesionali platforma imoniu nuotoliniams mokymams',
  subtitle:
    'Planuokite mokymu ciklus, valdykite lektorius, dalyvius ir lankomuma vienoje saugioje sistemoje. Maziau rankinio darbo, daugiau kokybisku mokymu.',
  ctaSecondary: 'Susisiekti',
  trust: 'Sukurta organizacijoms, kurios vykdo vidinius ar klientinius nuotolinius mokymus.',
  problemTitle: 'Kas dazniausiai stabdo mokymu komandas',
  problems: [
    'Mokymu tvarkarasciai, registracijos ir dalyviu sarasai issibarste per kelis irankius.',
    'Lektoriai neturi vieningos vietos, kur matyti sesijas, dalyvius ir uzduotis.',
    'Ataskaitos apie lankomuma ir progresa ruosiamos rankiniu budu.',
  ],
  solutionTitle: 'Vieninga valdymo erdve mokymu operacijoms',
  solutionLead:
    'Tutlio Lectures sujungia planavima, komunikacija ir rezultatu stebejima, kad komanda galetu susitelkti i turini ir dalyviu patirti.',
  featuresTitle: 'Viskas, ko reikia nuotoliniams mokymams imoneje',
  features: [
    {
      title: 'Mokymu ciklu planavimas',
      desc: 'Valdykite vienkartines ir pasikartojancias sesijas, temas ir lektoriu apkrovas viename kalendoriuje.',
    },
    {
      title: 'Lektoriu ir grupiu valdymas',
      desc: 'Priskirkite lektorius, dalyviu grupes ir atsakomybes be rankiniu sarasu ar pasikartojanciu el. laisku.',
    },
    {
      title: 'Dalyviu patirtis',
      desc: 'Aiski prisijungimo ir sesiju aplinka dalyviams: tvarkarastis, priminimai ir visa svarbi informacija vienoje vietoje.',
    },
    {
      title: 'Ataskaitos ir KPI',
      desc: 'Stebekite lankomuma, aktyvuma ir mokymu rezultatus, kad greitai matytumete poveiki verslo tikslams.',
    },
    {
      title: 'Sauga ir patikimumas',
      desc: 'Rolemis paremta prieiga, centralizuoti duomenys ir procesai, kurie tinka augancioms organizacijoms.',
    },
    {
      title: 'Automatizuota komunikacija',
      desc: 'Automatiniai priminimai ir pranesimai sumazina neatvykimu skaiciu ir administracini triuksmą.',
    },
  ],
  processTitle: 'Kaip tai veikia',
  process: [
    {
      step: '01',
      title: 'Strukturizuojate mokymu modelį',
      desc: 'Sukuriate temas, grupes, lektoriu rolės ir sesiju taisykles pagal savo organizacijos poreikius.',
    },
    {
      step: '02',
      title: 'Paleidziate cikla',
      desc: 'Pakvieciate dalyvius, suplanuojate sesijas ir aktyvuojate automatinius priminimus.',
    },
    {
      step: '03',
      title: 'Matuojate rezultata',
      desc: 'Realiu laiku matote lankomuma ir progresa, o komandai pateikiate aiskias ataskaitas.',
    },
  ],
  finalTitle: 'Paruoskite savo mokymu operacijas augimui',
  finalDesc:
    'Jei jūsų komanda vykdo nuotolinius mokymus, Tutlio Lectures pades dirbti struktūruotai, profesionaliai ir skaidriai.',
};

const enCopy: LecturesCopy = {
  badge: 'Tutlio Lectures',
  title: 'A professional platform for corporate remote training',
  subtitle:
    'Plan training cycles, manage lecturers, participants, and attendance in one secure system. Less manual work, more high-quality training delivery.',
  ctaSecondary: 'Contact sales',
  trust: 'Built for organizations that run internal or client-facing remote training programs.',
  problemTitle: 'Common blockers for training teams',
  problems: [
    'Schedules, registrations, and participant lists are spread across multiple tools.',
    'Lecturers lack one place to see sessions, participants, and preparation context.',
    'Attendance and progress reporting is still done manually.',
  ],
  solutionTitle: 'One operating layer for training delivery',
  solutionLead:
    'Tutlio Lectures unifies planning, communication, and performance tracking so teams can focus on content quality and learner outcomes.',
  featuresTitle: 'Everything needed for enterprise remote training',
  features: [
    {
      title: 'Training cycle planning',
      desc: 'Manage one-time and recurring sessions, topics, and lecturer workloads in a single calendar.',
    },
    {
      title: 'Lecturer and cohort management',
      desc: 'Assign lecturers, participant cohorts, and responsibilities without spreadsheet overhead.',
    },
    {
      title: 'Participant experience',
      desc: 'A clear participant workspace for schedule, reminders, and session context in one place.',
    },
    {
      title: 'Reporting and KPIs',
      desc: 'Track attendance, engagement, and progress to connect training outcomes with business goals.',
    },
    {
      title: 'Security and governance',
      desc: 'Role-based access and centralized data flows designed for growing organizations.',
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
      title: 'Define your training model',
      desc: 'Set up topics, cohorts, lecturer roles, and delivery rules based on your organization.',
    },
    {
      step: '02',
      title: 'Launch and run sessions',
      desc: 'Invite participants, publish schedules, and keep operations aligned with automated reminders.',
    },
    {
      step: '03',
      title: 'Measure and optimize',
      desc: 'Use attendance and progress insights to improve program quality and impact.',
    },
  ],
  finalTitle: 'Scale training operations with confidence',
  finalDesc:
    'If your team delivers remote learning, Tutlio Lectures helps you run a structured, professional, and measurable training operation.',
};

export default function LecturesLanding() {
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
                <img src="/landing/dashboard.png" alt="Training dashboard overview" className="w-full h-48 object-cover" loading="lazy" />
                <div className="p-5">
                  <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                    <MessageSquareText className="w-4 h-4" />
                    {locale === 'lt' ? 'Susirasinejimo kanalai' : 'Messaging channels'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {locale === 'lt'
                      ? 'Lektoriai, koordinatoriai ir dalyviai komunikuoja vienoje vietoje su pilna konteksto istorija.'
                      : 'Lecturers, coordinators, and participants communicate in one place with full context history.'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <img src="/landing/finance.png" alt="Automated payments and finance overview" className="w-full h-48 object-cover" loading="lazy" />
                <div className="p-5">
                  <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4" />
                    {locale === 'lt' ? 'Automatiniai apmokejimai' : 'Automated payments'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {locale === 'lt'
                      ? 'Mokejimu surinkimas ir stebejimas automatizuojamas, kad komanda maziau laiko skirtu rankiniam administravimui.'
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
                      ? 'Sistema primena apie sesijas ir svarbius veiksmus automatiskai, sumazindama neatvykimu rizika.'
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
              B2B training operations
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
