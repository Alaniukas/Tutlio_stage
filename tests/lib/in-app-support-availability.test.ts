import { describe, expect, it } from 'vitest';
import { IN_APP_SUPPORT_ENABLED } from '../../src/lib/inAppSupportAvailability';

describe('signed-in support agent rollout', () => {
  it('stays visible in local development so dashboard placement can be tested', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(IN_APP_SUPPORT_ENABLED).toBe(true);
  });
});
