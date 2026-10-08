import { clearOrgBrandingCache } from '@/contexts/OrgBrandingContext';
import { clearStudentPolicyCache } from '@/contexts/StudentPolicyContext';
import { invalidateCache } from '@/lib/dataCache';
import { buildPlatformPath } from '@/lib/platform';
import { setLastRolePortal } from '@/lib/account-portal';

export function clearTutorEnvironmentState() {
  clearOrgBrandingCache();
  clearStudentPolicyCache();
  invalidateCache();
}

export function reloadAccountEnvironment(path?: string) {
  clearTutorEnvironmentState();
  if (path) window.location.replace(buildPlatformPath(path));
  else window.location.reload();
}

export function reloadTutorEnvironment() {
  setLastRolePortal('tutor');
  reloadAccountEnvironment('/dashboard');
}
