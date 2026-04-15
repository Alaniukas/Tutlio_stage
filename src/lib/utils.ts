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
