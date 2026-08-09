import { beforeAll, describe, expect, it } from 'vitest';
import { loadLocaleDict, t } from '../../src/lib/i18n/core';
import { lt } from '../../src/lib/i18n/lt';

beforeAll(async () => {
  await loadLocaleDict('lt');
});

describe('Lithuanian locale quality regressions', () => {
  it.each([
    ['cal.cancelledCount', { count: 3 }],
    ['finance.deadlineWarning', { hours: 24 }],
    ['invoice.emailNote', { days: 14 }],
    ['orgFinance.completedLessons', { range: '2026-08-01–2026-08-31' }],
    ['register.orgInvite', { orgName: 'Mokykla' }],
    ['stuSched.queueClosedDesc', { deadline: '2026-08-10 18:00' }],
  ])('%s resolves every runtime placeholder', (key, params) => {
    expect(t('lt', key, params)).not.toMatch(/\{[^}]+\}/);
  });

  it('does not expose corrupted source-code fragments in UI copy', () => {
    const uiCopy = Object.entries(lt)
      .filter(([key]) => !['tos.bodyHtml', 'priv.bodyHtml', 'dpa.bodyHtml'].includes(key))
      .map(([, value]) => value)
      .join('\n');

    expect(uiCopy).not.toMatch(/\{format\(|nenušausime|Vienišieji|subscription_only/);
    expect(uiCopy).not.toMatch(/\b(?:trial|billing|overall|payer|availability|scroll)\b/i);
  });

  it('does not use visible parenthetical gender or plural suffix hacks', () => {
    const uiCopy = Object.entries(lt)
      .filter(([key]) => !['tos.bodyHtml', 'priv.bodyHtml', 'dpa.bodyHtml'].includes(key))
      .map(([, value]) => value)
      .join('\n');

    expect(uiCopy).not.toMatch(/\(-(?:a|e|i|os|ys|iai|ius|ę|ei|ių)\)|pam\(os\)/i);
  });

  it('uses Lithuanian number, currency, and percentage order in UI copy', () => {
    const uiCopy = Object.entries(lt)
      .filter(([key]) => !['tos.bodyHtml', 'priv.bodyHtml', 'dpa.bodyHtml'].includes(key))
      .map(([, value]) => value)
      .join('\n');

    expect(uiCopy).not.toMatch(/€(?:\d|\{)/);
    expect(uiCopy).not.toMatch(/(?:\d|\})%/);
  });

  it('keeps critical LT action labels semantically correct', () => {
    expect(lt['auth.saveNewPassword']).toBe('Išsaugoti naują slaptažodį');
    expect(lt['settings.monthlyPlan']).toBe('Mėnesinis');
    expect(lt['companyWait.notesPlaceholder']).toBe('Įrašykite pastabas…');
    expect(lt['status.completed']).toBe('Įvykusi');
  });
});
