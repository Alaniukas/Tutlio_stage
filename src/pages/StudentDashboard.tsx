import { useEffect, useState } from 'react';
import StudentLayout from '@/components/StudentLayout';
import StatusBadge from '@/components/StatusBadge';
import SessionFiles from '@/components/SessionFiles';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { format, isAfter, isBefore } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, Zap, BookOpen, Settings, Play, XCircle, CheckCircle, RefreshCw, CreditCard, Loader2, Package, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, normalizeUrl } from '@/lib/utils';
import { useStudentPaymentBlock } from '@/hooks/useStudentPaymentBlock';
import { parseOrgContactVisibility, maskTutorContact } from '@/lib/orgContactVisibility';
import { formatCustomerChargeEur } from '@/lib/stripeLessonPricing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

interface Session { id: string; start_time: string; end_time: string; status: string; paid: boolean; price: number | null; topic: string | null; meeting_link: string | null; payment_status?: string; tutor_comment?: string | null; show_comment_to_student?: boolean; subject_id?: string | null; subjects?: { is_group?: boolean; max_students?: number } | null; }
interface StudentInfo {
    full_name: string;
    grade: string | null;
    tutor: { full_name: string; email?: string; phone?: string | null } | null;
}
interface LessonPackage {
    id: string;
    total_lessons: number;
    available_lessons: number;
    expires_at?: string | null;
    subject_id: string;
    subjects?: any;
}

interface InstallmentPayment {
    id: string;
    installment_number: number;
    amount: number;
    due_date: string;
    payment_status: 'pending' | 'paid' | 'overdue' | 'failed';
    paid_at: string | null;
    contract_id: string;
}

