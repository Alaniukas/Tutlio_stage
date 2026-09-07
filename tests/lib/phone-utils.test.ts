import { describe, expect, it } from 'vitest';
import {
  formatInternationalPhone,
  formatLocalizedPhone,
  getLocalizedPhonePlaceholder,
  validateInternationalPhone,
  validateLocalizedPhone,
} from '../../src/lib/utils';

describe('localized phone helpers', () => {
  it('accepts Mexican numbers without restricting Mexican Spanish to one country', () => {
    expect(formatLocalizedPhone('+52 55 1234 5678', 'es-mx')).toBe('+525512345678');
    expect(validateLocalizedPhone('+52 55 1234 5678', 'es-mx')).toBe(true);
    expect(validateLocalizedPhone('+34600123456', 'es-mx')).toBe(true);
    expect(validateLocalizedPhone('5512345678', 'es-mx')).toBe(false);
    expect(getLocalizedPhonePlaceholder('es-mx')).toBe('+52 55 1234 5678');
  });

  it('accepts Spanish numbers with an international prefix', () => {
    expect(formatInternationalPhone('+34 600 123 456')).toBe('+34600123456');
    expect(validateInternationalPhone('+34 600 123 456')).toBe(true);
    expect(validateLocalizedPhone('+34600123456', 'es')).toBe(true);
    expect(getLocalizedPhonePlaceholder('es')).toBe('+34 600 000 000');
  });

  it('rejects numbers without an international prefix outside Lithuania', () => {
    expect(validateInternationalPhone('600123456')).toBe(false);
    expect(validateLocalizedPhone('600123456', 'es')).toBe(false);
  });

  it('preserves the existing Lithuanian formatting and validation', () => {
    expect(formatLocalizedPhone('861234567', 'lt')).toBe('+370 61234567');
    expect(validateLocalizedPhone('+370 61234567', 'lt')).toBe(true);
    expect(validateLocalizedPhone('+34600123456', 'lt')).toBe(false);
  });
});
