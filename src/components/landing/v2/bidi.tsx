import type { CSSProperties, ReactNode } from 'react';

/**
 * Prices, hours, times and ranges in the product mocks are written the same
 * way in every language, so they must read left-to-right even on the Hebrew
 * and Arabic pages. Without an isolate the Unicode bidi algorithm reorders
 * "18 h" into "h 18" and "€2 140" into "140 €2".
 */

/** Left-to-right isolate / pop directional isolate, for tokens inside template strings. */
export const LRI = '\u2066';
export const PDI = '\u2069';

export const ltr = (text: string): string => `${LRI}${text}${PDI}`;

export function Ltr({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <span dir="ltr" className={className} style={style}>
      {children}
    </span>
  );
}
