export const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.8-flash';

export function resolveGeminiTextModel(): string {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_TEXT_MODEL).trim();
}
