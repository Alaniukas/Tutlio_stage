import { describe, expect, it } from 'vitest';
import { getCalendarSessionEventStyle } from '@/lib/calendarSessionEventStyle';
import { countProKlaseClientRoster } from '@/lib/proKlaseClientRoster';
import { isRegistrationOverdue, lessonAwaitingRegistration, studentRegistrationEnabled, type StudentRegistrationState } from '@/lib/studentRegistration';
import { registrationText } from '@/lib/studentRegistrationCopy';
import { PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';

const now = Date.parse('2026-10-13T12:00:00Z');
const state = (student_id = 's1', registration_pending = true): StudentRegistrationState => ({
  student_id, registration_pending, full_name: 'Student', pending_since: new Date(now - 24 * 3600_000).toISOString(), next_session_at: null,
});
const session = { student_id: 's1', status: 'active', end_time: new Date(now + 3600_000) };

describe('client registration and tentative lessons', () => {
  it('enables Pro Klasė and QA by default, supports explicit rollout and rollback', () => {
    expect(studentRegistrationEnabled(PRO_KLASE_ORG_ID)).toBe(true);
    expect(studentRegistrationEnabled(PRO_KLASE_QA_ORG_ID)).toBe(true);
    expect(studentRegistrationEnabled(PRO_KLASE_ORG_ID, { pending_registration_lessons: false })).toBe(false);
    expect(studentRegistrationEnabled('other')).toBe(false);
    expect(studentRegistrationEnabled('other', { pending_registration_lessons: true })).toBe(true);
  });
  it('starts admin warnings exactly at 24 hours and clears them after activation', () => {
    expect(isRegistrationOverdue(state(), now - 1)).toBe(false);
    expect(isRegistrationOverdue(state(), now)).toBe(true);
    expect(isRegistrationOverdue(state('s1', false), now)).toBe(false);
    expect(isRegistrationOverdue({ ...state(), pending_since: 'invalid' }, now)).toBe(false);
  });
  it('leaves the reserved session intact and returns to the normal display after registration', () => {
    const states = new Map([['s1', state()]]);
    expect(lessonAwaitingRegistration(session, states, now)).toBe(true);
    expect(session.status).toBe('active');
    states.set('s1', state('s1', false));
    expect(lessonAwaitingRegistration(session, states, now)).toBe(false);
    expect(lessonAwaitingRegistration(session, new Map(), now)).toBe(false);
  });
  it('does not mark cancelled or historical lessons as awaiting registration', () => {
    const states = new Map([['s1', state()]]);
    expect(lessonAwaitingRegistration({ ...session, status: 'cancelled' }, states, now)).toBe(false);
    expect(lessonAwaitingRegistration({ ...session, end_time: new Date(now) }, states, now)).toBe(false);
  });
  it('keeps mixed groups confirmed when another participant has registered', () => {
    const states = new Map([['s1', state()], ['s2', state('s2', false)]]);
    const group = { ...session, _groupSessions: [{ student_id: 's1' }, { student_id: 's2' }] };
    expect(lessonAwaitingRegistration(group, states, now)).toBe(false);
    states.set('s2', state('s2'));
    expect(lessonAwaitingRegistration(group, states, now)).toBe(true);
  });
  it('uses a subdued style for pending trials without changing other trial or cancellation styles', () => {
    const input = { status: 'active', isTrial: true, endAt: new Date(Date.now() + 3600_000), isOrgTutor: true };
    expect(getCalendarSessionEventStyle({ ...input, awaitingRegistration: true })).toMatchObject({ backgroundColor: '#e2e8f0', opacity: 0.8 });
    expect(getCalendarSessionEventStyle(input).backgroundColor).not.toBe('#e2e8f0');
    expect(getCalendarSessionEventStyle({ ...input, status: 'cancelled', awaitingRegistration: true }).backgroundColor).not.toBe('#e2e8f0');
  });
  it('counts pre-created accounts as inactive and accepts registered parent-only clients', () => {
    const group = (registration_pending: boolean, linked_user_id: string | null) => ({ primary: { registration_pending, linked_user_id }, rows: [] });
    expect(countProKlaseClientRoster([group(true, 'pre-created-user'), group(false, null)])).toMatchObject({ active: 1, inactive: 1 });
  });
  it('provides registration copy in all 13 email/UI locales with a fallback for newer locales', () => {
    for (const locale of ['lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl']) {
      expect(registrationText(locale, 'pending')).toBeTruthy();
      expect(registrationText(locale, 'emailSubject', { org: 'Target Org' })).toContain('Target Org');
      if (locale !== 'en') expect(registrationText(locale, 'pending')).not.toBe(registrationText('en', 'pending'));
    }
    expect(registrationText('uk', 'pending')).toBe(registrationText('en', 'pending'));
  });
});
