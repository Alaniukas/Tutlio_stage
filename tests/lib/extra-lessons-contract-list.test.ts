import { describe, expect, it } from 'vitest';
import {
  extraLessonsContractListDetails,
  extraLessonsContractListTitle,
  extraLessonsContractSearchText,
} from '../../src/lib/extraLessonsContractList';

describe('extraLessonsContractList', () => {
  const row = {
    kind: 'extra_lessons' as const,
    order_snapshot: {
      service_name: 'lietuvių kalba',
      service_type: 'group',
      schedule_label: 'antradieniais 16:00–16:45',
      group_name: 'LT 5 kl.',
      schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
    },
    class_group: { name: 'LT 5 kl.', tutor: { full_name: 'Ona Mokytoja' } },
  };

  it('builds a descriptive list title', () => {
    expect(extraLessonsContractListTitle('Emilija Bar', row)).toBe(
      'Emilija Bar – lietuvių kalba – grupinis užsiėmimas',
    );
  });

  it('includes teacher, group and schedule in details', () => {
    expect(extraLessonsContractListDetails(row)).toEqual({
      teacher: 'Ona Mokytoja',
      schedule: 'antradieniais 16:00–16:45',
      group: 'LT 5 kl.',
    });
  });

  it('adds subject and teacher to search haystack', () => {
    const text = extraLessonsContractSearchText(row);
    expect(text).toContain('lietuvių kalba');
    expect(text).toContain('Ona Mokytoja');
    expect(text).toContain('grupinis užsiėmimas');
  });
});
