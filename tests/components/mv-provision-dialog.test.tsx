import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MvProvisionDialog, {
  type MvProvisionDialogSubmit,
} from '@/components/company/MvProvisionDialog';

function renderDialog(
  student: Parameters<typeof MvProvisionDialog>[0]['student'],
  onSubmit = vi.fn<(payload: MvProvisionDialogSubmit) => void>(),
) {
  render(
    <MvProvisionDialog
      open
      onOpenChange={() => {}}
      student={student}
      onSubmit={onSubmit}
    />,
  );

  return onSubmit;
}

describe('MvProvisionDialog', () => {
  it('allows a student account without an email when the parent account already exists', async () => {
    const onSubmit = renderDialog({
      id: 'student-row-1',
      full_name: 'Paulius Tolvaiša',
      email: null,
      payer_name: 'Eglė Tolvaišienė',
      payer_email: 'egle@example.test',
      linked_user_id: null,
      parent_user_id: 'parent-user-1',
    });

    expect(screen.queryByRole('checkbox', { name: 'Tėvų paskyra' })).toBeNull();
    expect((screen.getByRole('checkbox', { name: 'Mokinio paskyra' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Bus sugeneruotas mokinio prisijungimo vardas/).textContent).toContain(
      'egle@example.test',
    );

    const submit = screen.getByRole('button', { name: 'Sukurti paskyras' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'student',
      studentFullName: 'Paulius Tolvaiša',
      studentEmail: '',
      emailDelivery: 'separate',
    }));
  });

  it('requires a login email when only the missing parent account is selected', async () => {
    const onSubmit = renderDialog({
      id: 'student-row-2',
      full_name: 'Marija Bukataja',
      email: 'marija@example.test',
      payer_name: 'Marina Bukataja',
      payer_email: null,
      linked_user_id: 'student-user-1',
      parent_user_id: null,
    });

    expect((screen.getByRole('checkbox', { name: 'Tėvų paskyra' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'Mokinio paskyra' })).toBeNull();

    const submit = screen.getByRole('button', { name: 'Sukurti paskyras' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('tevas@example.com'), {
      target: { value: 'marina@example.test' },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'parent',
      parentName: 'Marina Bukataja',
      parentEmail: 'marina@example.test',
    }));
  });

  it('supports creating both accounts and sending both messages to the parent', async () => {
    const onSubmit = renderDialog({
      id: 'student-row-3',
      full_name: 'Naujas Mokinys',
      email: 'mokinys@example.test',
      payer_name: 'Naujas Tėvas',
      payer_email: 'tevas@example.test',
      linked_user_id: null,
      parent_user_id: null,
    });

    expect((screen.getByRole('checkbox', { name: 'Tėvų paskyra' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Mokinio paskyra' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Abu tėvo el. paštui' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti paskyras' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'both',
      emailDelivery: 'parent_both',
      parentEmail: 'tevas@example.test',
      studentEmail: 'mokinys@example.test',
    }));
  });
});
