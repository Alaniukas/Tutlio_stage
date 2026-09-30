import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SchoolExtraLessonsAccept from '../../src/pages/SchoolExtraLessonsAccept';
import { mergeExtraLessonsOrderPatch, validateExtraLessonsOrder, type ExtraLessonsOrderSnapshot } from '../../src/lib/extraLessonsContract';

const fetchMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

vi.mock('@/components/company/ScheduleSlotPicker', () => ({
  DateRangeFields: ({ startDate, endDate, onStart, onEnd }: {
    startDate: string; endDate: string; onStart: (value: string) => void; onEnd: (value: string) => void;
  }) => (
    <div>
      <label>Pradžios data<input type="date" value={startDate} onChange={(event) => onStart(event.target.value)} /></label>
      <label>Pabaigos data<input type="date" value={endDate} onChange={(event) => onEnd(event.target.value)} /></label>
    </div>
  ),
  ScheduleSlotPicker: ({ slots, onChange }: {
    slots: ExtraLessonsOrderSnapshot['schedule_slots'];
    onChange: (value: ExtraLessonsOrderSnapshot['schedule_slots']) => void;
  }) => (
    <div>
      grafikas
      <button type="button" onClick={() => onChange([{ weekday: 2, start_time: '16:00', end_time: '16:45' }])}>Pridėti dieną</button>
      {slots.length > 0 && <button type="button" onClick={() => onChange([])}>Pašalinti dieną</button>}
    </div>
  ),
}));

const preview = {
  ok: true,
  contractId: 'c3',
  contractNumber: 'PP-LEGAL-WITHIN14',
  studentName: 'QA Legal Per 14 d.',
  schoolName: 'Demo Mokykla',
  schoolEmail: 'demo@example.com',
  pdfUrl: 'https://example.com/sutartis.pdf',
  body: 'NUOTOLINIŲ PAPILDOMŲ PAMOKŲ SUTARTIS\n1. Šalys',
  order: {
    revision_label: 'QA',
    service_name: 'QA Matematika',
    service_type: 'group',
    platform: 'Google Meet',
    duration_minutes: 45,
    schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
    schedule_label: 'antradienis 16:00–16:45',
    start_date: '2026-08-30',
    end_date: '2027-06-13',
    unit_price_eur: 18,
    vat_status: 'PVM neapmokestinama',
    base_lessons_per_month: 8,
    indicative_monthly_eur: 144,
    individual_cancel_terms: 'netaikoma',
    school_email: 'demo@example.com',
    school_phone: '',
    data_protection_contact: 'demo@example.com',
  },
  parentEditableFields: [],
  startWithin14Applies: true,
  recordingsEnabled: true,
  startWithin14CheckboxText: 'Prašau pradėti teikti paslaugas nepasibaigus 14 dienų',
  legalLinks: { withdrawalForm: '/legal/extra-lessons-withdrawal-form.html' },
};

