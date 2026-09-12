import type { CSSProperties, ReactNode } from 'react';

/**
 * iPad-style shell for the interactive hero demo: a thin aluminium chassis,
 * a uniform black glass bezel, a centred front camera and the power and
 * volume buttons. Fills its parent, which sets the aspect ratio (the hero
 * uses 5:6, close to an iPad's 3:4). Buttons sit just outside the chassis.
 */
const CHASSIS_EDGE = 'clamp(2px, 0.28vw, 3px)';
const BEZEL = 'clamp(4px, 0.6vw, 6px)';
const BUTTON_DEPTH = 'clamp(2px, 0.3vw, 3px)';
const ALUMINIUM =
  'linear-gradient(145deg, #a2a3a8 0%, #6d6e73 16%, #45464b 38%, #6a6b70 58%, #35363a 80%, #8c8d92 100%)';
const BUTTON_METAL = 'linear-gradient(90deg, #4c4d52 0%, #9a9ba0 48%, #4c4d52 100%)';
const BUTTON_METAL_VERTICAL = 'linear-gradient(180deg, #4c4d52 0%, #9a9ba0 48%, #4c4d52 100%)';

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
        ...style,
      }}
    >
      {/* Power button on the top edge. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: `calc(-1 * ${BUTTON_DEPTH})`,
          right: '12%',
          width: '9%',
          height: BUTTON_DEPTH,
          borderRadius: '3px 3px 0 0',
          background: BUTTON_METAL,
          boxShadow: '0 -1px 1px rgba(0,0,0,0.25)',
        }}
      />
      {/* Volume rocker on the right edge. */}
      {['10%', '17%'].map((top) => (
        <span
          key={top}
          aria-hidden
          style={{
            position: 'absolute',
            top,
            right: `calc(-1 * ${BUTTON_DEPTH})`,
            width: BUTTON_DEPTH,
            height: '5.5%',
            borderRadius: '0 3px 3px 0',
            background: BUTTON_METAL_VERTICAL,
            boxShadow: '1px 0 1px rgba(0,0,0,0.25)',
          }}
        />
      ))}

      {/* Aluminium chassis. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: CHASSIS_EDGE,
          borderRadius: 'clamp(26px, 4.6vw, 40px)',
          background: ALUMINIUM,
          boxShadow:
            '0 44px 80px -36px rgba(15,15,20,0.55), 0 20px 36px -20px rgba(15,15,20,0.35), 0 0 0 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.45)',
        }}
      >
        {/* Black glass bezel. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            padding: BEZEL,
            borderRadius: 'clamp(24px, 4.3vw, 37px)',
            background: 'linear-gradient(160deg, #141416 0%, #060607 55%, #0f0f11 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 0 12px rgba(0,0,0,0.9)',
          }}
        >
          {/* Front camera, centred in the top bezel. */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: `calc(${BEZEL} / 2)`,
              left: '50%',
              zIndex: 30,
              width: 'clamp(3px, 0.45vw, 4.5px)',
              height: 'clamp(3px, 0.45vw, 4.5px)',
              transform: 'translate(-50%, -50%)',
              borderRadius: '999px',
              background: 'radial-gradient(circle at 35% 35%, #4a5160 0%, #14171c 45%, #000 100%)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 0 3px rgba(80,120,200,0.25)',
            }}
          />

          {/* Screen. */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              borderRadius: 'clamp(20px, 3.6vw, 31px)',
              background: '#fff',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
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
                  'linear-gradient(118deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 28%, transparent 48%)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
