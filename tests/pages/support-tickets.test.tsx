import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SupportTicketsList, type SupportTicketSummary } from '@/components/support/SupportTicketsList';
import { supportTicketsPageForPath } from '@/lib/inAppSupport';

afterEach(cleanup);

const tickets: SupportTicketSummary[] = [
  {
    id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
    title: 'Kalendorius neužsikrauna',
    category: 'bug',
    status: 'registered',
    created_at: '2026-09-29T10:00:00.000Z',
    status_updated_at: '2026-09-29T10:00:00.000Z',
    target_date: null,
  },
  {
    id: '27ee7859-5c8a-4fba-9dbd-9259ccad28f4',
    title: 'Sąskaitos eksportas',
    category: 'feature',
    status: 'in_progress',
    created_at: '2026-09-28T10:00:00.000Z',
    status_updated_at: '2026-09-29T11:00:00.000Z',
    target_date: '2026-10-02T12:00:00.000Z',
  },
  {
    id: '37ee7859-5c8a-4fba-9dbd-9259ccad28f4',
    title: 'Mokinio profilis',
    category: 'bug',
    status: 'resolved',
    created_at: '2026-09-27T10:00:00.000Z',
    status_updated_at: '2026-09-29T12:00:00.000Z',
    target_date: null,
  },
];

describe('support ticket status view', () => {
  it('shows the three user statuses and an in-progress deadline', () => {
    const { container } = render(
      <MemoryRouter>
        <SupportTicketsList
          tickets={tickets}
          language="lt"
          supportPath="/school/support"
          selectedReference="27ee7859-5c8a-4fba-9dbd-9259ccad28f4"
          loading={false}
          error={false}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Kalendorius neužsikrauna')).toBeTruthy();
    expect(screen.getByText('Sąskaitos eksportas')).toBeTruthy();
    expect(screen.getByText('Mokinio profilis')).toBeTruthy();
    expect(screen.getAllByText('Užregistruota').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vykdoma').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Išspręsta').length).toBeGreaterThan(0);
    expect(screen.getByText('Numatomas terminas:')).toBeTruthy();
    expect(container.querySelector('[data-ticket-reference="SUP-27EE7859"]')?.className).toContain('border-indigo-400');
    expect(document.activeElement).toBe(container.querySelector('[data-ticket-reference="SUP-27EE7859"]'));
    expect(screen.getByRole('link', { name: 'Nauja užklausa' }).getAttribute('href')).toBe('/school/support');
  });

  it('maps the status link to each protected portal', () => {
    expect(supportTicketsPageForPath('/dashboard')).toBe('/support/tickets');
    expect(supportTicketsPageForPath('/student/sessions')).toBe('/student/support/tickets');
    expect(supportTicketsPageForPath('/parent/lessons')).toBe('/parent/support/tickets');
    expect(supportTicketsPageForPath('/company/sessions')).toBe('/company/support/tickets');
    expect(supportTicketsPageForPath('/school/sessions')).toBe('/school/support/tickets');
  });
});
