import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SchoolDiscountOfferDialog from '@/components/school/SchoolDiscountOfferDialog';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer mock' }) }));

afterEach(() => vi.unstubAllGlobals());

describe('SchoolDiscountOfferDialog combined delivery', () => {
  it('uses the main contract status from the API and sends a discount attached to that same contract', async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return {
        ok: true,
        json: async () => body.action === 'options'
          ? { contractAccepted: false, activities: [{ subjectId: 'math', tutorId: 'teacher', label: 'Matematika' }], agreements: [] }
          : { contractAccepted: false, emailSent: true, agreementNumber: 'NPR-123', emailTo: 'parent@example.test' },
      };
    }));
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<SchoolDiscountOfferDialog open onOpenChange={onOpenChange} organizationId="school-id"
      students={[{ id: 'student-id', fullName: 'Testinis mokinys', payerEmail: 'parent@example.test' }]}
      initialStudentId="student-id" contractId="contract-id" lockStudent onSaved={onSaved} />);

    await screen.findByRole('button', { name: 'Išsaugoti ir siųsti sutartį su priedu' });
    expect(screen.getByText(/Sutartis ir nuolaidos priedas bus išsiųsti tėvams vienu laišku/)).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti ir siųsti sutartį su priedu' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(
      'Sutartis ir nuolaidos priedas NPR-123 išsiųsti parent@example.test. Nuolaida bus taikoma tėvams patvirtinus abu dokumentus.',
      'success',
    ));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ action: 'create', contractId: 'contract-id', studentId: 'student-id', subjectId: 'math', tutorId: 'teacher', discountValue: 25 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the single-addendum action for an accepted main contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ contractAccepted: true, activities: [{ subjectId: 'math', tutorId: 'teacher', label: 'Matematika' }], agreements: [] }),
    })));
    render(<SchoolDiscountOfferDialog open onOpenChange={() => {}} organizationId="school-id"
      students={[{ id: 'student-id', fullName: 'Testinis mokinys' }]} contractId="contract-id"
      contractAccepted={false} onSaved={() => {}} />);

    await screen.findByText('Tėvams bus išsiųstas nuolaidos priedas. Nuolaida bus taikoma jiems patvirtinus priedą.');
    expect(screen.getByRole('button', { name: 'Išsaugoti ir siųsti' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Išsaugoti ir siųsti sutartį su priedu' })).toBeNull();
  });
});
