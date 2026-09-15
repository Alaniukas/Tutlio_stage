export function monthlyPackageErrorI18nKey(error: string): string | null {
  if (error.trim().toLowerCase() === 'student not found') return 'compStu.packageStudentNotFound';
  return null;
}

export function monthlyPackageErrorMessage(error: string, t: (key: string) => string): string {
  const key = monthlyPackageErrorI18nKey(error);
  return key ? t(key) : error;
}
