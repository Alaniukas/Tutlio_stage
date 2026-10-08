export type TutorEnvironment = {
  tutorId: string;
  organizationId: string;
  organizationName: string;
  email: string;
};

export type TutorEnvironmentErrorCode =
  | 'failed' | 'unauthorized' | 'notTutor'
  | 'sameAccount' | 'sameCompany' | 'notLinked' | 'mfaRequired' | 'setupRequired';

export class TutorEnvironmentError extends Error {
  constructor(public code: TutorEnvironmentErrorCode) {
    super(code);
  }
}
