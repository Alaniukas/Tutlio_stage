import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning';

interface ToastProps {
    message: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
}

const ICONS = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
};

const STYLES = {
    success: 'bg-green-600 text-white shadow-lg shadow-green-200/50',
    error: 'bg-red-600 text-white shadow-lg shadow-red-200/50',
    warning: 'bg-amber-500 text-white shadow-lg shadow-amber-200/50',
};

export default function Toast({ message, type = 'success', duration = 4000, onClose }: ToastProps) {
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const Icon = ICONS[type];

    useEffect(() => {
        // Slide in
        requestAnimationFrame(() => setVisible(true));

        const timer = setTimeout(() => {
            setLeaving(true);
            setTimeout(onClose, 400);
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <div
            className={cn(
                'fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all duration-400 w-[calc(100vw-2rem)] sm:min-w-[320px] max-w-[500px]',
                STYLES[type],
                visible && !leaving ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4',
            )}
        >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium flex-1">{message}</span>
            <button
                onClick={() => {
                    setLeaving(true);
                    setTimeout(onClose, 400);
                }}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
