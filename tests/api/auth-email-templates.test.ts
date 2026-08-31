import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTH_EMAIL_LOCALES, AUTH_EMAIL_TEMPLATE_LIMITS, generateAuthEmailTemplates, renderAuthEmail } from '../../api/_lib/authEmailTemplates';
import { AUTH_EMAIL_COPY } from '../../src/lib/i18n/authEmailCopy';
import { htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';

describe('confirmation and recovery email artifacts', () => {
  it.each(AUTH_EMAIL_LOCALES)('%s renders readable, correctly directed emails with the original action URL', (locale) => {
    for (const kind of ['confirmation', 'recovery'] as const) {
      const link = 'https://example.supabase.co/auth/v1/verify?token=example&type=email&redirect_to=https%3A%2F%2Fwww.tutlio.com';
      const doc = new DOMParser().parseFromString(renderAuthEmail(locale, kind, link), 'text/html');
      expect(doc.documentElement.lang).toBe(htmlLanguageCode(locale));
      expect(doc.documentElement.dir).toBe(localeDirection(locale));
      expect(doc.querySelectorAll('a')).toHaveLength(1);
      expect(doc.querySelector('a')?.getAttribute('href')).toBe(link);
      expect(doc.querySelector('h1')?.textContent?.trim()).toBeTruthy();
      expect(doc.body.textContent).not.toContain('undefined');
      expect(doc.querySelector('script')).toBeNull();
    }
    expect(AUTH_EMAIL_COPY[locale].confirmTitle).not.toBe(AUTH_EMAIL_COPY[locale].resetTitle);
  });

  it('keeps all four checked-in Supabase templates synchronized with the reviewed source', () => {
    for (const [name, content] of Object.entries(generateAuthEmailTemplates())) {
      expect(readFileSync(`supabase/email-templates/${name}`, 'utf8')).toBe(content);
      if (name.endsWith('.html')) {
        expect(content.match(/href="\{\{ \.ConfirmationURL \}\}"/g)).toHaveLength(1);
        expect(content).not.toContain('.Data.full_name');
      }
    }
  });

  it('fits the hosted dashboard limits while keeping every body language and safe subject fallbacks', () => {
    for (const [name, content] of Object.entries(generateAuthEmailTemplates())) {
      const isBody = name.endsWith('.html');
      expect(new TextEncoder().encode(content).length).toBeLessThanOrEqual(
        isBody ? AUTH_EMAIL_TEMPLATE_LIMITS.body : AUTH_EMAIL_TEMPLATE_LIMITS.subject,
      );
      if (isBody) {
        expect(content.match(/<!DOCTYPE html>/g)).toHaveLength(1);
        for (const locale of AUTH_EMAIL_LOCALES.filter((locale) => locale !== 'en')) {
          expect(content).toContain(`eq $locale "${locale}"`);
        }
      } else {
        expect(content).toContain('(not .Data.locale)');
        expect(content).toContain('eq .Data.locale "lt"');
        expect(content).toContain('eq .Data.locale "pl"');
        expect(content).toContain(name.startsWith('confirm') ? AUTH_EMAIL_COPY.en.confirmTitle : AUTH_EMAIL_COPY.en.resetTitle);
        expect(content).not.toMatch(/\{\{\s*\.Data\.[\w]+\s*\}\}/);
      }
    }
  });
});
