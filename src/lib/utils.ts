import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function formatLithuanianPhone(value: string): string {
  if (!value) return '';
  if (value === '+370' || value === '+37' || value === '+3' || value === '+') {
    return '+370 ';
  }

  // Keep only digits and the plus sign
  let cleaned = value.replace(/[^\d+]/g, '');

  // Handle common local format "86..." or international format
  if (cleaned.startsWith('86')) {
    cleaned = '+3706' + cleaned.slice(2);
  } else if (!cleaned.startsWith('+370')) {
    // If it doesn't start with +370, force it to.
    cleaned = '+370' + cleaned.replace(/\D/g, '');
  }

  // Extract the part after +370
  let body = cleaned.slice(4).replace(/\D/g, '');

  // Lithuanian numbers have 8 digits after country code
  if (body.length > 8) {
    body = body.slice(0, 8);
  }

  return body ? `+370 ${body}` : '+370 ';
}

/** Validates that the phone is in +370 format: +370 followed by exactly 8 digits (11 digits total). */
export function validateLithuanianPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('370') && cleaned.length === 11;
}

/** Keeps an international phone number in a compact E.164-style form. */
export function formatInternationalPhone(value: string): string {
  if (!value) return '';
  const hasLeadingPlus = value.trimStart().startsWith('+');
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return hasLeadingPlus ? '+' : '';
  return `${hasLeadingPlus ? '+' : ''}${digits}`;
}

/** Validates an international number with a country code (7–15 digits). */
export function validateInternationalPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const compact = phone.trim().replace(/[\s().-]/g, '');
  return /^\+\d{7,15}$/.test(compact);
}

export function formatLocalizedPhone(value: string, locale: string): string {
  return locale.toLowerCase().startsWith('lt')
    ? formatLithuanianPhone(value)
    : formatInternationalPhone(value);
}

export function validateLocalizedPhone(phone: string, locale: string): boolean {
  return locale.toLowerCase().startsWith('lt')
    ? validateLithuanianPhone(phone)
    : validateInternationalPhone(phone);
}

const PHONE_PLACEHOLDERS: Record<string, string> = {
  lt: '+370 600 00000',
  en: '+44 7700 900000',
  pl: '+48 600 000 000',
  lv: '+371 20 000 000',
  ee: '+372 5000 0000',
  fr: '+33 6 00 00 00 00',
  es: '+34 600 000 000',
  de: '+49 151 00000000',
  se: '+46 70 000 00 00',
  dk: '+45 20 00 00 00',
  fi: '+358 40 000 0000',
  no: '+47 400 00 000',
  nl: '+31 6 00000000',
};

export function getLocalizedPhonePlaceholder(locale: string): string {
  return PHONE_PLACEHOLDERS[locale.toLowerCase()] ?? '+34 600 000 000';
}
