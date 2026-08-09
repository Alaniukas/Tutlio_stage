import { loadLocaleDict } from '../src/lib/i18n/core';

// Production waits for the URL locale before rendering. Component tests mount
// isolated subtrees without main.tsx, so provide the historical LT default in
// the test runtime while keeping production dictionaries code-split.
await loadLocaleDict('lt');
