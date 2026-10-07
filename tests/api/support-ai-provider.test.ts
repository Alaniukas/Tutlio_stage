import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeSupportAiProvider,
  supportAiProviderOptions,
} from '../../api/_lib/supportAiProvider';

describe('support AI provider', () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => vi.unstubAllEnvs());

  it('prefers gemini when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-gemini';
    process.env.OPENAI_API_KEY = 'test-openai';
    expect(activeSupportAiProvider()).toBe('gemini');
  });

  it('falls back to openai when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-openai';
    expect(activeSupportAiProvider()).toBe('openai');
  });

  it('returns null when no provider key is configured', () => {
    expect(activeSupportAiProvider()).toBeNull();
  });

  it('builds gemini provider options', () => {
    expect(supportAiProviderOptions({ provider: 'gemini', reasoningEffort: 'low' })).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'low' } },
    });
  });

  it('builds openai provider options with safety identifier', () => {
    expect(supportAiProviderOptions({
      provider: 'openai',
      safetyIdentifier: 'support_user_1',
      reasoningEffort: 'low',
    })).toMatchObject({
      openai: {
        reasoningEffort: 'low',
        safetyIdentifier: 'support_user_1',
        store: false,
      },
    });
  });
});
