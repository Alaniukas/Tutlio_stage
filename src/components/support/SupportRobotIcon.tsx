import { cn } from '@/lib/utils';

export default function SupportRobotIcon({ className }: { className?: string }) {
  return (
    <img
      src="/tutlio-agent-mascot.png"
      alt="Tutlio support mascot"
      draggable={false}
      className={cn('h-10 w-10 select-none object-contain', className)}
    />
  );
}
