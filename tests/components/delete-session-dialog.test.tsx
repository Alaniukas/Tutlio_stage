import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteSessionDialog } from '@/components/DeleteSessionDialog';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

describe('lesson deletion scope dialog', () => {
  it.each([
    ['single', 'cal.deleteOnlyThis', 'cal.deleteConfirmSingle'],
    ['future', 'cal.deleteThisAndFuture', 'cal.deleteConfirmFuture'],
    ['all', 'cal.deleteAllRemaining', 'cal.deleteConfirmAll'],
  ])('requires an explicit confirmation after selecting %s', (scope, choiceLabel, confirmationKey) => {
    const onDelete = vi.fn();
    render(<DeleteSessionDialog open onOpenChange={vi.fn()} recurring onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: 'cal.delete' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: choiceLabel }));
    expect(onDelete).not.toHaveBeenCalled();
    const description = screen.getByText(confirmationKey);
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBe(description.id);
    expect(document.activeElement).toBe(description);
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete' }));
    expect(onDelete.mock.calls).toEqual([[scope]]);
  });

  it('does not offer series deletion for a one-time lesson', () => {
    const onDelete = vi.fn();
    render(<DeleteSessionDialog open onOpenChange={vi.fn()} recurring={false} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: 'cal.deleteAllRemaining' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteSession' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('cal.deleteConfirmSingle')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete' }));
    expect(onDelete).toHaveBeenCalledWith('single');
  });

  it('explains family cleanup scope separately from whole class group deletion', () => {
    const { rerender } = render(<DeleteSessionDialog open onOpenChange={vi.fn()} recurring familyOnlyCancelled onDelete={vi.fn()} />);
    expect(screen.getByText('cal.deleteCancelledOnlyHint')).toBeTruthy();
    expect(screen.queryByText('cal.deleteGroupHint')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteThisAndFuture' }));
    expect(screen.getByText('cal.deleteCancelledOnlyHint')).toBeTruthy();
    expect(screen.getByText('cal.deleteThisAndFuture')).toBeTruthy();
    rerender(<DeleteSessionDialog open onOpenChange={vi.fn()} recurring wholeGroup onDelete={vi.fn()} />);
    expect(screen.getByText('cal.deleteGroupHint')).toBeTruthy();
  });

  it('lets the user return to scope selection before confirming', () => {
    const onDelete = vi.fn();
    render(<DeleteSessionDialog open onOpenChange={vi.fn()} recurring onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteAllRemaining' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(screen.queryByText('cal.deleteConfirmAll')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteOnlyThis' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete' }));
    expect(onDelete.mock.calls).toEqual([['single']]);
  });

  it('cancels without deleting and resets selection when reopened', () => {
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(<DeleteSessionDialog open onOpenChange={onOpenChange} recurring onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteAllRemaining' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.cancelBtn' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDelete).not.toHaveBeenCalled();
    rerender(<DeleteSessionDialog open={false} onOpenChange={onOpenChange} recurring onDelete={onDelete} />);
    rerender(<DeleteSessionDialog open onOpenChange={onOpenChange} recurring onDelete={onDelete} />);
    expect(screen.getByRole('button', { name: 'cal.deleteAllRemaining' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'cal.delete' })).toBeNull();
  });

  it('resets scope after the parent closes the dialog', () => {
    const props = { onOpenChange: vi.fn(), recurring: true, onDelete: vi.fn() };
    const { rerender } = render(<DeleteSessionDialog open {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteThisAndFuture' }));
    rerender(<DeleteSessionDialog open={false} {...props} />);
    rerender(<DeleteSessionDialog open {...props} />);
    expect(screen.getByRole('button', { name: 'cal.deleteThisAndFuture' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'cal.delete' })).toBeNull();
  });

  it('disables scope selection and cancellation while busy', () => {
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();
    render(<DeleteSessionDialog open onOpenChange={onOpenChange} recurring busy onDelete={onDelete} />);
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteAllRemaining' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.cancelBtn' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('prevents repeat confirmation and dismissal while deletion is in progress', () => {
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(<DeleteSessionDialog open onOpenChange={onOpenChange} recurring onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteAllRemaining' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete' }));
    rerender(<DeleteSessionDialog open onOpenChange={onOpenChange} recurring busy onDelete={onDelete} />);
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.cancelBtn' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDelete.mock.calls).toEqual([['all']]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
