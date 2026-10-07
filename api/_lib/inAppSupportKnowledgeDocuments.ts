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
    knowledgeKey: 'guide:school-recording-chats',
    title: 'Where to find recorded lesson chats',
    content: 'Open Recordings in the signed-in portal: /recordings for teachers, /school/recordings for school administrators, /student/recordings for students, or /parent/recordings for parents. Choose the class or individual subject. A matching Google Meet written-chat file appears below its video as Chat history (Pokalbio išklotinė in Lithuanian). Supported saved files include .sbv, .txt and plain-text Drive files without an extension whose names end in “– Chat” or “– Chat transcript”. Open that section to read the messages. Matching files in the already assigned private Drive folder appear automatically; the teacher, student and parent do not enable another setting. The school administrator assigns the folder and the Google service account must already have access. This is the written meeting chat, not a speech transcript. Tutlio cannot create a missing Google chat file or recover a chat Google did not save. Only retained videos and their matching, downloadable chat files are shown. If the video appears but Chat history is absent, explain the expected location, then offer team review of the saved file and its association with the video. Do not keep asking impact or frequency questions instead of answering where the chat should appear.',
    portals: ['organization', 'tutor', 'student', 'parent'],
    entityTypes: ['school'],
    featureId: 'school_lesson_recordings',
    requiredPermission: 'recordings.view',
  },
  {
    knowledgeKey: 'guide:company-payments',
    title: 'Organization payments report',
    content: 'Company administrators with finance.view can open Payments at /company/payments. It combines customer invoices, trial payments and lesson packages, with date, payment type, status, tutor and search filters. The date basis can be issue/order date or payment date. CSV and Excel export every filtered row. First lesson, lesson counts, trial payment and first paid package show the student\'s full history. Historical payment dates that were never saved stay blank. Tutor remuneration invoices are excluded.',
    portals: ['organization'],
    entityTypes: ['company'],
    featureId: null,
    requiredPermission: 'finance.view',
  },
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

/** Packaged with the API, so every deployment uses its own current guides. */
export function deployedInAppSupportGuides(customer: {
  portal: string;
  entityType: string | null;
  enabledFeatureIds: string[];
  allowedPermissions: string[];
}): InAppSupportKnowledgeDocument[] {
  return CORE_DOCUMENTS.filter((document) =>
    document.portals.includes(customer.portal)
    && (!document.entityTypes.length || (customer.entityType !== null && document.entityTypes.includes(customer.entityType)))
    && (!document.featureId || customer.enabledFeatureIds.includes(document.featureId))
    && (customer.portal !== 'organization' || !document.requiredPermission
      || customer.allowedPermissions.includes(document.requiredPermission)));
}

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
