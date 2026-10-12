import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnulSessionPaymentDialog } from '@/components/AnnulSessionPaymentDialog';

const annul = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sessionPaymentAnnulment', () => ({ annulSessionPayment: annul }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ locale: 'lt', t: () => 'Atšaukti' }) }));
const saved = { id: 'lesson-1', is_complimentary: true, paid: true, payment_status: 'paid' };
beforeEach(() => annul.mockReset().mockResolvedValue({ ok: true, session: saved }));
afterEach(cleanup);

function show() {
  const onAnnulled = vi.fn();
  const onOpenChange = vi.fn();
  render(<AnnulSessionPaymentDialog open onOpenChange={onOpenChange} sessionId="lesson-1" onAnnulled={onAnnulled} />);
  return { onAnnulled, onOpenChange };
}

describe('administrator payment annulment confirmation', () => {
  it('explains that history and 6 EUR tutor pay remain and requires confirmation', async () => {
    const callbacks = show();
    const description = screen.getByText(/Už patvirtintą mokinio neatvykimą lieka 6 € atlygis/);
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBe(description.id);
    expect(annul).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Anuliuoti mokėjimą' }));
    await waitFor(() => expect(callbacks.onAnnulled).toHaveBeenCalledWith(saved));
    expect(annul).toHaveBeenCalledWith('lesson-1');
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
  });
  it('does not send a request when the administrator cancels', () => {
    const callbacks = show();
    fireEvent.click(screen.getByRole('button', { name: 'Atšaukti' }));
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
    expect(annul).not.toHaveBeenCalled();
  });
  it('keeps the confirmation open and explains how to resolve an already issued invoice', async () => {
    annul.mockResolvedValue({ ok: false, code: 'billed' });
    const callbacks = show();
    fireEvent.click(screen.getByRole('button', { name: 'Anuliuoti mokėjimą' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Pirmiausia anuliuokite ar pakoreguokite'));
    expect(callbacks.onAnnulled).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
  });
  it('sends just one request while confirmation is being saved', async () => {
    let finish!: (value: unknown) => void;
    annul.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const callbacks = show();
    const button = screen.getByRole('button', { name: 'Anuliuoti mokėjimą' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Atšaukti' }).hasAttribute('disabled')).toBe(true);
    expect(annul).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, session: saved }));
    expect(callbacks.onAnnulled).toHaveBeenCalledTimes(1);
  });
});
