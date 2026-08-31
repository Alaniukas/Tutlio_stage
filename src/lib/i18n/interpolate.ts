/** Replace source placeholders once. Dollar signs and placeholder-looking user
 * text are literal values, never replacement syntax or a second template. */
export function interpolateTranslation(
  text: string,
  params?: Record<string, string | number>,
  format: (value: string) => string = (value) => value,
): string {
  if (!params) return text;
  return text.replace(/\{([a-zA-Z_][a-zA-Z_0-9]*)\}/g, (placeholder, key: string) =>
    Object.hasOwn(params, key) ? format(String(params[key])) : placeholder,
  );
}
