import { FEATURE_REGISTRY } from '../../src/lib/featureRegistry.js';
import {
  buildStudentContactsNavigationReply,
  isStudentContactsNavigationQuestion,
} from '../../src/lib/supportNavigationLanguage.js';
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
    content: 'Open Recordings from the left menu (Įrašai for Lithuanian school users). Teachers use their tutor sidebar; school administrators use the school admin sidebar; students and parents use their own portal sidebars. Choose the class group or individual subject. A matching Google Meet written-chat file appears below its video as Chat history (Pokalbio išklotinė in Lithuanian). Supported saved files include .sbv, .txt and plain-text Drive files without an extension whose names end in “– Chat” or “– Chat transcript”; the matching video may end in “– Recording”. Open that section to read the messages. Matching downloadable files in the already assigned private Drive folder appear automatically; the teacher, student and parent do not enable another Tutlio setting. The school administrator assigns the folder and the Google service account must already have access. Google Drive can allow videos while setting capabilities.canDownload=false on the separate chat files. In that case Tutlio withholds the chat text. The Drive file owner or Workspace administrator must review the chat files’ download restrictions and the existing server service account’s permission. Folder visibility alone does not prove chat content is downloadable. Do not claim that the user’s files are missing or have been privately inspected without a scoped check. This is the written meeting chat, not a speech transcript. Tutlio cannot create a missing Google chat file or recover a chat Google did not save. Only retained videos and their matching, downloadable chat files are shown. If the video appears but Chat history is absent, explain the expected location and these file-specific checks, then offer team review of the saved file and its association with the video. Do not keep asking impact or frequency questions instead of answering where the chat should appear.',
    portals: ['organization', 'tutor', 'student', 'parent'],
    entityTypes: ['school'],
    featureId: 'school_lesson_recordings',
    requiredPermission: 'recordings.view',
  },
  {
    knowledgeKey: 'guide:company-payments',
    title: 'Organization payments report',
    content: 'Company administrators with finance.view can open Payments from the left menu (Mokėjimai in Lithuanian). It combines customer invoices, trial payments and lesson packages, with date, payment type, status, tutor and search filters. The date basis can be issue/order date or payment date. CSV and Excel export every filtered row. First lesson, lesson counts, trial payment and first paid package show the student\'s full history. Historical payment dates that were never saved stay blank. Tutor remuneration invoices are excluded.',
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
    knowledgeKey: 'guide:student-contacts',
    title: 'Where to find student and payer contacts',
    content: 'Open Students from the left menu (Mokiniai in Lithuanian). Select the student from the list to open their profile card. Contact details such as the student email, payer or parent email, phone numbers, and notes are shown on that card. Organization administrators use the same Students area in the school or company admin sidebar. Parents and students do not edit another person\'s contact list here; they see contacts relevant to their own account or linked children.',
    portals: ['organization', 'tutor'],
    entityTypes: ['company', 'school'],
    featureId: null,
    requiredPermission: 'students.view',
  },
  {
    knowledgeKey: 'guide:tutor-student-contacts',
    title: 'Where tutors find student contacts',
    content: 'Open Students from the left menu (Mokiniai in Lithuanian), choose the student, and read the contact fields on the opened profile card. This is the normal place for student email, payer contact details, and phone numbers.',
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

/** Short navigation answer when the model turn fails but bundled guides cover the question. */
export function buildInAppSupportGuideFallbackReply(input: {
  customer: {
    portal: string;
    entityType: string | null;
    enabledFeatureIds: string[];
    allowedPermissions: string[];
  };
  locale: string;
  query: string;
}): string | null {
  if (!isStudentContactsNavigationQuestion(input.query)) return null;
  const guides = deployedInAppSupportGuides(input.customer);
  const knowledgeKey = input.customer.portal === 'tutor'
    ? 'guide:tutor-student-contacts'
    : 'guide:student-contacts';
  if (!guides.some((document) => document.knowledgeKey === knowledgeKey)) return null;
  const entityType = input.customer.entityType === 'school' ? 'school' : 'company';
  return buildStudentContactsNavigationReply(input.locale, entityType);
}

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
