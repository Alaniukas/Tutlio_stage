import {
  createGoogleGenerativeAI,
  type GoogleLanguageModelOptions,
} from '@ai-sdk/google';
import { openai, type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { resolveGeminiTextModel } from './geminiConfig.js';

export const SUPPORT_OPENAI_MODEL = 'gpt-5.6-luna';

export type SupportAiProvider = 'gemini' | 'openai';

export function activeSupportAiProvider(): SupportAiProvider | null {
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';
  return null;
}

function geminiModel() {
  const google = createGoogleGenerativeAI({
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
  });
  return google(resolveGeminiTextModel());
}

export function supportAiModel(provider: SupportAiProvider) {
  return provider === 'gemini' ? geminiModel() : openai.responses(SUPPORT_OPENAI_MODEL);
}

export function supportAiProviderOptions(input: {
  provider: SupportAiProvider;
  safetyIdentifier?: string;
  reasoningEffort?: 'low' | 'medium';
}) {
  if (input.provider === 'gemini') {
    return {
      google: {
        thinkingConfig: {
          thinkingLevel: input.reasoningEffort === 'medium' ? 'medium' : 'low',
        },
      } satisfies GoogleLanguageModelOptions,
    };
  }
  return {
    openai: {
      reasoningEffort: input.reasoningEffort || 'low',
      reasoningSummary: null,
      store: false,
      textVerbosity: 'low',
      ...(input.safetyIdentifier ? { safetyIdentifier: input.safetyIdentifier } : {}),
    } satisfies OpenAILanguageModelResponsesOptions,
  };
}
