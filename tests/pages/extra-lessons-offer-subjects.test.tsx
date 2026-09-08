import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExtraLessonsOfferDialog from '@/components/company/ExtraLessonsOfferDialog';
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
afterEach(() => vi.unstubAllGlobals());
describe('individual offer subjects', () => {
  it('loads taught subjects even when the contracts page supplies no subjects prop', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ subjects: [{ id: 'german', name: 'Vokiečių kalba', tutor_name: 'Mokytoja' }] }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ExtraLessonsOfferDialog open organizationId="org1" students={[]} groups={[]} onCreated={() => {}} onOpenChange={() => {}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/school-individual-subjects', expect.objectContaining({ headers: { Authorization: 'Bearer test' } })));
    fireEvent.change(screen.getByDisplayValue('Tėvai pasirinks'), { target: { value: 'individual' } });
    expect(await screen.findByRole('option', { name: 'Vokiečių kalba — Mokytoja' })).toBeTruthy();
    // The response is fetched once per opening, not once per field interaction.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
