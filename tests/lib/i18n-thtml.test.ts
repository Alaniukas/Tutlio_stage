import { describe, expect, it } from 'vitest';
import { t, tHtml } from '../../src/lib/i18n/core';

const XSS = '<img src=x onerror=alert(1)>';

describe('tHtml — HTML-escaped interpolation for dangerouslySetInnerHTML sinks', () => {
  it('escapes HTML special characters in interpolated params', () => {
    const out = tHtml('en', 'stuSess.refundSuccessManualTutor', { tutor: XSS });
    expect(out).not.toContain(XSS);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes quotes and ampersands in params', () => {
    const out = tHtml('en', 'stuSess.refundSuccessManualTutor', {
      tutor: `"quoted" & 'single'`,
    });
    expect(out).toContain('&quot;quoted&quot; &amp; &#39;single&#39;');
  });

  it('keeps the translation template markup intact', () => {
    const out = tHtml('en', 'stuSess.refundSuccessManualTutor', { tutor: 'Jonas' });
    expect(out).toContain('<strong>Jonas</strong>');
    expect(out).toContain('<p>');
  });

  it('passes numeric params through unchanged', () => {
    const out = tHtml('en', 'stuSched.cancelFreeNote', { hours: 24 });
    expect(out).toContain('24');
    expect(out).not.toContain('&');
  });

  it('matches t() output when no params are provided', () => {
    expect(tHtml('en', 'stuSess.refundSuccessManualOrg')).toBe(
      t('en', 'stuSess.refundSuccessManualOrg'),
    );
  });

  it('returns the key for unknown translations (same as t)', () => {
    expect(tHtml('en', 'nonexistent.key')).toBe('nonexistent.key');
  });
});

describe('t — plain-text interpolation stays unescaped (React escapes text nodes)', () => {
  it('does not HTML-escape params', () => {
    const out = t('en', 'stuSess.refundSuccessManualTutor', { tutor: 'A & B' });
    expect(out).toContain('A & B');
  });
});
