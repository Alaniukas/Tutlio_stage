import { FEATURE_REGISTRY } from '../../src/lib/featureRegistry.js';
import {
  inAppSupportFeaturePermission,
  inAppSupportFeaturePortals,
} from './inAppSupportCustomerContext.js';

export interface InAppSupportKnowledgeDocument {
  knowledgeKey: string;
  title: string;
  content: string;
  portals: string[];
  entityTypes: string[];
  featureId: string | null;
  requiredPermission: string | null;
}

const CORE_DOCUMENTS: InAppSupportKnowledgeDocument[] = [
  {
    knowledgeKey: 'core:tutor-calendar',
    title: 'Tutor calendar and lessons',
    content: 'Tutors use their calendar to manage their own availability and lessons. Organization-specific rules can restrict lesson creation, status changes, cancellation, payment handling, or other actions, so those verified rules always override this general behavior.',
    portals: ['tutor'],
    entityTypes: [],
    featureId: null,
    requiredPermission: null,
  },
  {
    knowledgeKey: 'core:student-parent-access',
    title: 'Student and parent access boundaries',
    content: 'Students see their own records. Parents see records for linked children. Booking, rescheduling, cancellation, payments, recordings, and school-specific actions depend on the exact organization rules and enabled functions supplied with the support request.',
    portals: ['student', 'parent'],
    entityTypes: [],
    featureId: null,
    requiredPermission: null,
  },
  {
    knowledgeKey: 'core:organization-permissions',
    title: 'Organization administrator permissions',
    content: 'Organization administrators can only view or change the areas granted by their active administration role and permission map. The support agent must not assume owner-level access for an administrator with a custom, admin, or accountant role.',
    portals: ['organization'],
    entityTypes: ['company', 'school'],
    featureId: null,
    requiredPermission: null,
  },
];

export function buildInAppSupportKnowledgeDocuments(): InAppSupportKnowledgeDocument[] {
  const features = Object.values(FEATURE_REGISTRY).map((feature): InAppSupportKnowledgeDocument => ({
    knowledgeKey: `feature:${feature.id}`,
    title: feature.nameEn,
    content: [
      `Function ID: ${feature.id}`,
      `English behavior: ${feature.descriptionEn}`,
      `Lithuanian behavior: ${feature.description}`,
      'This function may be described as available only when the verified customer context includes this exact function ID.',
    ].join('\n'),
    portals: [...inAppSupportFeaturePortals(feature.id)],
    entityTypes: feature.id.startsWith('school_') ? ['school'] : [],
    featureId: feature.id,
    requiredPermission: inAppSupportFeaturePermission(feature.id),
  }));
  return [...CORE_DOCUMENTS, ...features];
}