describe('SchoolExtraLessonsAccept', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('accepts a legacy offer with a schedule label and no structured slots without changing its order', async () => {
    const legacyOrder = { ...preview.order, schedule_slots: [] } as ExtraLessonsOrderSnapshot;
    let submittedOrder: ExtraLessonsOrderSnapshot | undefined;
    let submittedScheduleLabel: string | undefined;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        submittedScheduleLabel = body.order_patch.schedule_label;
        submittedOrder = mergeExtraLessonsOrderPatch(legacyOrder, body.order_patch);
        const fields = validateExtraLessonsOrder(submittedOrder);
        return fields.length
          ? { ok: false, json: async () => ({ error: 'Incomplete order', fields }) }
          : { ok: true, json: async () => ({ ok: true, accepted_at: '2026-09-30T10:00:00Z' }) };
      }
      return { ok: true, text: async () => JSON.stringify({ ...preview, order: legacyOrder }) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=legacy']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('checkbox');
    expect(screen.queryByText('Prašome papildyti trūkstamus užsakymo duomenis:')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));

    await screen.findByRole('heading', { name: 'Sutartis sudaryta' });
    expect(submittedScheduleLabel).toBe(legacyOrder.schedule_label);
    expect(submittedOrder).toMatchObject(legacyOrder);
  });

  it('identifies missing order fields before sending and lets the parent fill them and submit', async () => {
    const incompleteOrder = {
      ...preview.order, platform: '', duration_minutes: 0, end_date: '', base_lessons_per_month: 0,
    } as ExtraLessonsOrderSnapshot;
    let submittedOrder: ExtraLessonsOrderSnapshot | undefined;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        const merged = mergeExtraLessonsOrderPatch(incompleteOrder, body.order_patch);
        if (body.preview) return { ok: true, json: async () => ({ ...preview, order: merged, parentEditableFields: validateExtraLessonsOrder(merged) }) };
        submittedOrder = merged;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return {
        ok: true,
        // A prior auto-preview may have cleared the list while a field was
        // subsequently emptied. Submission validation must restore the inputs.
        text: async () => JSON.stringify({ ...preview, order: incompleteOrder, parentEditableFields: [] }),
      };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=incomplete']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('checkbox');
    expect(screen.queryByRole('textbox', { name: 'Bazinis užsiėmimų kiekis / mėn.' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Trūksta: Platforma, Pabaigos data, Bazinis užsiėmimų kiekis / mėn., Užsiėmimo trukmė (min)');
    expect(document.activeElement).toBe(alert);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Bazinis užsiėmimų kiekis / mėn.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Papildyti trūkstamus užsakymo duomenis' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Platforma' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Platforma' }), { target: { value: 'Google Meet' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Užsiėmimo trukmė (min)' }), { target: { value: '45' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Bazinis užsiėmimų kiekis / mėn.' }), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Pabaigos data'), { target: { value: '2027-06-13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));

    await screen.findByRole('heading', { name: 'Sutartis sudaryta' });
    expect(validateExtraLessonsOrder(submittedOrder!)).toEqual([]);
  });

  it('requires a schedule again after the parent removes newly entered slots from a refreshed preview', async () => {
    const order = { ...preview.order, schedule_slots: [], schedule_label: '' } as ExtraLessonsOrderSnapshot;
    let previewRequests = 0;
    let acceptanceRequests = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.preview) {
          previewRequests += 1;
          const refreshedOrder = mergeExtraLessonsOrderPatch(order, body.order_patch);
          return { ok: true, json: async () => ({ ...preview, order: refreshedOrder, parentEditableFields: [] }) };
        }
        acceptanceRequests += 1;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, text: async () => JSON.stringify({ ...preview, order, parentEditableFields: ['schedule_label'] }) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=schedule']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dieną' }));
    await waitFor(() => expect(previewRequests).toBe(1), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByText('Atnaujinama peržiūra pagal jūsų įvestus duomenis…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Pašalinti dieną' }));
    expect(screen.getByText('Grafikas:', { selector: 'span' }).parentElement?.textContent).toBe('Grafikas: —');
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    expect(screen.getByRole('alert').querySelector('p')?.textContent).toBe('Trūksta: Grafikas');
    expect(acceptanceRequests).toBe(0);
  });

  it('keeps the final accepted PDF when an older auto-preview finishes after submission', async () => {
    let finishPreview: (response: unknown) => void = () => {};
    let previewSignal: AbortSignal | undefined;
    const openPdf = vi.spyOn(window, 'open').mockImplementation(() => null);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.preview) {
          previewSignal = init.signal as AbortSignal;
          return new Promise(resolve => { finishPreview = resolve; });
        }
        return { ok: true, json: async () => ({ ok: true, pdfUrl: 'https://example.com/final-accepted.pdf' }) };
      }
      return { ok: true, text: async () => JSON.stringify({ ...preview, parentEditableFields: ['platform'] }) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=preview-race']}><SchoolExtraLessonsAccept /></MemoryRouter>);
    await screen.findByRole('textbox', { name: 'Platforma' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Platforma' }), { target: { value: 'Zoom' } });
    await waitFor(() => expect(previewSignal).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    await screen.findByRole('heading', { name: 'Sutartis sudaryta' });
    expect(previewSignal?.aborted).toBe(true);
    // The mock ignores AbortSignal, so the stale-response guard also gets tested.
    await act(async () => finishPreview({ ok: true, json: async () => ({ ...preview, pdfUrl: 'https://example.com/old-draft.pdf' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Atidaryti sutarties PDF' }));
    expect(openPdf).toHaveBeenCalledWith('https://example.com/final-accepted.pdf', '_blank', 'noopener,noreferrer');
    openPdf.mockRestore();
  });

  it('keeps the newest PDF when an earlier field preview returns out of order', async () => {
    let finishOldPreview: (response: unknown) => void = () => {};
    let oldSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.order_patch.platform === 'Older platform') {
          oldSignal = init.signal as AbortSignal;
          return new Promise(resolve => { finishOldPreview = resolve; });
        }
        return { ok: true, json: async () => ({ ...preview, parentEditableFields: ['platform'], pdfUrl: 'https://example.com/newest-preview.pdf' }) };
      }
      return { ok: true, text: async () => JSON.stringify({ ...preview, parentEditableFields: ['platform'] }) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=field-preview-race']}><SchoolExtraLessonsAccept /></MemoryRouter>);
    await screen.findByRole('textbox', { name: 'Platforma' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Platforma' }), { target: { value: 'Older platform' } });
    await waitFor(() => expect(oldSignal).toBeTruthy(), { timeout: 2000 });
    fireEvent.change(screen.getByRole('textbox', { name: 'Platforma' }), { target: { value: 'Newest platform' } });
    await waitFor(() => expect(screen.getByTitle('Sutarties PDF').getAttribute('src')).toBe('https://example.com/newest-preview.pdf'), { timeout: 2000 });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => finishOldPreview({ ok: true, json: async () => ({ ...preview, pdfUrl: 'https://example.com/older-preview.pdf' }) }));
    expect(screen.getByTitle('Sutarties PDF').getAttribute('src')).toBe('https://example.com/newest-preview.pdf');
    expect((screen.getByRole('textbox', { name: 'Platforma' }) as HTMLInputElement).value).toBe('Newest platform');
  });

  it.each([
    {
      failure: 'a server failure',
      payload: { error: 'Nepavyko išsaugoti patvirtinimo. Bandykite dar kartą.' },
      message: 'Nepavyko išsaugoti patvirtinimo. Bandykite dar kartą.',
    },
    {
      failure: 'missing order fields',
      payload: { error: 'Incomplete order', fields: ['schedule_label', 'base_lessons_per_month'] },
      message: 'Trūksta: Grafikas, Bazinis užsiėmimų kiekis / mėn.',
    },
    {
      failure: 'missing school-owned fields',
      payload: { error: 'Incomplete order', fields: ['unit_price_eur', 'recording_access'] },
      message: 'Trūksta: Kaina, Užsiėmimų įrašai',
    },
  ])('shows $failure beside the submit button and preserves choices for retry', async ({ payload, message }) => {
    let attempts = 0;
    let retryBody: any;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        attempts += 1;
        if (attempts === 1) return { ok: false, json: async () => payload };
        retryBody = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, text: async () => JSON.stringify(preview) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('radio', { name: 'Palaukti' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Nesutinku' }));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));

    const alert = await screen.findByRole('alert');
    expect(alert.querySelector('p')?.textContent).toBe(message);
    expect(alert.nextElementSibling).toBe(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    expect(document.activeElement).toBe(alert);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Palaukti' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Nesutinku' }) as HTMLInputElement).checked).toBe(true);
    if ('fields' in payload && payload.fields.includes('base_lessons_per_month')) {
      expect(screen.getByRole('button', { name: 'Papildyti trūkstamus užsakymo duomenis' })).toBeTruthy();
      expect(screen.getByRole('textbox', { name: 'Bazinis užsiėmimų kiekis / mėn.' })).toBeTruthy();
    } else {
      expect(screen.queryByRole('button', { name: 'Papildyti trūkstamus užsakymo duomenis' })).toBeNull();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    await screen.findByRole('heading', { name: 'Sutartis sudaryta' });
    expect(retryBody).toMatchObject({ accepted_terms: true, start_within_14_days: false, recording_consent: false });
  });

  it.each(['empty JSON', 'non-JSON'])('keeps the form retryable after an HTTP 200 %s response without success confirmation', async (responseKind) => {
    let attempts = 0;
    let retryBody: Record<string, unknown> | undefined;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        attempts += 1;
        if (attempts === 1) return {
          ok: true,
          json: async () => {
            if (responseKind === 'non-JSON') throw new SyntaxError('Unexpected response');
            return {};
          },
        };
        retryBody = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, text: async () => JSON.stringify(preview) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=unexpected-response']}><SchoolExtraLessonsAccept /></MemoryRouter>);
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('radio', { name: 'Palaukti' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Nesutinku' }));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));

    const alert = await screen.findByRole('alert');
    expect(alert.querySelector('p')?.textContent).toBe('Nepavyko pateikti užsakymo.');
    expect(screen.queryByRole('heading', { name: 'Sutartis sudaryta' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Patvirtinimas išsaugotas' })).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Palaukti' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Nesutinku' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    await screen.findByRole('heading', { name: 'Sutartis sudaryta' });
    expect(retryBody).toMatchObject({ accepted_terms: true, start_within_14_days: false, recording_consent: false });
  });

  it('shows durable pending state after submit and finishes when the worker finalizes', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ ok: true, pending: true }) };
      if (_url.includes('status=1')) return { ok: true, json: async () => ({ ok: true, alreadyAccepted: true, pdfUrl: 'https://example.com/final.pdf' }) };
      return { ok: true, text: async () => JSON.stringify(preview) };
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' }));
    await screen.findByRole('heading', { name: 'Patvirtinimas išsaugotas' });
    expect(screen.queryByRole('heading', { name: 'Sutartis sudaryta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Užsakymas su prievole sumokėti' })).toBeNull();
    await screen.findByRole('heading', { name: 'Sutartis sudaryta' }, { timeout: 4500 });
  });

  it('restores the pending screen on page reload', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ...preview, pending: true, needsAttention: true }) });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Patvirtinimas išsaugotas' });
    expect(screen.getByText(/Dokumento paruošimas užtruko/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows a PDF preview and Sutinku/Nesutinku choices for the parent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(preview),
    });

    render(
      <MemoryRouter initialEntries={['/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']}>
        <SchoolExtraLessonsAccept />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle('Sutarties PDF')).toBeTruthy();
    });
    expect(screen.getByTitle('Sutarties PDF').getAttribute('src')).toBe('https://example.com/sutartis.pdf');
    expect(screen.getByRole('button', { name: 'Atidaryti visą PDF' })).toBeTruthy();
    expect(screen.getByText('Sutinku pradėti iš karto')).toBeTruthy();
    expect(screen.getByText('Palaukti')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Sutinku pradėti iš karto' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Palaukti' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: 'Sutinku' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Nesutinku' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' })).toBeTruthy();
    expect(screen.getByText('Tutlio')).toBeTruthy();
    expect(screen.queryByText('Tutlio 🎓')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Peržiūrėkite sutartį ir pateikite užsakymą' })).toBeTruthy();
    expect(screen.queryByText(/\*\s*$/)).toBeNull();
    expect(screen.getByText(/Grupiniai užsiėmimai užsakomi visam mėnesiui/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Sutarties atsisakymo forma' }).getAttribute('href'),
    ).toBe('/api/extra-lessons-contract-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&format=annex-pdf');
    expect(screen.queryByText(/Privatumo pranešimas/)).toBeNull();
    expect(screen.queryByText(/Elgesio taisyklės — kreipkitės/)).toBeNull();
    expect(screen.getByText(/nuotolinių užsiėmimų elgesio taisyklėmis/)).toBeTruthy();
  });

  it('shows the discount addendum and its PDF before the main contract is confirmed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview,
        discountAgreements: [{
          id: 'discount-1', agreementNumber: 'NPR-1', activityLabel: 'QA Matematika',
          discountType: 'percent', discountValue: 25, validFrom: '2026-09-01', validUntil: '2027-06-30',
          status: 'pending', acceptedAt: null, pdfUrl: 'https://example.com/nuolaida.pdf',
          acceptUrl: '/school-discount-accept?contractToken=test&agreementId=discount-1',
        }],
      }),
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Nuolaidos priedai' });
    expect(screen.getByRole('link', { name: 'Atidaryti nuolaidos priedo PDF' }).getAttribute('href'))
      .toBe('https://example.com/nuolaida.pdf');
    expect(screen.getByRole('link', { name: 'Peržiūrėti ir patvirtinti nuolaidą' }).getAttribute('href'))
      .toBe('/school-discount-accept?contractToken=test&agreementId=discount-1');
    expect(screen.getByText('Laukia jūsų patvirtinimo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Užsakymas su prievole sumokėti' })).toBeTruthy();
  });

  it('keeps an unconfirmed discount actionable after the main contract is approved', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview, alreadyAccepted: true,
        discountAgreements: [{
          id: 'discount-1', agreementNumber: 'NPR-1', activityLabel: 'QA Matematika',
          discountType: 'amount', discountValue: 12, validFrom: '2026-09-01', validUntil: '2027-06-30',
          status: 'pending', acceptedAt: null, pdfUrl: 'https://example.com/nuolaida.pdf',
          acceptUrl: '/school-discount-accept?contractToken=test&agreementId=discount-1',
        }],
      }),
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Sutartis sudaryta' });
    expect(screen.getByRole('link', { name: 'Peržiūrėti ir patvirtinti nuolaidą' })).toBeTruthy();
  });

  it('keeps the discount confirmation available while the main PDF is being prepared', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview, pending: true,
        discountAgreements: [{
          id: 'discount-1', agreementNumber: 'NPR-1', activityLabel: 'QA Matematika',
          discountType: 'percent', discountValue: 25, validFrom: '2026-09-01', validUntil: '2027-06-30',
          status: 'pending', acceptedAt: null, pdfUrl: 'https://example.com/nuolaida.pdf',
          acceptUrl: '/school-discount-accept?contractToken=test&agreementId=discount-1',
        }],
      }),
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Patvirtinimas išsaugotas' });
    expect(screen.getByRole('status').textContent).toContain('Nuolaidos priedą patvirtinkite atskirai');
    expect(screen.getByRole('link', { name: 'Peržiūrėti ir patvirtinti nuolaidą' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Užsakymas su prievole sumokėti' })).toBeNull();
  });

  it('shows approved discount evidence without asking to approve it again', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview,
        discountAgreements: [{
          id: 'discount-1', agreementNumber: 'NPR-1', activityLabel: 'QA Matematika',
          discountType: 'percent', discountValue: 25, validFrom: '2026-09-01', validUntil: '2027-06-30',
          status: 'accepted', acceptedAt: '2026-09-28T10:00:00Z', pdfUrl: 'https://example.com/nuolaida.pdf',
          acceptUrl: '/school-discount-accept?contractToken=test&agreementId=discount-1',
        }],
      }),
    });
    render(<MemoryRouter initialEntries={['/school-extra-lessons-accept?token=test']}><SchoolExtraLessonsAccept /></MemoryRouter>);

    await screen.findByText('Nuolaida patvirtinta');
    expect(screen.getByRole('link', { name: 'Atidaryti nuolaidos priedo PDF' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Peržiūrėti ir patvirtinti nuolaidą' })).toBeNull();
  });

  it('hides the 14-day radios when the first lesson is after the window', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview,
        startWithin14Applies: false,
        recordingsEnabled: false,
        parentEditableFields: [],
        order: {
          ...preview.order,
          // Keep this deterministically beyond the 14-day window regardless of
          // the calendar date on which the suite runs.
          start_date: '2099-10-01',
          end_date: '2100-06-30',
          schedule_slots: [{ weekday: 4, start_time: '16:00', end_time: '16:45' }],
          schedule_label: 'ketvirtadienis 16:00–16:45',
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/school-extra-lessons-accept?token=legalqaafter14bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']}>
        <SchoolExtraLessonsAccept />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTitle('Sutarties PDF')).toBeTruthy();
    });
    expect(screen.queryByText('Sutinku pradėti iš karto')).toBeNull();
    expect(screen.queryByText('Palaukti')).toBeNull();
    expect(screen.queryByText('Užsiėmimų įrašymas')).toBeNull();
  });

  it('asks the parent to fill missing order fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview,
        pdfUrl: null,
        startWithin14Applies: false,
        recordingsEnabled: false,
        parentEditableFields: ['service_name', 'service_type', 'platform', 'duration_minutes', 'start_date', 'end_date'],
        order: {
          ...preview.order,
          service_name: '',
          service_type: '',
          platform: '',
          duration_minutes: 0,
          start_date: '',
          end_date: '',
          schedule_slots: [{ weekday: 4, start_time: '16:00', end_time: '16:45' }],
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/school-extra-lessons-accept?token=legalqasparsecccccccccccccccccccccccccccccccc']}>
        <SchoolExtraLessonsAccept />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Prašome papildyti trūkstamus užsakymo duomenis:')).toBeTruthy();
    });
    expect(screen.getByText('Paslaugos pavadinimas')).toBeTruthy();
    expect(screen.getByText('Paslaugos tipas')).toBeTruthy();
    expect(screen.getByText('Grupinė')).toBeTruthy();
    expect(screen.getByText('Individuali')).toBeTruthy();
    expect(screen.getByText('Užsiėmimo trukmė (min)')).toBeTruthy();
  });

  it('does not offer withdrawal on the post-accept success screen', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview,
        alreadyAccepted: true,
        acceptedAt: new Date().toISOString(),
        recordingsEnabled: false,
      }),
    });

    render(
      <MemoryRouter initialEntries={['/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']}>
        <SchoolExtraLessonsAccept />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Sutartis sudaryta')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /Atsisakyti sutarties/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nutraukti sutartį' })).toBeNull();
    expect(screen.queryByText(/tėvų paskyroje/)).toBeNull();
    expect(screen.getByText(/paskyros kurti nereikia/)).toBeTruthy();
  });

  it('opens only the contract annex when view=annex', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ...preview,
        recordingsEnabled: false,
        body: 'VISA SUTARTIS\n2. DALYKAS\n1 PRIEDAS\nTik atsisakymo forma.',
      }),
    });
    render(
      <MemoryRouter initialEntries={['/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&view=annex']}>
        <SchoolExtraLessonsAccept />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Sutarties atsisakymo forma')).toBeTruthy();
    });
    expect(screen.getByText(/Tik atsisakymo forma/)).toBeTruthy();
    expect(screen.queryByText('VISA SUTARTIS')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Užsakymas su prievole sumokėti' })).toBeNull();
  });
});
