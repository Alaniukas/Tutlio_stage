import { describe, expect, it, vi } from 'vitest';
import { persistProfileLocale } from '../../src/lib/localePreference';

function client(session: unknown, databaseError: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error: databaseError });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  const getSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
  return { db: { auth: { getSession }, from } as any, from, update, eq };
}

describe('locale preference persistence', () => {
  it('does not write a preference for signed-out visitors', async () => {
    const { db, from } = client(null);
    await persistProfileLocale(db, 'he');
    expect(from).not.toHaveBeenCalled();
  });

  it('writes only the signed-in profile and preserves regional codes', async () => {
    const { db, from, update, eq } = client({ user: { id: 'current-user' } });
    await persistProfileLocale(db, 'pt-br');
    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ preferred_locale: 'pt-br' });
    expect(eq).toHaveBeenCalledWith('id', 'current-user');
  });

  it('surfaces a returned constraint error instead of treating it as success', async () => {
    const error = { code: '23514', message: 'preferred_locale check failed' };
    const { db } = client({ user: { id: 'current-user' } }, error);
    await expect(persistProfileLocale(db, 'he')).rejects.toEqual(error);
  });

  it('does not apply a queued choice to a different account after signing out', async () => {
    const { db, from } = client({ user: { id: 'first-user' } });
    db.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'first-user' } } }, error: null })
      .mockResolvedValue({ data: { session: { user: { id: 'second-user' } } }, error: null });
    await persistProfileLocale(db, 'he', Promise.resolve());
    expect(from).not.toHaveBeenCalled();
  });

  it('waits for the prior write before saving the latest selection', async () => {
    let finishPrevious!: () => void;
    const previous = new Promise<void>((resolve) => { finishPrevious = resolve; });
    const { db, update } = client({ user: { id: 'current-user' } });
    const pending = persistProfileLocale(db, 'ar', previous);
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    finishPrevious();
    await pending;
    expect(update).toHaveBeenCalledWith({ preferred_locale: 'ar' });
  });
});
