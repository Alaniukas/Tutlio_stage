import type { ComponentType } from 'react';

/**
 * Icon tile for feature cards across the marketing site. Deliberately
 * monochrome - no coloured backgrounds. `neutral` (the default) is an
 * off-white tile with a hairline border and a dark, thin-stroke glyph: the
 * quiet, engineered look of premium SaaS sites. `dark` is a single zinc-900
 * tile with a white glyph, reserved for the four product pillars so they
 * read as the core of the product without introducing colour.
 */
export type FeatureIconVariant = 'neutral' | 'dark';

export const FEATURE_ICON_VARIANTS: Record<FeatureIconVariant, string> = {
  neutral:
    'border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 text-zinc-900 shadow-[0_1px_2px_rgba(24,24,27,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
  dark: 'bg-zinc-900 text-white ring-1 ring-inset ring-white/10 shadow-[0_10px_20px_-10px_rgba(24,24,27,0.6)]',
};

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-[10px]', glyph: 'h-4 w-4' },
  md: { box: 'h-10 w-10 rounded-xl', glyph: 'h-[18px] w-[18px]' },
  lg: { box: 'h-12 w-12 rounded-2xl', glyph: 'h-[22px] w-[22px]' },
} as const;

export interface FeatureIconProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  variant?: FeatureIconVariant;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function FeatureIcon({ icon: Icon, variant = 'neutral', size = 'md', className = '' }: FeatureIconProps) {
  const { box, glyph } = SIZES[size];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center ${box} ${FEATURE_ICON_VARIANTS[variant]} ${className}`}
    >
      <Icon className={glyph} strokeWidth={variant === 'dark' ? 2 : 1.75} />
    </span>
  );
}
