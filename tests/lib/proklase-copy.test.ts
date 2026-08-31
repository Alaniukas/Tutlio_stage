import { describe, expect, it } from 'vitest';
import { lt } from '../../src/lib/i18n/lt';

describe('Pro Klasė client-facing cancellation copy', () => {
  it('uses apmokėjimas instead of bauda in Lithuanian emails and student cards', () => {
    expect(lt['em.feePercent']).toBe('{percent} % apmokėjimas');
    expect(lt['em.feePercent']).not.toMatch(/bauda/i);
    expect(lt['stu.cancelBefore']).toMatch(/apmokėjimas/);
    expect(lt['stu.cancelBefore']).not.toMatch(/bauda/i);
    expect(lt['compStu.cancellationInfo']).toMatch(/apmokėjimas/);
    expect(lt['compStu.cancellationInfo']).not.toMatch(/bauda/i);
  });
});
