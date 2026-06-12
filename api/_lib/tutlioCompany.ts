/**
 * MB Tutlio company details used as the seller on B2B platform invoices.
 * Registration fields come from env so they can be set without a deploy;
 * empty values are simply omitted from the PDF.
 */
export const TUTLIO_COMPANY = {
  name: 'MB „Tutlio“',
  entityType: 'company',
  companyCode: process.env.TUTLIO_COMPANY_CODE || '307617263',
  vatCode: process.env.TUTLIO_VAT_CODE || '',
  address: process.env.TUTLIO_COMPANY_ADDRESS || 'A. Vivulskio g. 22, LT-03115 Vilnius',
  contactEmail: process.env.TUTLIO_COMPANY_EMAIL || 'info@tutlio.lt',
} as const;
