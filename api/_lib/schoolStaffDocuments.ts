import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { hasDocxConverterEnv, waitForDocxConverterReady } from './docxConverter.js';
import { renderDocxTemplateBufferToPdfBuffer } from './renderSchoolContractDocxToPdf.js';
import { isStaffDocumentsOrg, LAISVI_VAIKIAI_ORG_ID } from '../../src/lib/marketMoney.js';

export type StaffDocumentType = 'confidentiality' | 'consent';
export type ConsentAnswer = 'yes' | 'no';
export const STAFF_CONSENT_QUESTION_COUNT = 10;
export const STAFF_DOCUMENT_RETENTION_DAYS = 30;
/** Agreement template is ~2 MB; confidentiality bundle converts agreement + annex sequentially. */
export const STAFF_DOCX_TIMEOUT_MS = 120000;

// The bundled legal templates in this first rollout explicitly name Laisvi vaikai.
// Demo Mokykla reuses them for QA; other orgs fail closed until they provide templates.
export const STAFF_TEMPLATE_ORG_ID = LAISVI_VAIKIAI_ORG_ID;
export { isStaffDocumentsOrg, staffDocumentsFeatureEnabled } from '../../src/lib/marketMoney.js';

export function isStaffDocumentType(value: unknown): value is StaffDocumentType {
  return value === 'confidentiality' || value === 'consent';
}

export function staffTemplateNames(type: StaffDocumentType): string[] {
  return type === 'confidentiality'
    ? ['confidentiality-agreement.docx', 'confidentiality-annex.docx']
    : ['staff-consent.docx'];
}

export function validateConsentAnswers(value: unknown): ConsentAnswer[] | null {
  if (!Array.isArray(value) || value.length !== STAFF_CONSENT_QUESTION_COUNT) return null;
  if (!value.every((answer) => answer === 'yes' || answer === 'no')) return null;
  return value as ConsentAnswer[];
}

export function staffDocumentStatus(row: {
  signing_status?: string | null;
  sent_at?: string | null;
  staff_viewed_at?: string | null;
  staff_revoked_at?: string | null;
}): 'draft' | 'sent' | 'viewed' | 'signed' | 'revoked' {
  if (row.staff_revoked_at) return 'revoked';
  if (row.signing_status === 'signed') return 'signed';
  if (row.staff_viewed_at) return 'viewed';
  if (row.sent_at) return 'sent';
  return 'draft';
}

export function staffFilesDeleteAt(signedAt: string): string {
  const date = new Date(signedAt);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid signing date');
  return new Date(date.getTime() + STAFF_DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function staffPdfPathsForRetention(paths: string[], folder: string): string[] {
  return paths.filter((path) => path.startsWith(`${folder}/`) && path.toLowerCase().endsWith('.pdf'));
}

/** Temporary private object — not a DB column — so the employee form does not re-ask. */
export function staffPersonalDetailsStoragePath(organizationId: string, confidentialityId: string): string {
  return `${organizationId}/contracts/${confidentialityId}/staff-personal-details.json`;
}

export function encodeStaffPersonalDetails(details: { address: string; personalCode: string }): Buffer {
  return Buffer.from(JSON.stringify({ address: details.address, personalCode: details.personalCode }), 'utf8');
}

export function parseStoredStaffPersonalDetails(raw: unknown): { address: string; personalCode: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  return validateStaffPersonalDetails(raw as { address?: unknown; personalCode?: unknown });
}

function templateBytes(name: string): Buffer {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'templates', 'staff', name),
    join(process.cwd(), 'api', '_lib', 'templates', 'staff', name),
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`Staff document template is missing: ${name}`);
  return readFileSync(found);
}

export interface StaffTemplateFields {
  name: string;
  employmentContractNumber: string;
  employmentContractDate: string;
  date: Date;
  address?: string;
  personalCode?: string;
}

export function validateStaffPersonalDetails(value: {
  address?: unknown;
  personalCode?: unknown;
}): { address: string; personalCode: string } | null {
  const address = typeof value.address === 'string' ? value.address.trim().replace(/\s+/g, ' ') : '';
  const personalCode = typeof value.personalCode === 'string' ? value.personalCode.trim() : '';
  if (address.length < 5 || address.length > 300 || !/^\d{11}$/.test(personalCode)) return null;
  return { address, personalCode };
}

export function formatStaffSigningDate(date: Date): string {
  return new Intl.DateTimeFormat('lt-LT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Vilnius',
  }).format(date);
}

export function staffTemplatePayload(fields: StaffTemplateFields): Record<string, string> {
  const date = fields.date;
  const monthDay = new Intl.DateTimeFormat('lt-LT', { month: 'long', day: 'numeric', timeZone: 'Europe/Vilnius' })
    .format(date).replace(/\s*d\.\s*$/i, '');
  return {
    darbuotojo_vardas_pavardė: fields.name,
    darbuotojo_adresas: fields.address || '',
    darbuotojo_asmens_kodas: fields.personalCode || '',
    'darbo_sutarties_nr.': fields.employmentContractNumber,
    darbo_sutarties_data: fields.employmentContractDate,
    metai: new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Europe/Vilnius' }).format(date),
    mėnuo_diena: monthDay,
    'pasirašymo data': formatStaffSigningDate(date),
  };
}

export async function renderStaffDocumentPdf(
  type: StaffDocumentType,
  fields: StaffTemplateFields,
  consentAnswers?: ConsentAnswer[] | null,
  preview = false,
): Promise<Buffer> {
  const payload = staffTemplatePayload(fields);
  if (type === 'consent') {
    const answers = validateConsentAnswers(consentAnswers);
    if (!answers && !preview) throw new Error('All ten consent choices are required');
    for (let index = 0; index < STAFF_CONSENT_QUESTION_COUNT; index += 1) {
      payload[`choice_${index + 1}`] = preview
        ? 'SUTINKU / NESUTINKU'
        : answers?.[index] === 'yes' ? 'SUTINKU' : 'NESUTINKU';
    }
    if (hasDocxConverterEnv()) await waitForDocxConverterReady();
    return renderDocxTemplateBufferToPdfBuffer({
      templateBytes: templateBytes(staffTemplateNames(type)[0]),
      payload,
      timeoutMs: STAFF_DOCX_TIMEOUT_MS,
    });
  }

  if (!validateStaffPersonalDetails(fields)) {
    throw new Error('Employee address and 11-digit personal code are required for the agreement and annex');
  }

  const combined = await PDFDocument.create();
  // The hosted converter can fail when multiple large staff templates arrive
  // together. Convert the agreement and annex one at a time in PDF page order.
  for (const name of staffTemplateNames(type)) {
    if (hasDocxConverterEnv()) await waitForDocxConverterReady();
    const part = await renderDocxTemplateBufferToPdfBuffer({
      templateBytes: templateBytes(name),
      payload,
      timeoutMs: STAFF_DOCX_TIMEOUT_MS,
    });
    const source = await PDFDocument.load(part);
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }
  return Buffer.from(await combined.save());
}
