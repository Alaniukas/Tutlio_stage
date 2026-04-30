import { useEffect, useState } from 'react';
import StudentLayout from '@/components/StudentLayout';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { format } from 'date-fns';
import { Clock, X, Info, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

interface ParsedNotes {
    start_time?: string;
    end_time?: string;
    topic?: string | null;
    price?: number | null;
    subject_id?: string;
    queue_position?: number;
}

interface WaitlistEntry {
    id: string;
    created_at: string;
    notes: string | null;
    preferred_day: string | null;
    session?: { start_time: string; end_time: string; topic: string | null; price: number | null } | null;
}

function parseNotes(notes: string | null): ParsedNotes | null {
    if (!notes) return null;
    try { return JSON.parse(notes); } catch { return null; }
}

export default function StudentWaitlist() {
    const { t, dateFnsLocale } = useTranslation();
    const swc = getCached<any>('student_waitlist');
    const [entries, setEntries] = useState<WaitlistEntry[]>(swc?.entries ?? []);
    const [loading, setLoading] = useState(!swc);
    const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
    const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';

    const WAITLIST_TIP_KEY = 'tutlio_student_waitlist_tip_seen';
    const [waitlistTipExpanded, setWaitlistTipExpanded] = useState(() => {
        if (typeof window === 'undefined') return true;
        return !localStorage.getItem(WAITLIST_TIP_KEY);
    });
    const setWaitlistTipSeen = () => {
        if (typeof window !== 'undefined') localStorage.setItem(WAITLIST_TIP_KEY, '1');
    };

    useEffect(() => { if (!getCached('student_waitlist')) fetchData(); }, []);

    const fetchData = async () => {
        if (!getCached('student_waitlist')) setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const selectedStudentId = typeof window !== 'undefined'
            ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY)
            : null;
        let { data: studentRows, error: rpcError } = await supabase.rpc('get_student_profiles', {
            p_user_id: user.id,
            p_student_id: selectedStudentId || null,
        });
        if (rpcError) { console.error('[StudentWaitlist] get_student_profiles', rpcError); setLoading(false); return; }
        let st = studentRows?.[0];
        if (!st && selectedStudentId) {
            const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_student_profiles', {
                p_user_id: user.id,
                p_student_id: null,
            });
            if (fallbackError) { console.error('[StudentWaitlist] get_student_profiles fallback', fallbackError); setLoading(false); return; }
            st = fallbackRows?.[0];
            if (st && typeof window !== 'undefined') {
                localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, st.id);
            }
        }
        if (!st) { setLoading(false); return; }

        const { data } = await supabase
            .from('waitlists')
            .select('*, session:sessions(start_time, end_time, topic, price)')
            .eq('student_id', st.id)
            .order('created_at', { ascending: false });
        setEntries(data || []);
        setCache('student_waitlist', { entries: data || [] });
        setLoading(false);
    };

    const handleRemove = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        await supabase.from('waitlists').delete().eq('id', id);
        fetchData();
    };

    return (
        <StudentLayout>
            <div className="px-4 pt-6 pb-6">
                <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 overflow-hidden text-white shadow-lg mb-6">
                    <button
                        type="button"
                        onClick={() => {
                            setWaitlistTipExpanded((e) => {
                                if (e) setWaitlistTipSeen();
                                return !e;
                            });
                        }}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/10 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 flex-shrink-0" />
                            <h2 className="text-base font-bold">{t('studentWait.whatIsWaitlist')}</h2>
                        </div>
                        {waitlistTipExpanded ? <ChevronUp className="w-5 h-5 flex-shrink-0 text-amber-100" /> : <ChevronDown className="w-5 h-5 flex-shrink-0 text-amber-100" />}
                    </button>
                    {waitlistTipExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-white/20">
                            <p className="text-sm text-amber-50 leading-relaxed">{t('studentWait.waitlistExplain')}</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl font-black text-gray-900">{t('studentWait.title')}</h1>
                    <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button className="text-gray-400 hover:text-indigo-600 transition-colors"><Info className="w-5 h-5" /></button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="z-[200] max-w-xs bg-indigo-900 text-white border-none shadow-xl rounded-xl p-4">
                                <p className="text-sm">{t('studentWait.tooltip')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <p className="text-gray-400 text-sm mb-5">{t('studentWait.subtitle')}</p>

                {loading ? (
                    <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-white rounded-3xl animate-pulse" />)}</div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-16">
                        <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-semibold">{t('studentWait.empty')}</p>
                        <p className="text-gray-400 text-sm mt-1">{t('studentWait.emptyHint')}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {entries.map((e) => {
                            const parsed = parseNotes(e.notes);
                            const displaySession = e.session || (parsed?.start_time ? {
                                start_time: parsed.start_time,
                                end_time: parsed.end_time || '',
                                topic: parsed.topic || null,
                                price: parsed.price || null,
                            } : null);
                            const queuePos = parsed?.queue_position;

                            return (
                                <div
                                    key={e.id}
                                    onClick={() => setSelectedEntry(e)}
                                    className="bg-white rounded-3xl p-4 shadow-sm flex items-center gap-4 transition-all cursor-pointer hover:shadow-md hover:border-indigo-100 border border-transparent"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0 relative">
                                        <Clock className="w-6 h-6 text-amber-500" />
                                        {queuePos && (
                                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-white text-xs font-black rounded-full flex items-center justify-center">
                                                {queuePos}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {displaySession ? (
                                            <>
                                                <p className="font-bold text-gray-900 truncate">{displaySession.topic || t('common.lesson')}</p>
                                                <p className="text-xs text-gray-400">
                                                    {format(new Date(displaySession.start_time), 'EEEE, MMMM d', { locale: dateFnsLocale })} · {format(new Date(displaySession.start_time), 'HH:mm')}
                                                    {displaySession.end_time && ` – ${format(new Date(displaySession.end_time), 'HH:mm')}`}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-bold text-gray-900">{t('studentWait.anyFreeLesson')}</p>
                                                <p className="text-xs text-gray-400">
                                                    {t('studentWait.addedOn', { date: format(new Date(e.created_at), 'd MMM', { locale: dateFnsLocale }) })}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <button onClick={(ev) => handleRemove(ev, e.id)} className="p-2 rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
                <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-amber-600" />
                            {t('studentWait.waitlistInfo')}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedEntry && (() => {
                        const parsed = parseNotes(selectedEntry.notes);
                        const ds = selectedEntry.session || (parsed?.start_time ? {
                            start_time: parsed.start_time,
                            end_time: parsed.end_time || '',
                            topic: parsed.topic || null,
                            price: parsed.price || null,
                        } : null);
                        const queuePos = parsed?.queue_position;

                        return (
                            <div className="space-y-4 py-3">
                                {ds ? (
                                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                        <h3 className="font-bold text-gray-900 text-lg mb-2">{ds.topic || t('common.lesson')}</h3>
                                        <div className="space-y-2 text-sm text-gray-600">
                                            <div className="flex justify-between">
                                                <span>{t('studentWait.dateLabel')}</span>
                                                <span className="font-medium text-gray-900">{format(new Date(ds.start_time), 'EEEE, MMMM d', { locale: dateFnsLocale })}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>{t('studentWait.timeLabel')}</span>
                                                <span className="font-medium text-gray-900">
                                                    {format(new Date(ds.start_time), 'HH:mm')}
                                                    {ds.end_time && ` – ${format(new Date(ds.end_time), 'HH:mm')}`}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>{t('studentWait.priceLabel')}</span>
                                                <span className="font-medium text-gray-900">€{ds.price || '–'}</span>
                                            </div>
                                            {queuePos && (
                                                <div className="flex justify-between">
                                                    <span>{t('studentWait.queuePosition')}</span>
                                                    <span className="font-bold text-amber-600">#{queuePos}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">{t('studentWait.noInfo')}</p>
                                )}
                                <p className="text-xs text-gray-500 text-center">{t('studentWait.autoAssign')}</p>
                                <Button
                                    variant="destructive"
                                    className="w-full rounded-xl"
                                    onClick={async () => {
                                        await supabase.from('waitlists').delete().eq('id', selectedEntry.id);
                                        setSelectedEntry(null);
                                        fetchData();
                                    }}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    {t('studentWait.leaveQueue')}
                                </Button>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </StudentLayout>
    );
}
