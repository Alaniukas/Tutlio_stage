import { describe, expect, it } from 'vitest';
import {
  annualUsLimitMinutes,
  consultationProgramFromGrade,
  parseConsultationGrade,
} from '@/lib/schoolConsultationLimits';

describe('schoolConsultationLimits', () => {
  it('parses 0 klasė and priešmokyklinė', () => {
    expect(parseConsultationGrade('0 klasė')).toBe(0);
    expect(parseConsultationGrade('priešmokyklinė')).toBe(0);
    expect(consultationProgramFromGrade('0 klasė')).toBe('preprimary');
  });

  it('maps grade bands to annual minutes', () => {
    expect(annualUsLimitMinutes('2 klasė')).toBe(1920);
    expect(annualUsLimitMinutes('5 klasė')).toBe(4560);
    expect(annualUsLimitMinutes('10 klasė')).toBe(4560);
    expect(annualUsLimitMinutes('11 klasė')).toBeNull();
  });
});
