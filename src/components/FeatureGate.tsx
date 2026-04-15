import { ReactNode } from 'react';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Component that conditionally renders children based on organization feature flags
 *
 * Usage:
 * <FeatureGate feature="custom_branding">
 *   <CustomBrandingSettings />
 * </FeatureGate>
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { loading, hasFeature } = useOrgFeatures();

  if (loading) {
    return null; // or a loading spinner
  }

  if (!hasFeature(feature)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Hook-based alternative - use this in components that need more control
 *
 * Example:
 * const { hasFeature } = useOrgFeatures();
 *
 * if (hasFeature('custom_branding')) {
 *   // show custom branding options
 * }
 */