export default function StudentDashboard() {
    const navigate = useNavigate();
    const { t, dateFnsLocale } = useTranslation();
    const sdc = getCached<any>('student_dashboard');
    const [student, setStudent] = useState<StudentInfo | null>(sdc?.student ?? null);
    const [sessions, setSessions] = useState<Session[]>(sdc?.sessions ?? []);
    const [loading, setLoading] = useState(!sdc);
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [stripeLoading, setStripeLoading] = useState(false);
    const [paymentPayer, setPaymentPayer] = useState<string | null>(sdc?.paymentPayer ?? null);
    const [activePackages, setActivePackages] = useState<LessonPackage[]>(sdc?.activePackages ?? []);
    const [installments, setInstallments] = useState<InstallmentPayment[]>(sdc?.installments ?? []);
    const [paymentsExpanded, setPaymentsExpanded] = useState(false);
    const [activeStudentId, setActiveStudentId] = useState<string | null>(sdc?.activeStudentId ?? null);
    const { blocked: paymentBookingBlocked, loading: paymentBlockLoading } = useStudentPaymentBlock(activeStudentId);
    const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';
    const now = new Date();

    const handleStripePayment = async (session: Session) => {
        setStripeLoading(true);
        try {
            const res = await fetch('/api/stripe-checkout', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ sessionId: session.id }),
            });
            const json = await res.json().catch(() => ({ error: t('studentDash.connectionError') }));
            if (json.creditFullyCovered) {
                fetchData();
                setStripeLoading(false);
                return;
            }
            if (json.url) {
                window.location.href = json.url;
                return;
            }
            alert(json.error || t('studentDash.paymentError'));
        } catch {
            alert(t('studentDash.connectionError'));
        }
        setStripeLoading(false);
    };

    useEffect(() => {
        if (!getCached('student_dashboard')) void fetchData();
    }, []);

    useEffect(() => {
        if (!loading && student) {
            setCache('student_dashboard', {
                student, sessions, paymentPayer,
                activePackages, installments, activeStudentId,
            });
        }
    }, [loading, student, sessions, activePackages, installments]);

    const fetchData = async () => {
        if (!getCached('student_dashboard')) setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setLoading(false);
            return;
        }

        const selectedStudentId = typeof window !== 'undefined'
            ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY)
            : null;
        let { data: studentRows, error: rpcError } = await supabase.rpc('get_student_profiles', {
            p_user_id: user.id,
            p_student_id: selectedStudentId || null,
        });
        if (rpcError) {
            console.error('[StudentDashboard] get_student_profiles', rpcError);
            setLoading(false);
            return;
        }

        let studentRow = studentRows?.[0];

        if (!studentRow && selectedStudentId) {
            const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_student_profiles', {
                p_user_id: user.id,
                p_student_id: null,
            });
            if (fallbackError) {
                console.error('[StudentDashboard] get_student_profiles fallback', fallbackError);
            } else {
                studentRow = fallbackRows?.[0];
                if (studentRow && typeof window !== 'undefined') {
                    localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, studentRow.id);
                }
            }
        }

        if (!studentRow) {
            setActiveStudentId(null);
            setStudent(null);
            setSessions([]);
            setActivePackages([]);
            setLoading(false);
            return;
        }

        if (studentRow) {
            setActiveStudentId(studentRow.id);
            setPaymentPayer(studentRow.payment_payer || null);

            let tutorInfo: StudentInfo['tutor'] = null;
            if (studentRow.tutor_id) {
                const [{ data: tutorProf }, { data: vis }] = await Promise.all([
                    supabase.from('profiles').select('email, phone').eq('id', studentRow.tutor_id).single(),
                    supabase.rpc('get_tutor_contact_visibility_for_student', { p_tutor_id: studentRow.tutor_id }),
                ]);
                const cv = parseOrgContactVisibility((vis as Record<string, unknown>) || null);
                tutorInfo = {
                    full_name: studentRow.tutor_full_name,
                    email: maskTutorContact(tutorProf?.email ?? null, cv.studentSeesTutorEmail),
                    phone: maskTutorContact(tutorProf?.phone ?? null, cv.studentSeesTutorPhone),
                };
            }

            setStudent({
                full_name: studentRow.full_name,
                grade: studentRow.grade,
                tutor: tutorInfo,
            });

            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            const { data: sessionsData } = await supabase
                .from('sessions')
                .select('*, subjects(is_group, max_students)')
                .eq('student_id', studentRow.id)
                .gte('start_time', threeMonthsAgo.toISOString())
                .order('start_time', { ascending: true });
            setSessions(sessionsData || []);

            const { data: packagesData } = await supabase
                .from('lesson_packages')
                .select('id, total_lessons, available_lessons, expires_at, subject_id, subjects(name)')
                .eq('student_id', studentRow.id)
                .eq('active', true)
                .eq('paid', true)
                .gt('available_lessons', 0);
            const nowTs = Date.now();
            const visiblePackages = ((packagesData || []) as LessonPackage[]).filter((pkg) => {
                if (!pkg.expires_at) return true;
                const ts = new Date(pkg.expires_at).getTime();
                return !Number.isNaN(ts) && ts > nowTs;
            });
            setActivePackages(visiblePackages);

            const { data: installmentsData } = await supabase
                .from('school_payment_installments')
                .select('id, installment_number, amount, due_date, payment_status, paid_at, contract:school_contracts!inner(id, student_id)')
                .eq('contract.student_id', studentRow.id)
                .order('due_date', { ascending: true });

            setInstallments((installmentsData || []).map((row: any) => ({
                id: row.id,
                installment_number: row.installment_number,
                amount: Number(row.amount || 0),
                due_date: row.due_date,
                payment_status: row.payment_status,
                paid_at: row.paid_at,
                contract_id: row.contract?.id,
            })));
        }
        setLoading(false);
    };

    const upcoming = sessions.filter(s => s.status === 'active' && isAfter(new Date(s.end_time), now));
    const past = sessions.filter(s => isBefore(new Date(s.start_time), now)).reverse().slice(0, 3);
    const nextSession = upcoming[0];
    const otherUpcoming = upcoming.slice(1, 4);

    const firstName = student?.full_name?.split(' ')[0] || t('studentDash.defaultStudent');
    const getGreeting = () => { const h = now.getHours(); if (h < 12) return t('studentDash.goodMorning'); if (h < 17) return t('studentDash.goodDay'); return t('studentDash.goodEvening'); };

    const formatCountdown = (dateStr: string) => {
        const d = new Date(dateStr);
        const diffH = Math.round((d.getTime() - now.getTime()) / 3600000);
        if (diffH < 1) return t('studentDash.rightNow');
        if (diffH < 24) return t('studentDash.inNHours', { n: diffH });
        return t('studentDash.inNDays', { n: Math.floor(diffH / 24) });
    };

    if (loading) return (
        <StudentLayout>
            <div className="flex h-[80vh] items-center justify-center">
                <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
        </StudentLayout>
    );

    return (
        <StudentLayout>
            <div className="px-4 pt-6 pb-8 max-w-lg mx-auto space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 font-medium text-sm mb-0.5">{getGreeting()},</p>
                        <h1 className="text-3xl font-black text-gray-900 leading-tight">{firstName} 👋</h1>
                    </div>
                    {student?.grade && (
                        <div className="bg-violet-100/80 text-violet-700 px-3 py-1.5 rounded-2xl text-xs font-black shadow-sm border border-violet-200/50">
                            {student.grade}
                        </div>
                    )}
                </div>

                {paymentBookingBlocked && !paymentBlockLoading && (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-bold text-amber-900">{t('studentDash.paymentRequired')}</p>
                            <p className="text-xs text-amber-800 mt-1">{t('studentDash.paymentRequiredDesc')}</p>
                        </div>
                        <Button
                            type="button"
                            className="rounded-2xl bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                            onClick={() => navigate('/student/sessions')}
                        >
                            {t('studentDash.pay')}
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => navigate('/student/schedule')} className="bg-white hover:bg-violet-50 hover:border-violet-200 transition-all rounded-3xl p-4 flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm aspect-square group">
                        <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <CalendarDays className="w-5 h-5 text-violet-600" />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{t('studentDash.book')}</span>
                    </button>
                    <button onClick={() => navigate('/student/sessions')} className="bg-white hover:bg-blue-50 hover:border-blue-200 transition-all rounded-3xl p-4 flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm aspect-square group">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <BookOpen className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{t('studentDash.totalLessons')}</span>
                    </button>
                    <button onClick={() => navigate('/student/settings')} className="bg-white hover:bg-gray-50 hover:border-gray-200 transition-all rounded-3xl p-4 flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm aspect-square group">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Settings className="w-5 h-5 text-gray-600" />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{t('studentDash.account')}</span>
                    </button>
                </div>

                {activePackages.length > 0 && (
                    <div className="bg-violet-50 border border-violet-200 rounded-3xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className="w-4 h-4 text-violet-700" />
                            <p className="text-sm font-bold text-violet-800">
                                {activePackages.length === 1 && activePackages[0].subjects?.name
                                    ? activePackages[0].subjects.name
                                    : t('studentDash.lessonPackages')}{' '}
                                {activePackages.length > 1 && `(${activePackages.length})`}
                            </p>
                        </div>
                        <p className="text-sm text-violet-700 mb-3">
                            <strong>
                                {t('studentDash.totalRemaining', { available: activePackages.reduce((sum, p) => sum + p.available_lessons, 0), total: activePackages.reduce((sum, p) => sum + p.total_lessons, 0) })}
                            </strong>
                        </p>
                        {activePackages.length === 1 && activePackages[0].expires_at && (
                            <p className="text-xs text-violet-700 mb-2">
                                {t('package.expiresAt', {
                                    date: format(new Date(activePackages[0].expires_at), "yyyy 'm.' MMMM d 'd.'", { locale: dateFnsLocale }),
                                })}
                            </p>
                        )}
                        {activePackages.length > 1 && (
                            <div className="space-y-2 mt-3 pt-3 border-t border-violet-200">
                                {activePackages.map((pkg, idx) => (
                                    <div key={pkg.id} className="flex items-center justify-between text-xs">
                                        <span className="text-violet-600">
                                            {pkg.subjects?.name || t('studentDash.packageN', { n: idx + 1 })}
                                            {pkg.expires_at
                                                ? ` · ${t('package.expiresAt', { date: format(new Date(pkg.expires_at), "yyyy 'm.' MMMM d 'd.'", { locale: dateFnsLocale }) })}`
                                                : ''}
                                        </span>
                                        <span className="font-semibold text-violet-800">
                                            {pkg.available_lessons}/{pkg.total_lessons} {t('studentDash.lessonsSuffix')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {installments.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-3xl p-4">
                        <button
                            type="button"
                            onClick={() => setPaymentsExpanded((v) => !v)}
                            className="w-full flex items-center justify-between"
                        >
                            <div className="text-left">
                                <p className="text-sm font-bold text-gray-900">Mokejimai</p>
                                <p className="text-xs text-gray-500">
                                    {installments.length > 1 ? `Dalimis (${installments.length})` : 'Vienas mokejimas'} ·
                                    {' '}Apmoketa {installments.filter((i) => i.payment_status === 'paid').length}/{installments.length}
                                </p>
                            </div>
                            {paymentsExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </button>

                        {paymentsExpanded && (
                            <div className="mt-3 space-y-2">
                                {installments.map((i) => (
                                    <div key={i.id} className="rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">Imoka #{i.installment_number} · €{i.amount.toFixed(2)}</p>
                                            <p className="text-xs text-gray-500">
                                                Terminas: {new Date(i.due_date).toLocaleDateString('lt-LT')}
                                                {i.paid_at ? ` · Apmoketa: ${new Date(i.paid_at).toLocaleDateString('lt-LT')}` : ''}
                                            </p>
                                        </div>
                                        <span className={cn(
                                            'text-xs px-2 py-1 rounded-full font-semibold',
                                            i.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                                                i.payment_status === 'overdue' ? 'bg-red-50 text-red-700' :
                                                    i.payment_status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                                        )}>
                                            {i.payment_status === 'paid' ? 'Apmoketa' :
                                                i.payment_status === 'overdue' ? 'Pradelsta' :
                                                    i.payment_status === 'failed' ? 'Nepavyko' : 'Laukia'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {nextSession ? (
                    <div>
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h2 className="text-lg font-black text-gray-900 tracking-tight">{t('studentDash.nextLesson')}</h2>
                            <span className="text-xs font-bold text-violet-600 bg-violet-100 px-2.5 py-1 rounded-full">{formatCountdown(nextSession.start_time)}</span>
                        </div>
                        <div onClick={() => { setSelectedSession(nextSession); setIsModalOpen(true); }} className="cursor-pointer">
                            <div className="relative overflow-hidden rounded-[2rem] p-6 shadow-xl shadow-violet-200/50 hover:shadow-2xl hover:shadow-violet-300/50 transition-shadow" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}>
                                <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
                                <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-indigo-900/20 blur-2xl" />

                                <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                                    <div>
                                        <h3 className="text-white text-3xl font-black leading-none mb-2">
                                            {format(new Date(nextSession.start_time), 'EEEE', { locale: dateFnsLocale })}
                                        </h3>
                                        <p className="text-violet-200 text-lg font-medium inline-flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> {format(new Date(nextSession.start_time), 'd MMMM · HH:mm', { locale: dateFnsLocale })}
                                        </p>
                                    </div>

                                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between border border-white/20">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                                <Zap className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-white font-bold">{nextSession.topic || t('common.lesson')}</p>
                                                    {nextSession.subjects?.is_group && (
                                                        <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                                            <Users className="w-3 h-3" />
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-violet-200 text-xs font-medium mb-1">{t('studentDash.duration')}</p>
                                                <div className="mt-1">
                                                    <StatusBadge
                                                        status={nextSession.status}
                                                        paymentStatus={nextSession.payment_status}
                                                        paid={nextSession.paid}
                                                        endTime={nextSession.end_time}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {nextSession.meeting_link && (
                                            <a href={normalizeUrl(nextSession.meeting_link) || undefined} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white text-violet-600 flex items-center justify-center hover:scale-105 transition-transform shadow-lg">
                                                <Play className="w-4 h-4 ml-0.5 fill-current" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div onClick={() => navigate('/student/schedule')} className="rounded-[2rem] p-8 bg-white border-2 border-dashed border-gray-200 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/50 transition-all flex flex-col items-center justify-center group">
                        <div className="w-16 h-16 rounded-full bg-gray-50 group-hover:bg-violet-100 flex items-center justify-center mb-4 transition-colors">
                            <CalendarDays className="w-7 h-7 text-gray-400 group-hover:text-violet-600 transition-colors" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1 tracking-tight">{t('studentDash.noLessons')}</h3>
                        <p className="text-gray-500 text-sm font-medium">{t('studentDash.tapToBook')}</p>
                    </div>
                )}

                {otherUpcoming.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="font-bold text-gray-800 text-base">{t('studentDash.otherReservations')}</h3>
                        </div>
                        <div className="grid gap-3">
                            {otherUpcoming.map(s => (
                                <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className="bg-white rounded-[1.5rem] p-4 flex items-center gap-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-gray-200 transition-all">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center flex-shrink-0 text-indigo-600">
                                        <span className="text-[10px] font-bold uppercase">{format(new Date(s.start_time), 'MMM', { locale: dateFnsLocale })}</span>
                                        <span className="text-lg font-black leading-none">{format(new Date(s.start_time), 'd')}</span>
                                    </div>
                                    <div className="flex-1 min-w-0 flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-gray-900 truncate">{s.topic || t('common.lesson')}</p>
                                                {s.subjects?.is_group && (
                                                    <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mt-0.5">
                                                <Clock className="w-3.5 h-3.5" /> {format(new Date(s.start_time), 'HH:mm')}
                                            </p>
                                        </div>
                                        <StatusBadge status={s.status} paymentStatus={s.payment_status} paid={s.paid} endTime={s.end_time} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm text-center">
                        <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-2"><BookOpen className="w-4 h-4 text-violet-600" /></div>
                        <p className="text-3xl font-black text-gray-900">{sessions.length}</p>
                        <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">{t('studentDash.totalLessons')}</p>
                    </div>
                    <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm text-center">
                        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-2"><Zap className="w-4 h-4 text-green-600" /></div>
                        <p className="text-3xl font-black text-gray-900">{sessions.filter(s => s.paid).length}</p>
                        <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">{t('studentDash.paidLessons')}</p>
                    </div>
                </div>

            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                            {t('studentDash.sessionInfo')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <p className="text-xl font-black text-gray-900 leading-tight">{selectedSession?.topic || t('common.lesson')}</p>
                                {selectedSession?.subjects?.is_group && (
                                    <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                        <Users className="w-3.5 h-3.5" />
                                        {t('studentDash.groupLesson')}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-gray-600 font-medium">
                                <Clock className="w-4 h-4" />
                                <span>
                                    {selectedSession?.start_time && format(new Date(selectedSession.start_time), 'EEEE, MMMM d', { locale: dateFnsLocale })}
                                    {' '}·{' '}
                                    {selectedSession?.start_time && format(new Date(selectedSession.start_time), 'HH:mm')}
                                    {' '}–{' '}
                                    {selectedSession?.end_time && format(new Date(selectedSession.end_time), 'HH:mm')}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">{t('studentDash.priceLabel')}</p>
                                <p className="font-bold text-gray-900">€{selectedSession?.price ?? '–'}</p>
                                {selectedSession?.status === 'active' && !selectedSession.paid && selectedSession.price != null && (
                                    <p className="text-[11px] text-gray-500 mt-1">{t('studentDash.cardTotal', { amount: formatCustomerChargeEur(selectedSession.price) })}</p>
                                )}
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100 flex flex-col items-center justify-center">
                                <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">{t('studentDash.statusLabel')}</p>
                                <StatusBadge status={selectedSession?.status || ''} paymentStatus={selectedSession?.payment_status} paid={selectedSession?.paid} endTime={selectedSession?.end_time} />
                            </div>
                        </div>

                        {selectedSession?.show_comment_to_student && selectedSession?.tutor_comment && (
                            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">{t('studentDash.tutorComment')}</p>
                                <div className="text-sm text-indigo-900 whitespace-pre-wrap">{selectedSession.tutor_comment}</div>
                            </div>
                        )}

                        {selectedSession?.meeting_link && selectedSession.status !== 'cancelled' && (
                            <a
                                href={normalizeUrl(selectedSession.meeting_link) || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition-colors border border-indigo-100 mt-2"
                            >
                                {t('studentDash.joinMeeting')}
                            </a>
                        )}

                        {selectedSession?.status === 'active' && !selectedSession.paid && paymentPayer !== 'parent' && isAfter(new Date(selectedSession.end_time), now) && (
                            <button
                                onClick={() => handleStripePayment(selectedSession)}
                                disabled={stripeLoading}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-60"
                            >
                                {stripeLoading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</>
                                    : <><CreditCard className="w-4 h-4" /> {t('studentDash.stripePayBtn', { amount: formatCustomerChargeEur(selectedSession.price) })}</>
                                }
                            </button>
                        )}

                        {student?.tutor && (
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">{t('studentDash.tutorLabel')}</p>
                                <p className="font-semibold text-gray-900 text-sm">{student.tutor.full_name}</p>
                                {student.tutor.email && student.tutor.email !== '—' && (
                                    <a href={`mailto:${student.tutor.email}`} className="text-xs text-indigo-600 hover:underline block">{student.tutor.email}</a>
                                )}
                                {student.tutor.phone && student.tutor.phone !== '—' && (
                                    <p className="text-xs text-gray-700 mt-1">{student.tutor.phone}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedSession?.id && (
                        <SessionFiles sessionId={selectedSession.id} role="student" />
                    )}

                    {selectedSession?.status === 'active' && isAfter(new Date(selectedSession.end_time), new Date()) && (
                        <DialogFooter className="mt-2 flex gap-2 sm:flex-row">
                            <Button
                                variant="outline"
                                onClick={() => { setIsModalOpen(false); navigate('/student/sessions', { state: { sessionId: selectedSession.id, flow: 'reschedule' } }); }}
                                className="flex-1 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                {t('studentDash.reschedule')}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => { setIsModalOpen(false); navigate('/student/sessions', { state: { sessionId: selectedSession.id, flow: 'cancel' } }); }}
                                className="flex-1 rounded-xl"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                {t('studentDash.cancelLesson')}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </StudentLayout>
    );
}
