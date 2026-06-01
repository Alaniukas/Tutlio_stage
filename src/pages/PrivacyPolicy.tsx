import LegalDocumentPage from '@/components/LegalDocumentPage';

export default function PrivacyPolicy() {
  return (
    <LegalDocumentPage
      doc="priv"
      relatedLinks={[
        { to: '/terms', labelKey: 'legal.termsOfService' },
        { to: '/dpa', labelKey: 'legal.dpa' },
      ]}
    />
  );
}
