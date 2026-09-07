import { cn } from '@/lib/utils';

export default function SupportRobotIcon({ className }: { className?: string }) {
  return (
    <img
      src="/support-ai-icon.png"
      alt="Tutlio AI support"
      draggable={false}
      className={cn('h-10 w-10 select-none object-contain', className)}
    />
  );
}
