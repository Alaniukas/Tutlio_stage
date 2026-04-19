import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useEffect, useMemo, useState } from 'react';
import { preloadStudentData } from '@/lib/preload';
import { LayoutDashboard, BookOpen, CalendarDays, Clock, Settings, Info, Mail, GraduationCap, HelpCircle, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import OrgSuspendedBanner from '@/components/OrgSuspendedBanner';
import { useTranslation } from '@/lib/i18n';
import { useTotalChatUnread } from '@/hooks/useChat';
import { parseOrgContactVisibility, maskTutorContact } from '@/lib/orgContactVisibility';

interface StudentLayoutProps {
    children: React.ReactNode;
}

export default function StudentLayout({ children }: StudentLayoutProps) {
    const { t } = useTranslation();
    const chatUnreadTotal = useTotalChatUnread();
    const location = useLocation();
    const navigate = useNavigate();
    const [studentName, setStudentName] = useState('');
    const [tutor, setTutor] = useState<any>(null);
    const [isTutorModalOpen, setIsTutorModalOpen] = useState(false);
    const [packageCountText, setPackageCountText] = useState(t('studentLayout.lessonCount', { remaining: 0, total: 0 }));
    const [studentProfiles, setStudentProfiles] = useState<Array<{ id: string; tutor_id: string | null; tutor_full_name: string | null; tutor_email: string | null }>>([]);
    const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';
    const activeStudentProfileId = useMemo(
        () => (typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY) : null),
        []
    );

    const navItems = [
        { href: '/student', label: t('studentNav.home'), icon: LayoutDashboard },
        { href: '/student/sessions', label: t('studentNav.sessions'), icon: BookOpen },
        { href: '/student/schedule', label: t('studentNav.book'), icon: CalendarDays },
        { href: '/student/messages', label: t('studentNav.messages'), icon: MessageSquare },
        { href: '/student/waitlist', label: t('studentNav.queue'), icon: Clock, highlight: true },
        { href: '/student/settings', label: t('studentNav.settings'), icon: Settings },
    ];

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: studentRows, error: rpcError } = await supabase.rpc('get_student_profiles', {
                    p_user_id: user.id,
                    p_student_id: null,
                });

                if (rpcError) {
                    console.error('[StudentLayout] Error fetching student info:', rpcError);
                    return;
                }

                const rows = studentRows || [];
                setStudentProfiles(rows.map((row: any) => ({
                    id: row.id,
                    tutor_id: row.tutor_id,
                    tutor_full_name: row.tutor_full_name,
                    tutor_email: row.tutor_email,
                })));
                const selectedStudentData =
                    rows.find((row: any) => row.id === activeStudentProfileId) ||
                    rows[0];

                if (selectedStudentData && typeof window !== 'undefined' && !activeStudentProfileId) {
                    localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, selectedStudentData.id);
                }

                if (selectedStudentData) {
                    setStudentName(selectedStudentData.full_name || '');

                    if (selectedStudentData.tutor_id) {
                        const { data: vis } = await supabase.rpc(
                            'get_tutor_contact_visibility_for_student',
                            { p_tutor_id: selectedStudentData.tutor_id }
                        );
                        const cv = parseOrgContactVisibility((vis as Record<string, unknown>) || null);
                        setTutor({
                            id: selectedStudentData.tutor_id,
                            full_name: selectedStudentData.tutor_full_name,
                            email: maskTutorContact(selectedStudentData.tutor_email, cv.studentSeesTutorEmail),
                        });
                    } else {
                        setTutor(null);
                    }

                    try {
                        const { data: packages, error: packagesError } = await supabase
                            .from('lesson_packages')
                            .select('total_lessons, available_lessons, subjects(name)')
                            .eq('student_id', selectedStudentData.id)
                            .eq('paid', true)
                            .gt('available_lessons', 0);

                        if (packagesError) {
                            console.error('[StudentLayout] Error fetching packages:', packagesError);
                        } else {
                            const remaining = (packages || []).reduce((sum: number, p: any) => sum + (p.available_lessons || 0), 0);
                            const total = (packages || []).reduce((sum: number, p: any) => sum + (p.total_lessons || 0), 0);
                            const subjectName = packages?.length === 1 ? (packages[0] as any)?.subjects?.name : null;
                            const label = subjectName
                                ? `${subjectName}: ${remaining}/${total}`
                                : t('studentLayout.lessonCount', { remaining, total });
                            setPackageCountText(label);
                        }
                    } catch (pkgErr) {
                        console.error('[StudentLayout] Error loading packages:', pkgErr);
                    }
                }
            } catch (err) {
                console.error('[StudentLayout] Error in load:', err);
            }
        };
        load();
        preloadStudentData();
    }, []);

    const handleProfileSwitch = (studentProfileId: string) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, studentProfileId);
            window.dispatchEvent(new Event('student-profile-changed'));
            window.location.reload();
        }
    };

    const initials = studentName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="min-h-screen bg-[#fffefc] flex flex-col relative overflow-x-hidden">
            <OrgSuspendedBanner />
            <div className="absolute top-0 right-0 w-96 h-96 bg-orange-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-rose-100/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <header className="bg-white/80 backdrop-blur-md border-b border-orange-100 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-4">
                    <Link to="/" className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
                            <GraduationCap className="w-4.5 h-4.5 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-base tracking-tight hidden sm:block">Tutlio</span>
                    </Link>

                    <div className="cursor-pointer hover:bg-orange-50/50 p-1.5 rounded-xl transition-colors shrink-0">
                        <div className="flex items-center gap-2">
                            <div onClick={() => setIsTutorModalOpen(true)}>
                                <p className="text-xs text-orange-400 font-medium tracking-wide uppercase">{t('studentLayout.tutor')}</p>
                                <p className="text-sm font-bold text-gray-900">{tutor?.full_name || '—'}</p>
                            </div>
                            <Info className="w-4 h-4 text-orange-300" onClick={() => setIsTutorModalOpen(true)} />
                            {studentProfiles.length > 1 && (
                                <select
                                    value={activeStudentProfileId || studentProfiles[0]?.id || ''}
                                    onChange={(e) => handleProfileSwitch(e.target.value)}
                                    className="text-xs border border-orange-200 rounded-md px-2 py-1 bg-white text-gray-700"
                                >
                                    {studentProfiles.map((sp) => (
                                        <option key={sp.id} value={sp.id}>
                                            {sp.tutor_full_name || t('common.tutor')}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="hidden sm:inline-flex text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                        {packageCountText}
                    </span>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white">
                        {initials || '?'}
                    </div>
                </div>
            </header>

            <Dialog open={isTutorModalOpen} onOpenChange={setIsTutorModalOpen}>
                <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('studentLayout.tutorInfo')}</DialogTitle>
                        <DialogDescription>
                            {t('studentLayout.tutorInfoDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                                {tutor?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{tutor?.full_name}</h3>
                                <p className="text-sm text-gray-500">{t('common.tutor')}</p>
                            </div>
                        </div>
                        {tutor?.email && tutor.email !== '—' && (
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <Mail className="w-5 h-5 text-gray-400" />
                                <div>
                                    <p className="text-xs text-gray-500 font-medium">{t('common.email')}</p>
                                    <a href={`mailto:${tutor.email}`} className="text-sm font-medium text-indigo-600 hover:underline">
                                        {tutor.email}
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <main className="flex-1 pb-24 relative z-10">
                {children}
            </main>

            <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-50" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
                <div className="flex items-center justify-around px-2 py-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = location.pathname === item.href;
                        const highlight = 'highlight' in item && item.highlight;
                        const showChatBadge = item.href === '/student/messages' && chatUnreadTotal > 0;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={`relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all ${active ? 'text-violet-700' : highlight ? 'text-amber-600' : 'text-gray-400 hover:text-gray-700'
                                    }`}
                            >
                                <div className={`relative p-1.5 rounded-xl transition-all ${active ? 'bg-violet-100' : highlight ? 'bg-amber-50' : ''}`}>
                                    <Icon className="w-5 h-5" />
                                    {showChatBadge && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center border-2 border-white">
                                            {chatUnreadTotal > 9 ? '9+' : chatUnreadTotal}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[10px] font-medium leading-none ${active ? 'text-violet-700' : highlight ? 'text-amber-600' : ''}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
