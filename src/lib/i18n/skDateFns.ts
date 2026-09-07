import type { Locale } from 'date-fns';
import { sk } from 'date-fns/locale';

/** date-fns 4.1.0 mistakenly requires a trailing `]` in the wide Slovak
 * Saturday matcher (`sobota]`). Keep upstream formatting and all other matches.
 */
export const skDateFns: Locale = {
  ...sk,
  match: {
    ...sk.match,
    day: (text, options) => {
      if (!options?.width || options.width === 'wide') {
        const saturday = /^sobota\b/i.exec(text);
        if (saturday) {
          // Delegate the weekday value and optional callback to the working
          // abbreviation matcher; only the consumed spelling changes.
          return sk.match.day(`so${text.slice(saturday[0].length)}`, { ...options, width: 'abbreviated' });
        }
      }
      return sk.match.day(text, options);
    },
  },
};
