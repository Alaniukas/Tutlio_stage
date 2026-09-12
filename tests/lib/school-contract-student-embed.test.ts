import { describe, expect, it } from 'vitest';
import {
  attachStudentsToContracts,
  studentRowToContractEmbed,
} from '../../src/lib/schoolContractStudentEmbed';

describe('schoolContractStudentEmbed', () => {
  it('strips id from student row for contract embed', () => {
    const embed = studentRowToContractEmbed({
      id: 'stu-1',
      full_name: 'Jonas',
      email: 'j@example.com',
      payer_name: 'Tėvas',
      payer_email: 't@example.com',
    });
    expect(embed).toEqual({
      full_name: 'Jonas',
      email: 'j@example.com',
      payer_name: 'Tėvas',
      payer_email: 't@example.com',
    });
    expect((embed as { id?: string })?.id).toBeUndefined();
  });

  it('attaches students to contracts by student_id', () => {
    const contracts = [
      { id: 'c1', student_id: 'stu-1', annual_fee: 300 },
      { id: 'c2', student_id: 'missing', annual_fee: 200 },
    ];
    const students = [
      { id: 'stu-1', full_name: 'Ona', email: 'o@example.com', payer_name: null, payer_email: null },
    ];
    const merged = attachStudentsToContracts(contracts, students);
    expect(merged[0].student?.full_name).toBe('Ona');
    expect(merged[1].student).toBeUndefined();
  });
});
