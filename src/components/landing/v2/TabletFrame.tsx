import type { CSSProperties, ReactNode } from 'react';

/** A scalable tablet shell for the interactive hero demo. */
export default function TabletFrame({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: 'clamp(8px, 1.2vw, 12px)',
        borderRadius: 'clamp(28px, 5vw, 42px)',
        background:
          'linear-gradient(145deg, #313131 0%, #101010 42%, #232323 72%, #090909 100%)',
        boxShadow:
          '0 0 0 1px rgba(0,0,0,0.22), 0 28px 55px -30px rgba(0,0,0,0.52), inset 1px 1px 2px rgba(255,255,255,0.18), inset -1px -1px 2px rgba(0,0,0,0.7)',
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 'clamp(3px, 0.55vw, 6px)',
          left: '50%',
          zIndex: 30,
          width: 'clamp(3px, 0.45vw, 5px)',
          height: 'clamp(3px, 0.45vw, 5px)',
          transform: 'translateX(-50%)',
          borderRadius: '999px',
          background: '#050505',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          borderRadius: 'clamp(21px, 4vw, 32px)',
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {children}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            pointerEvents: 'none',
            background:
              'linear-gradient(125deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.035) 30%, transparent 52%)',
          }}
        />
      </div>
    </div>
  );
}
