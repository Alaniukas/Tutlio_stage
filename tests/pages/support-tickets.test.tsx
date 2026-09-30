import { cleanup, render, screen, within } from '@testing-library/react';
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
  it.each([
    ['lt', 'Įgyvendinta', 'Išspręsta'],
    ['en', 'Implemented', 'Resolved'],
    ['pl', 'Wdrożono', 'Rozwiązano'],
  ] as const)('labels completed features and bugs appropriately in %s', (language, featureLabel, bugLabel) => {
    const { container } = render(
      <MemoryRouter>
        <SupportTicketsList
          tickets={[{ ...tickets[1], status: 'resolved', target_date: null }, tickets[2]]}
          language={language}
          supportPath="/support"
          loading={false}
          error={false}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    const feature = within(container.querySelector('[data-ticket-reference="SUP-27EE7859"]') as HTMLElement);
    const bug = within(container.querySelector('[data-ticket-reference="SUP-37EE7859"]') as HTMLElement);
    expect(feature.getAllByText(featureLabel)).toHaveLength(2);
    expect(feature.queryByText(bugLabel)).toBeNull();
    expect(bug.getAllByText(bugLabel)).toHaveLength(2);
    expect(bug.queryByText(featureLabel)).toBeNull();
  });

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

  it('moves a feature from progress with an exact deadline to implemented without a stale deadline', () => {
    const renderTicket = (ticket: SupportTicketSummary) => (
      <MemoryRouter>
        <SupportTicketsList tickets={[ticket]} language="lt" supportPath="/school/support" loading={false} error={false} onRefresh={() => {}} />
      </MemoryRouter>
    );
    const { container, rerender } = render(renderTicket(tickets[1]));
    const article = container.querySelector('[data-ticket-reference="SUP-27EE7859"]') as HTMLElement;
    const deadline = new Intl.DateTimeFormat('lt-LT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tickets[1].target_date!));

    expect(article.querySelector('[aria-current="step"]')?.textContent).toBe('Vykdoma');
    expect(within(article).getByText(deadline)).toBeTruthy();
    expect(within(article).getByText('Numatomas terminas:')).toBeTruthy();

    rerender(renderTicket({ ...tickets[1], status: 'resolved', status_updated_at: '2026-09-30T12:00:00.000Z' }));

    expect(article.querySelector('[aria-current="step"]')?.textContent).toBe('Įgyvendinta');
    expect(within(article).getAllByText('Įgyvendinta')).toHaveLength(2);
    expect(within(article).queryByText('Numatomas terminas:')).toBeNull();
    expect(within(article).queryByText(deadline)).toBeNull();
    expect(within(article).getByText('Būsena pakeista:')).toBeTruthy();
  });
});
