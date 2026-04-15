import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { FEATURE_REGISTRY } from '@/lib/featureRegistry';
import { parseOrgContactVisibility, type OrgContactVisibility } from '@/lib/orgContactVisibility';

interface OrgFeaturesState {
  loading: boolean;
  organizationId: string | null;
  features: Record<string, boolean>;
  hasFeature: (featureId: string) => boolean;
  isOrgUser: boolean;
  contactVisibility: OrgContactVisibility | null;
}

/**
 * Hook to check organization features
 *
 * Usage:
 * const { loading, hasFeature } = useOrgFeatures();
 * if (hasFeature('custom_branding')) { ... }
 */
export function useOrgFeatures(): OrgFeaturesState {
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [rawFeatures, setRawFeatures] = useState<Record<string, unknown> | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadFeatures() {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRawFeatures(null);
          setLoading(false);
          return;
        }

        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (!profile?.organization_id) {
          setRawFeatures(null);
          setLoading(false);
          return;
        }

        setOrganizationId(profile.organization_id);

        // Get organization features
        const { data: org } = await supabase
          .from('organizations')
          .select('features')
          .eq('id', profile.organization_id)
          .single();

        if (!org) {
          setRawFeatures(null);
          setLoading(false);
          return;
        }

        setRawFeatures((org.features as Record<string, unknown>) ?? {});

        // Merge organization features with defaults from registry
        const mergedFeatures: Record<string, boolean> = {};

        Object.entries(FEATURE_REGISTRY).forEach(([featureId, definition]) => {
          // Use org feature if set, otherwise use default from registry
          mergedFeatures[featureId] = org.features?.[featureId] ?? definition.defaultValue;
        });

        setFeatures(mergedFeatures);
      } catch (error) {
        console.error('Error loading org features:', error);
      } finally {
        setLoading(false);
      }
    }

    loadFeatures();
  }, []);

  const hasFeature = (featureId: string): boolean => {
    return features[featureId] ?? false;
  };

  const contactVisibility = useMemo(() => {
    if (!organizationId || !rawFeatures) return null;
    return parseOrgContactVisibility(rawFeatures);
  }, [organizationId, rawFeatures]);

  return {
    loading,
    organizationId,
    features,
    hasFeature,
    isOrgUser: organizationId !== null,
    contactVisibility,
  };
}

/**
 * Hook to check a specific feature for an organization
 * Useful when you need to check features for a different org (e.g., in admin panel)
 */
export function useOrgFeature(organizationId: string | null, featureId: string) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    async function checkFeature() {
      if (!organizationId) {
        setLoading(false);
        return;
      }

      try {
        const { data: org } = await supabase
          .from('organizations')
          .select('features')
          .eq('id', organizationId)
          .single();

        if (!org) {
          setLoading(false);
          return;
        }

        const featureDef = FEATURE_REGISTRY[featureId];
        const isEnabled = org.features?.[featureId] ?? featureDef?.defaultValue ?? false;

        setEnabled(isEnabled);
      } catch (error) {
        console.error('Error checking org feature:', error);
      } finally {
        setLoading(false);
      }
    }

    checkFeature();
  }, [organizationId, featureId]);

  return { loading, enabled };
}
