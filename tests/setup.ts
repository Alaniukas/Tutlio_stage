// Keep unit tests independent of developer-specific .env files. These are
// deliberately non-routable placeholders; tests that need Supabase mock it.
process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key';

// LocaleProvider waits for the URL locale before mounting App. Component tests
// mount isolated subtrees without that provider, so provide the LT default in
// the test runtime while keeping production dictionaries code-split.
const { loadLocaleDict } = await import('../src/lib/i18n/core');
await loadLocaleDict('lt');
