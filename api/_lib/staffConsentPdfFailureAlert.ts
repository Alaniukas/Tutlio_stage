import type { SupabaseClient } from '@supabase/supabase-js';
import { sendInternalEmail } from './schoolContractSigning.js';
import { staffConsentPdfAlertPath } from './schoolStaffDocuments.js';
import { SCHOOL_CONTRACTS_BUCKET } from './schoolContractPdfPath.js';

export const STAFF_CONSENT_PDF_ALERT_EMAIL = 'alaniukasa@gmail.com';

export type StaffConsentPdfFailureSource = 'employee_submit' | 'cron_retry';

export interface StaffConsentPdfFailureAlertInput {
  organizationId: string;
  consentId: string;
  employeeName: string;
  schoolName: string;
  contractNumber: string;
  source: StaffConsentPdfFailureSource;
}

function appOrigin(): string {
  return (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
}

async function alertAlreadySent(
  supabase: SupabaseClient,
  organizationId: string,
  consentId: string,
): Promise<boolean> {
  const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
    .download(staffConsentPdfAlertPath(organizationId, consentId));
  return !error && Boolean(data);
}

/** One alert per consent document so cron retries do not spam the inbox. */
export async function notifyStaffConsentPdfFailure(
  supabase: SupabaseClient,
  input: StaffConsentPdfFailureAlertInput,
): Promise<boolean> {
  if (await alertAlreadySent(supabase, input.organizationId, input.consentId)) return false;
  const origin = appOrigin();
  const sent = await sendInternalEmail(origin, 'school_staff_consent_pdf_failed', STAFF_CONSENT_PDF_ALERT_EMAIL, {
    employeeName: input.employeeName,
    schoolName: input.schoolName,
    contractNumber: input.contractNumber,
    consentId: input.consentId,
    source: input.source,
    adminUrl: `${origin}/school/staff-documents`,
  });
  if (!sent) {
    console.error('[school-staff-consent] pdf failure alert email not sent', input.consentId);
    return false;
  }
  const { error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(
    staffConsentPdfAlertPath(input.organizationId, input.consentId),
    Buffer.from(JSON.stringify({ notifiedAt: new Date().toISOString(), source: input.source }), 'utf8'),
    { contentType: 'application/json', upsert: true },
  );
  if (error) {
    console.error('[school-staff-consent] pdf failure alert marker failed', error.message || 'unknown');
  }
  return true;
}
