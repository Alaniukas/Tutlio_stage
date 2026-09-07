import { loadLocaleDict } from '../src/lib/i18n/core';

// LocaleProvider waits for the URL locale before mounting App. Component tests
// mount isolated subtrees without that provider, so provide the LT default in
// the test runtime while keeping production dictionaries code-split.
await loadLocaleDict('lt');
