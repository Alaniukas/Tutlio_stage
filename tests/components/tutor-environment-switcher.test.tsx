import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TutorEnvironmentSwitcher from '../../src/components/TutorEnvironmentSwitcher';
import TutorEnvironmentDialog from '../../src/components/TutorEnvironmentDialog';
import { tutorEnvironmentTranslations } from '../../src/lib/i18n/tutorEnvironmentTranslations';
import { LEGACY_LOCALES } from '../../src/lib/i18n/locales';

const environments = [
  { tutorId: 'tutor-1', organizationId: 'org-1', organizationName: 'Company A', email: 'first@example.com' },
  { tutorId: 'tutor-2', organizationId: 'org-2', organizationName: 'Company B', email: 'second@example.com' },
];
afterEach(cleanup);

describe('tutor company selector', () => {
  it('labels the selected company and switches using the company’s tutor identity', () => {
    const onChange = vi.fn();
    const onManage = vi.fn();
    render(<TutorEnvironmentSwitcher environments={environments} value="tutor-1" busy={false} onChange={onChange} onManage={onManage} />);
    expect((screen.getByLabelText('Pasirinkta organizacija') as HTMLSelectElement).value).toBe('tutor-1');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tutor-2' } });
    expect(onChange).toHaveBeenCalledWith('tutor-2');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides the selector for one company and opens the company chooser from a collapsed sidebar', () => {
    const onManage = vi.fn();
    const { rerender } = render(<TutorEnvironmentSwitcher environments={environments.slice(0, 1)} value="tutor-1" busy={false} onChange={vi.fn()} onManage={onManage} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<TutorEnvironmentSwitcher environments={environments} value="tutor-1" busy={false} compact onChange={vi.fn()} onManage={onManage} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pasirinkite organizaciją' }));
    expect(onManage).toHaveBeenCalledOnce();
  });

  it('prevents another selection while a company switch is running', () => {
    render(<TutorEnvironmentSwitcher environments={environments} value="tutor-1" busy onChange={vi.fn()} onManage={vi.fn()} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });

  it('shows assigned companies without linking, unlinking or password fields', () => {
    const switchEnvironment = vi.fn();
    const controller: any = { environments, busy: false, loading: false, error: null, switchEnvironment, clearError: vi.fn() };
    render(<TutorEnvironmentDialog open onOpenChange={vi.fn()} tutorId="tutor-1" controller={controller} />);
    fireEvent.click(screen.getByRole('button', { name: /Company B/ }));
    expect(switchEnvironment).toHaveBeenCalledWith('tutor-2');
    expect((screen.getByRole('button', { name: /Company A/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Susieti kitą organizaciją')).toBeNull();
    expect(screen.queryByText('Atsieti paskyrą')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });

  it('shows a readable error without displaying credentials', () => {
    const controller: any = { environments, busy: false, loading: false, error: 'notLinked', switchEnvironment: vi.fn(), clearError: vi.fn() };
    render(<TutorEnvironmentDialog open onOpenChange={vi.fn()} tutorId="tutor-1" controller={controller} />);
    expect(screen.getByRole('alert').textContent).toBe(tutorEnvironmentTranslations.lt['tutorEnv.error.notLinked']);
    expect(screen.queryByDisplayValue('source-secret')).toBeNull();
  });

  it('provides complete native copy and matching placeholders in all 13 baseline locales', () => {
    const keys = Object.keys(tutorEnvironmentTranslations.en).sort();
    for (const locale of LEGACY_LOCALES) {
      const copy = tutorEnvironmentTranslations[locale];
      expect(Object.keys(copy).sort()).toEqual(keys);
      expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true);
      if (locale !== 'en') expect(copy['tutorEnv.choose']).not.toBe(tutorEnvironmentTranslations.en['tutorEnv.choose']);
    }
  });
});
