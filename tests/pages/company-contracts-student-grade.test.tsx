import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts from '@/pages/company/CompanyContracts';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    orgId: 'org-1',
    orgName: 'Test school',
    orgEmail: 'school@example.test',
    orgFeatures: {},
    eSignEnabled: false,
    signingSettings: {
      email: 'school@example.test',
      reason: 'Ugdymo sutarties pasirašymas',
      location: 'Vilnius',
      contact: 'school@example.test',
    },
    templates: [],
    students: [
      {
        id: 'student-1',
        full_name: 'Ranonis Aivaras',
        email: '',
        grade: '4 klasė',
        payer_name: 'Ieva Ranonė',
        payer_email: 'ievapa@example.test',
      },
      {
        id: 'student-2',
        full_name: 'Be Klasės',
        email: '',
        grade: null,
        payer_name: 'Tėvas',
        payer_email: 'tevas@example.test',
      },
    ],
    contracts: [],
  },
}));

vi.mock('@/lib/dataCache', () => ({
  getCached: vi.fn(() => testState.cache),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: testState.from,
  },
}));

describe('CompanyContracts student grade in new-contract modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Radix Select needs these DOM APIs that jsdom does not implement.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    testState.from.mockImplementation(() => {
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => new Promise(() => undefined),
      };
      return query;
    });
  });

  const openStudentDropdown = () => {
    fireEvent.click(screen.getByText('Nauja sutartis'));
    const trigger = screen.getByText('Pasirinkite mokinį').closest('button');
    expect(trigger).toBeTruthy();
    fireEvent.keyDown(trigger!, { key: 'Enter' });
  };

  it('shows the grade next to each student option', () => {
    render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );
    openStudentDropdown();

    expect(screen.getByText('Ranonis Aivaras — 4 klasė')).toBeTruthy();
    // A student without a grade keeps a plain label.
    expect(screen.getByText('Be Klasės')).toBeTruthy();
  });

  it('shows the selected student grade under the select', () => {
    render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );
    openStudentDropdown();

    const option = screen.getByText('Ranonis Aivaras — 4 klasė').closest('[role="option"]');
    expect(option).toBeTruthy();
    fireEvent.keyDown(option!, { key: 'Enter' });

    expect(screen.getByText('Klasė: 4 klasė')).toBeTruthy();
  });

  it('shows a hint when the selected student has no grade', () => {
    render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );
    openStudentDropdown();

    const option = screen.getByText('Be Klasės').closest('[role="option"]');
    expect(option).toBeTruthy();
    fireEvent.keyDown(option!, { key: 'Enter' });

    expect(screen.getByText('Klasė nenurodyta (galite priskirti mokinių sąraše).')).toBeTruthy();
  });
});
