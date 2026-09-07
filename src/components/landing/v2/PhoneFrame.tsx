import type { CSSProperties, ReactNode } from 'react';

/**
 * Photorealistic iPhone shell: brushed-metal band, machined side buttons,
 * black glass, Dynamic Island and a diagonal screen reflection.
 *
 * Every dimension in the original design is a whole multiple of one base unit
 * (frame width / 152.5), so the whole thing scales from a single CSS length —
 * pass `width` as any CSS value, including a clamp(), and the internals follow.
 */

/** Frame width and height expressed in base units. */
const UNITS_W = 152.5;
const UNITS_H = 292.5;

/** `n` base units as a CSS length. */
function u(n: number): string {
  return `calc(var(--u) * ${n})`;
}

/** Machined button on the metal band. `side` picks which edge it sits on. */
function SideButton({ top, height, side }: { top: number; height: number; side: 'left' | 'right' }) {
  const isLeft = side === 'left';
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: u(top),
        height: u(height),
        width: u(2),
        [isLeft ? 'left' : 'right']: `calc(var(--u) * -2)`,
        background: isLeft
          ? 'linear-gradient(to right, #6a6a6a, #4a4a4a)'
          : 'linear-gradient(to left, #6a6a6a, #4a4a4a)',
        borderRadius: isLeft ? `${u(1)} 0 0 ${u(1)}` : `0 ${u(1)} ${u(1)} 0`,
        boxShadow: `inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.5), ${isLeft ? '-1px' : '1px'} 0 2px rgba(0,0,0,0.3)`,
      }}
    />
  );
}

export default function PhoneFrame({
  children,
  width = 'clamp(215px, 23vw, 265px)',
  className,
  style,
}: {
  children: ReactNode;
  width?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        // Base unit — everything below is a multiple of it.
        ['--u' as string]: `calc(${width} / ${UNITS_W})`,
        width,
        height: u(UNITS_H),
        maxWidth: '100%',
        position: 'relative',
        zIndex: 10,
        padding: u(1),
        borderRadius: u(29),
        background:
          'linear-gradient(135deg, #5a5a5a 0%, #7a7a7a 15%, #4a4a4a 35%, #333 50%, #4a4a4a 65%, #8a8a8a 85%, #6a6a6a 100%)',
        boxShadow:
          '0 0 0 1px rgba(0,0,0,0.16), 0 12px 28px -16px rgba(0,0,0,0.45), 0 22px 44px -26px rgba(0,0,0,0.3), inset 0 0 6px 1px rgba(0,0,0,0.45), inset 1px 1px 3px rgba(255,255,255,0.25), inset -1px -1px 3px rgba(0,0,0,0.35)',
        ...style,
      }}
    >
      {/* Silent switch, volume up, volume down, then power on the right. */}
      <SideButton side="left" top={51} height={12} />
      <SideButton side="left" top={73.5} height={22.5} />
      <SideButton side="left" top={103.5} height={22.5} />
      <SideButton side="right" top={81} height={35} />

      {/* Black glass under the band. */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000',
          borderRadius: u(28),
          padding: u(2.5),
          boxSizing: 'border-box',
          position: 'relative',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
        }}
      >
        {/* Display. Top padding clears the Dynamic Island. */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: u(25.5),
            background: '#f4f6fb',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            padding: `${u(24)} ${u(4)} ${u(4)}`,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: u(4),
              left: '50%',
              transform: 'translateX(-50%)',
              width: u(45),
              height: u(13),
              borderRadius: u(10),
              background: '#000',
              zIndex: 50,
            }}
          />
          {/* Diagonal glass reflection over the whole display. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(125deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.02) 100%)',
              pointerEvents: 'none',
              zIndex: 60,
              borderRadius: u(22),
              mixBlendMode: 'overlay',
            }}
          />
          {children}
        </div>
      </div>
    </div>
  );
}

/** Base unit helper, re-exported so screen content can share the same scale. */
export { u as phoneUnit };
