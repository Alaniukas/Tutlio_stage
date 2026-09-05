import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SchoolExtraLessonsAccept from '../../src/pages/SchoolExtraLessonsAccept';

const fetchMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

vi.mock('@/components/company/ScheduleSlotPicker', () => ({
  DateRangeFields: () => <div>datos</div>,
  ScheduleSlotPicker: () => <div>grafikas</div>,
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
    expect(screen.getByText('Sutinku')).toBeTruthy();
    expect(screen.getByText('Nesutinku')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Patvirtinti sutartį' })).toBeTruthy();
    expect(screen.getByText('Tutlio 🎓')).toBeTruthy();
    expect(screen.getByText(/Grupiniai užsiėmimai užsakomi visam mėnesiui/)).toBeTruthy();
    expect(screen.queryByText(/Elgesio taisyklės — kreipkitės/)).toBeNull();
    expect(screen.getByText(/nuotolinių užsiėmimų elgesio taisyklėmis/)).toBeTruthy();
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
          start_date: '2026-10-01',
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
});
