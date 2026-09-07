import LegalDocumentPage from '@/components/LegalDocumentPage';

export default function TermsOfService() {
  return (
    <LegalDocumentPage
      doc="tos"
      relatedLinks={[
        { to: '/privacy-policy', labelKey: 'legal.privacyPolicy' },
        { to: '/dpa', labelKey: 'legal.dpa' },
      ]}
    />
  );
}
