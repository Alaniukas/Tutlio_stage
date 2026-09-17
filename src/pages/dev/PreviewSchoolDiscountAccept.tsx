import SchoolDiscountAccept, { type AgreementPreview } from '@/pages/SchoolDiscountAccept';

const preview: AgreementPreview = {
  status: 'pending',
  alreadyAccepted: false,
  agreementNumber: 'NPR-20260917-DEMO01',
  contractNumber: 'LV-2026-00142',
  schoolName: 'VšĮ „Laisvi vaikai“',
  studentName: 'Jonas Jonaitis',
  parentName: 'Jonas Jonaitis mokėtojas',
  activityLabel: 'Matematika 8 kl. - mokytojas Gintaras',
  discountType: 'percent',
  discountValue: 25,
  validFrom: '2026-09-01',
  validUntil: '2027-06-30',
  note: 'Socialinė nuolaida 2026-2027 mokslo metams.',
};

export default function PreviewSchoolDiscountAccept() {
  return <SchoolDiscountAccept previewFixture={preview} />;
}
