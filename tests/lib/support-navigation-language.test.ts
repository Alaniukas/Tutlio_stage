import { describe, expect, it } from 'vitest';
import {
  buildStudentContactsNavigationReply,
  buildSupportMenuLabels,
  humanizeSupportNavigationReply,
  isStudentContactsNavigationQuestion,
  resolveSupportNavLocale,
  SUPPORT_NAVIGATION_AGENT_RULES,
} from '@/lib/supportNavigationLanguage';

describe('support navigation language', () => {
  it('prefers Lithuanian, English, or Polish menu labels', () => {
    expect(resolveSupportNavLocale('lt-LT')).toBe('lt');
    expect(resolveSupportNavLocale('pl')).toBe('pl');
    expect(resolveSupportNavLocale('en-US')).toBe('en');
  });

  it('includes verified sidebar labels for school administrators', () => {
    const labels = buildSupportMenuLabels({
      portal: 'organization',
      entityType: 'school',
      locale: 'lt',
    });

    expect(labels).toContain('Grupės');
    expect(labels).toContain('Mokytojai');
    expect(labels).not.toContain('/school/');
  });

  it('tells agents to avoid technical routes and answer with verified menu labels', () => {
    expect(SUPPORT_NAVIGATION_AGENT_RULES).toContain('Never mention URL paths');
    expect(SUPPORT_NAVIGATION_AGENT_RULES).toContain('Grupės');
    expect(SUPPORT_NAVIGATION_AGENT_RULES).toContain('Never say you cannot confirm the menu path');
  });

  it('rewrites leaked routes into menu-style steps', () => {
    const reply = humanizeSupportNavigationReply(
      'Atidarykite /school/groups, tada pasirinkite mokinį.',
      'lt',
      'school',
    );

    expect(reply).toContain('Grupės');
    expect(reply).not.toMatch(/\/school\//);
  });

  it('still normalizes em dashes in agent replies', () => {
    const reply = humanizeSupportNavigationReply('Thanks—that explains it — I can help.');
    expect(reply).toBe('Thanks - that explains it - I can help.');
  });

  it('detects student contact navigation questions', () => {
    expect(isStudentContactsNavigationQuestion('kur galiu surasti savo mokiniu kontaktus?')).toBe(true);
    expect(isStudentContactsNavigationQuestion('kur galiu pasiziureti mokinu mano info?')).toBe(true);
    expect(isStudentContactsNavigationQuestion('weekly lesson bug')).toBe(false);
  });

  it('builds a Lithuanian students-menu answer without routes', () => {
    const reply = buildStudentContactsNavigationReply('lt', 'school');
    expect(reply).toContain('Mokiniai');
    expect(reply).not.toMatch(/\/school\//);
  });
});
