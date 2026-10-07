import { describe, expect, it } from 'vitest';
import {
  buildSchoolContractsByPayerZipBytes,
  buildSchoolContractsExportZipBytes,
  groupSchoolContractsByEmployee,
  groupSchoolContractsByPayer,
  schoolContractPayerZipFilename,
  schoolContractZipPdfFilename,
  schoolContractsZipExportFilename,
  schoolEmployeeZipPdfFilename,
  schoolEmployeeZipFilename,
} from '../../src/lib/schoolContractsZipExport';

describe('schoolContractsZipExport', () => {
  it('groups siblings under the same payer email', () => {
    const groups = groupSchoolContractsByPayer([
      {
        id: 'c1',
        contractNumber: 'SUT-1',
        kind: 'annual',
        studentId: 's1',
        studentName: 'Jonas Petraitis',
        payerName: 'Petras Petraitis',
        payerEmail: 'petras@example.test',
        pdfPath: 'org/contracts/c1/a.pdf',
      },
      {
        id: 'c2',
        contractNumber: 'PAP-1',
        kind: 'extra_lessons',
        studentId: 's2',
        studentName: 'Ema Petraitė',
        payerName: 'Petras Petraitis',
        payerEmail: 'petras@example.test',
        pdfPath: 'org/contracts/c2/b.pdf',
      },
      {
        id: 'c3',
        contractNumber: 'SUT-2',
        kind: 'annual',
        studentId: 's3',
        studentName: 'Nojus Kazlauskas',
        payerName: 'Rasa Kazlauskienė',
        payerEmail: 'rasa@example.test',
        pdfPath: 'org/contracts/c3/c.pdf',
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].contracts).toHaveLength(2);
    expect(groups[0].contracts.map((row) => row.studentName)).toEqual(['Ema Petraitė', 'Jonas Petraitis']);
    expect(groups[1].contracts).toHaveLength(1);
  });

  it('builds readable pdf and payer zip names', () => {
    expect(schoolContractZipPdfFilename({
      id: 'c1',
      studentName: 'Jonas Petraitis',
      kind: 'annual',
      contractNumber: 'SUT/2026-001',
    })).toBe('Jonas-Petraitis-metine-SUT-2026-001.pdf');

    expect(schoolContractPayerZipFilename({
      payerKey: 'petras@example.test',
      payerName: 'Petras Petraitis',
      payerEmail: 'petras@example.test',
    })).toBe('Petras-Petraitis-petras@example.test.zip');

    expect(schoolContractsZipExportFilename('payers', '2026-10-07')).toBe('sutartys-pagal-mokejoja-2026-10-07.zip');
    expect(schoolContractsZipExportFilename('employees', '2026-10-07')).toBe('darbuotoju-sutartys-2026-10-07.zip');
  });

  it('groups employee documents under the same email', () => {
    const groups = groupSchoolContractsByEmployee([
      {
        id: 't1',
        groupKey: 'mokytojas@example.test',
        employeeName: 'Ona Mokytoja',
        employeeEmail: 'mokytojas@example.test',
        contractNumber: 'DS-1',
        documentKind: 'teacher',
      },
      {
        id: 's1',
        groupKey: 'mokytojas@example.test',
        employeeName: 'Ona Mokytoja',
        employeeEmail: 'mokytojas@example.test',
        contractNumber: 'KD-1',
        documentKind: 'staff_confidentiality',
      },
      {
        id: 's2',
        groupKey: 'mokytojas@example.test',
        employeeName: 'Ona Mokytoja',
        employeeEmail: 'mokytojas@example.test',
        contractNumber: 'ST-1',
        documentKind: 'staff_consent',
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].contracts).toHaveLength(3);
    expect(groups[0].contracts.map((row) => row.documentKind)).toEqual([
      'staff_confidentiality',
      'staff_consent',
      'teacher',
    ]);
    expect(schoolEmployeeZipPdfFilename(groups[0].contracts[2])).toBe('mokytojo-sutartis-DS-1.pdf');
    expect(schoolEmployeeZipPdfFilename(groups[0].contracts[0])).toBe('konfidencialumas-KD-1.pdf');
    expect(schoolEmployeeZipFilename(groups[0])).toBe('Ona-Mokytoja-mokytojas@example.test.zip');
  });

  it('builds nested employee zip bytes', () => {
    const employeeRows = [
      {
        id: 't1',
        groupKey: 'mokytojas@example.test',
        employeeName: 'Ona Mokytoja',
        employeeEmail: 'mokytojas@example.test',
        contractNumber: 'DS-1',
        documentKind: 'teacher' as const,
      },
      {
        id: 's1',
        groupKey: 'mokytojas@example.test',
        employeeName: 'Ona Mokytoja',
        employeeEmail: 'mokytojas@example.test',
        contractNumber: 'KD-1',
        documentKind: 'staff_confidentiality' as const,
      },
    ];
    const pdfByContractId = new Map<string, Uint8Array>([
      ['t1', new Uint8Array([1, 2, 3])],
      ['s1', new Uint8Array([4, 5, 6])],
    ]);
    const built = buildSchoolContractsExportZipBytes([], employeeRows, pdfByContractId);
    expect(built.downloaded).toBe(2);
    expect(built.employeeCount).toBe(1);
    expect(built.bytes?.byteLength).toBeGreaterThan(0);
  });

  it('builds nested payer zip bytes', () => {
    const rows = [
      {
        id: 'c1',
        contractNumber: 'SUT-1',
        kind: 'annual',
        studentId: 's1',
        studentName: 'Jonas Petraitis',
        payerName: 'Petras Petraitis',
        payerEmail: 'petras@example.test',
      },
      {
        id: 'c2',
        contractNumber: 'PAP-1',
        kind: 'extra_lessons',
        studentId: 's2',
        studentName: 'Ema Petraitė',
        payerName: 'Petras Petraitis',
        payerEmail: 'petras@example.test',
      },
    ];
    const pdfByContractId = new Map<string, Uint8Array>([
      ['c1', new Uint8Array([1, 2, 3])],
      ['c2', new Uint8Array([4, 5, 6])],
    ]);
    const built = buildSchoolContractsByPayerZipBytes(rows, pdfByContractId);
    expect(built.downloaded).toBe(2);
    expect(built.payerCount).toBe(1);
    expect(built.bytes?.byteLength).toBeGreaterThan(0);
  });
});
