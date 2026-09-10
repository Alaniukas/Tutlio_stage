import { expect, it } from 'vitest';
import { studentRegistrationDetails } from '../../api/_lib/studentRegistrationDetails';

it('keeps administrator-entered contacts, class and payer when onboarding omits them', () => {
  const student = { full_name: 'Emilija', phone: '+37012345678', age: 12, grade: '7', payment_payer: 'parent', payer_name: 'Renata', payer_email: 'parent@example.test', payer_phone: '+37087654321' };
  expect(studentRegistrationDetails({ grade: '', payerName: null }, student)).toMatchObject(student);
  expect(studentRegistrationDetails({ fullName: 'Emilija Jaugaitė', grade: '8', payerType: 'self' }, student))
    .toMatchObject({ full_name: 'Emilija Jaugaitė', grade: '8', payment_payer: 'self', payer_email: 'parent@example.test' });
});
