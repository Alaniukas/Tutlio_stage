import { describe, expect, it } from 'vitest';
import {
  resolveOrgMeetingLink,
  resolveOrgSessionSubjectDefaults,
} from '../../src/lib/orgSessionSubjectDefaults';

describe('resolveOrgMeetingLink', () => {
  const students = [
    { id: 's1', personal_meeting_link: 'https://student.example' },
    { id: 's2', personal_meeting_link: null },
  ];

  it('prefers student link over tutor and subject', () => {
    expect(
      resolveOrgMeetingLink('https://subject.example', 's1', 'https://tutor.example', students),
    ).toBe('https://student.example');
  });

  it('falls back to tutor then subject', () => {
    expect(
      resolveOrgMeetingLink('https://subject.example', 's2', 'https://tutor.example', students),
    ).toBe('https://tutor.example');
    expect(resolveOrgMeetingLink('https://subject.example', 's2', null, students)).toBe(
      'https://subject.example',
    );
  });
});

describe('resolveOrgSessionSubjectDefaults', () => {
  const trialDefaults = { topic: 'Bandomoji', durationMinutes: 45, priceEur: 10 };

  it('applies trial defaults when switching to trial subject', () => {
    const result = resolveOrgSessionSubjectDefaults({
      subject: {
        id: 'trial',
        name: 'Bandomoji pamoka',
        price: 10,
        duration_minutes: 45,
        is_trial: true,
      },
      trialDefaults,
    });
    expect(result).toEqual({
      topic: 'Bandomoji',
      price: 10,
      durationMinutes: 45,
      meetingLink: '',
    });
  });

  it('applies regular price and duration when leaving trial subject', () => {
    const result = resolveOrgSessionSubjectDefaults({
      subject: {
        id: 'math',
        name: 'Matematika',
        price: 25,
        duration_minutes: 60,
        is_trial: false,
      },
      studentId: 's1',
      tutorId: 't1',
      students: [{ id: 's1', grade: '8 klasė', pricing_lessons_per_week: 2 }],
      individualPricing: [],
      dynamicPricingRules: [],
      orgSubjectTemplates: [{ id: 'tpl1', name: 'Matematika' }],
      tutorSubjectPrices: [
        { tutor_id: 't1', org_subject_template_id: 'tpl1', price: 30, duration_minutes: 90 },
      ],
      trialDefaults,
    });
    expect(result.topic).toBe('Matematika');
    expect(result.price).toBe(30);
    expect(result.durationMinutes).toBe(90);
  });

  it('uses individual pricing over tutor subject price', () => {
    const result = resolveOrgSessionSubjectDefaults({
      subject: { id: 'math', name: 'Matematika', price: 25, duration_minutes: 60 },
      studentId: 's1',
      tutorId: 't1',
      students: [{ id: 's1' }],
      individualPricing: [{ student_id: 's1', subject_id: 'math', price: 22 }],
      orgSubjectTemplates: [{ id: 'tpl1', name: 'Matematika' }],
      tutorSubjectPrices: [
        { tutor_id: 't1', org_subject_template_id: 'tpl1', price: 30, duration_minutes: 60 },
      ],
    });
    expect(result.price).toBe(22);
  });
});
