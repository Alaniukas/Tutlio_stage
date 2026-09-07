import LegalDocumentPage from '@/components/LegalDocumentPage';

export default function DataProcessingAgreement() {
  return (
    <LegalDocumentPage
      doc="dpa"
      maxWidthClassName="max-w-4xl"
      showPrintButton
      relatedLinks={[
        { to: '/privacy-policy', labelKey: 'legal.privacyPolicy' },
        { to: '/terms', labelKey: 'legal.termsOfService' },
      ]}
    />
  );
}
