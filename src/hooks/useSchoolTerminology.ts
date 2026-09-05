import { useEffect, useRef } from 'react';
import type { SchoolTerminology } from '@/lib/i18n/schoolTerminology';
import {
  registerSchoolTerminologyOwner,
  unregisterSchoolTerminologyOwner,
} from '@/lib/i18n/terminologyStore';

/**
 * Switch the UI wording for the lifetime of the calling layout:
 * `staff` → "mokytojas", `activity` → "užsiėmimas". Pass `null` while the org
 * is still unknown. Owners are reference-counted, so a nested layout closing
 * never turns the wording off under the outer one.
 */
export function useSchoolTerminology(mode: SchoolTerminology | null): void {
  const owner = useRef<symbol | null>(null);
  if (owner.current === null) owner.current = Symbol('school-terminology');
  const staff = Boolean(mode?.staff);
  const activity = Boolean(mode?.activity);

  useEffect(() => {
    const key = owner.current!;
    if (!mode) {
      unregisterSchoolTerminologyOwner(key);
      return;
    }
    registerSchoolTerminologyOwner(key, { staff, activity });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(mode), staff, activity]);

  useEffect(() => {
    const key = owner.current!;
    return () => unregisterSchoolTerminologyOwner(key);
  }, []);
}
