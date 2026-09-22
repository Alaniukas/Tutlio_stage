import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { renderDocxTemplateBufferToPdfBuffer } from './renderSchoolContractDocxToPdf.js';

export type StaffDocumentType = 'confidentiality' | 'consent';
export type ConsentAnswer = 'yes' | 'no';
export const STAFF_CONSENT_QUESTION_COUNT = 10;
export const STAFF_DOCUMENT_RETENTION_DAYS = 30;
// The bundled legal templates in this first rollout explicitly name this school.
// Fail closed for other organizations until they provide their own templates.
export const STAFF_TEMPLATE_ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

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
}

export function staffTemplatePayload(fields: StaffTemplateFields): Record<string, string> {
  const date = fields.date;
  const monthDay = new Intl.DateTimeFormat('lt-LT', { month: 'long', day: 'numeric', timeZone: 'Europe/Vilnius' })
    .format(date).replace(/\s*d\.\s*$/i, '');
  return {
    darbuotojo_vardas_pavardė: fields.name,
    'darbo_sutarties_nr.': fields.employmentContractNumber,
    darbo_sutarties_data: fields.employmentContractDate,
    metai: new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Europe/Vilnius' }).format(date),
    mėnuo_diena: monthDay,
    // The school and employee may sign on different days. The actual dates are
    // recorded in their electronic signature certificates, not prefilled here.
    'pasirašymo data': '',
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
    return renderDocxTemplateBufferToPdfBuffer({
      templateBytes: templateBytes(staffTemplateNames(type)[0]),
      payload,
    });
  }

  const parts = await Promise.all(staffTemplateNames(type).map((name) =>
    renderDocxTemplateBufferToPdfBuffer({ templateBytes: templateBytes(name), payload }),
  ));
  const combined = await PDFDocument.create();
  for (const part of parts) {
    const source = await PDFDocument.load(part);
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }
  return Buffer.from(await combined.save());
}
