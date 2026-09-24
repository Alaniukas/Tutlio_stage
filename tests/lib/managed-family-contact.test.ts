import { describe, expect, it } from 'vitest';
import {
  managedFamilyPaymentPayer,
  managedFamilyProvisionScope,
  validateManagedFamilyContact,
} from '@/lib/managedFamilyContact';

describe('managedFamilyContact', () => {
  it('allows student email without parent email', () => {
    expect(validateManagedFamilyContact({
      studentEmail: 'mokinys@example.test',
      parentEmail: '',
      parentName: '',
    })).toBeNull();
  });

  it('requires contact when neither email is present', () => {
    expect(validateManagedFamilyContact({
      studentEmail: '',
      parentEmail: '',
      parentName: '',
    })).toBe('missing_contact');
  });

  it('requires parent name when parent email is present', () => {
    expect(validateManagedFamilyContact({
      studentEmail: '',
      parentEmail: 'tevas@example.test',
      parentName: '',
    })).toBe('missing_parent_name');
  });

  it('derives payment payer and provision scope from contact emails', () => {
    expect(managedFamilyPaymentPayer('mokinys@example.test', '')).toBe('self');
    expect(managedFamilyPaymentPayer('mokinys@example.test', 'tevas@example.test')).toBe('parent');
    expect(managedFamilyProvisionScope('')).toBe('student');
    expect(managedFamilyProvisionScope('tevas@example.test')).toBe('both');
  });
});
