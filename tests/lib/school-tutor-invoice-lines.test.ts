import { describe, expect, it } from 'vitest';
import {
  schoolTutorInvoiceActivityName,
  schoolTutorInvoiceLineDescription,
} from '../../src/lib/schoolTutorInvoiceLines';

describe('schoolTutorInvoiceLines', () => {
  it('uses group name and grupinis užsiėmimas label for class groups', () => {
    const row = {
      class_group_id: 'group-1',
      start_time: '2026-09-15T06:00:00Z',
      class_group: { name: 'Matematika 5 kl.' },
      subjects: { name: 'Math', is_group: true },
    };
    expect(schoolTutorInvoiceActivityName(row)).toBe('Matematika 5 kl.');
    expect(schoolTutorInvoiceLineDescription(row)).toBe('Grupinis užsiėmimas: Matematika 5 kl. (2026-09-15)');
    expect(schoolTutorInvoiceLineDescription(row)).not.toMatch(/pamoka/i);
  });

  it('uses individual service name for non-group meetings', () => {
    const row = {
      class_group_id: null,
      start_time: '2026-09-15T06:00:00Z',
      subjects: { name: 'Alina LT individuali' },
    };
    expect(schoolTutorInvoiceLineDescription(row)).toBe('Individualus užsiėmimas: Alina LT individuali (2026-09-15)');
  });

  it('falls back to attendance group_name when class group embed is missing', () => {
    const row = {
      class_group_id: 'group-1',
      group_name: 'Anglų kalba grupė',
      start_time: '2026-09-15T06:00:00Z',
      subjects: null,
    };
    expect(schoolTutorInvoiceActivityName(row)).toBe('Anglų kalba grupė');
  });
});
