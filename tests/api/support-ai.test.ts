import { describe, expect, it } from 'vitest';
import {
  ENTERPRISE_SELF_SERVE_SUPPORT_KNOWLEDGE,
  buildSupportFollowUpGuidance,
  getSupportKnowledgeArea,
  guessSupportArea,
  renderSupportKnowledgeContext,
  retrieveSupportKnowledgeChunks,
  SHARED_SUPPORT_KNOWLEDGE,
  SUPPORT_AREA_IDS,
  supportRouterCatalog,
} from '../../api/_lib/supportKnowledge';
import { escapeSupportHtml, parseSupportContact } from '../../api/_lib/supportContact';
import {
  parseSupportBody,
  supportGeneralFollowUp,
  supportLocaleName,
} from '../../api/_lib/supportRequest';
import {
  SUPPORT_PAGE_IDS,
  SUPPORT_PAGE_SUGGESTIONS,
  parseSupportPageIds,
  supportPagesForProductFeatures,
  supportPageRouterCatalog,
} from '../../src/lib/supportPageSuggestions';
import {
  PUBLIC_PRODUCT_FEATURE_HUB_IDS,
  PUBLIC_PRODUCT_FEATURE_IDS,
  PUBLIC_PRODUCT_FEATURES,
  PRODUCT_SUPPORT_AREA_IDS,
  PRODUCT_SUPPORT_PAGE_IDS,
  productFeatureRouterCatalog,
  rankPublicProductFeatures,
} from '../../src/lib/productFeatureCatalog';
import {
  FEATURE_HUB_HIGHLIGHT_KEYS,
  FEATURE_PAGE_IDS,
} from '../../src/lib/featurePages';

describe('Tutlio AI support knowledge routing', () => {
  it.each([
    ['How do I add free time to my calendar?', 'tutor_workspace'],
    ['Kaip veikia mokyklos sutarties GoSign parašas?', 'schools_contracts'],
    ['Czy mogę anulować subskrypcję i dostać zwrot?', 'payments_billing'],
    ['My parent account does not show my child', 'students_parents'],
    ['Google Calendar stopped syncing', 'integrations_messages'],
    ['I forgot my password and cannot login', 'troubleshooting_security'],
    ['Do B2B customers get a WhatsApp support chat?', 'organizations'],
    ['I manage a tutoring team', 'organizations'],
    ['I represent a school', 'schools_contracts'],
    ['Do you have an interactive whiteboard?', 'tutor_workspace'],
  ])('provides a safe fallback route from %s to %s', (question, expected) => {
    const result = guessSupportArea(question);
    expect(result).toEqual({ id: expected, confident: true });
  });

  it('keeps every router choice connected to a non-empty knowledge area', () => {
    expect(supportRouterCatalog()).toContain('schools_contracts');
    for (const id of SUPPORT_AREA_IDS) {
      const area = getSupportKnowledgeArea(id);
      expect(area.id).toBe(id);
      expect(area.content.length).toBeGreaterThan(500);
      expect(area.routerDescription.length).toBeGreaterThan(20);
    }
  });

  it('keeps B2B WhatsApp support in the shared agent knowledge', () => {
    expect(SHARED_SUPPORT_KNOWLEDGE).toContain('After a B2B purchase');
    expect(SHARED_SUPPORT_KNOWLEDGE).toContain('WhatsApp support chat');
  });

  it('grounds ordinary agency license purchases in the self-service pricing checkout', () => {
    const organizations = getSupportKnowledgeArea('organizations').content;

    expect(ENTERPRISE_SELF_SERVE_SUPPORT_KNOWLEDGE).toContain('buy 1–60 tutor licenses directly from /pricing');
    expect(ENTERPRISE_SELF_SERVE_SUPPORT_KNOWLEDGE).toContain('Ten tutor licenses are within the self-service range');
    expect(ENTERPRISE_SELF_SERVE_SUPPORT_KNOWLEDGE).toContain('does not require contacting Tutlio');
    expect(organizations).toContain('including 10 licenses');
    expect(organizations).toContain('contacting Tutlio first is not required');
    expect(SUPPORT_PAGE_SUGGESTIONS.pricing.description).toContain('self-service tutor-license calculator');
  });

  it('stays proactively helpful for the first three questions without becoming pushy', () => {
    for (const questionNumber of [1, 2, 3]) {
      const guidance = buildSupportFollowUpGuidance(questionNumber, 'What else can I help you with?');
      expect(guidance).toContain(`user question ${questionNumber} of the first three`);
      expect(guidance).toContain('exactly one brief, friendly, context-specific follow-up question');
      expect(guidance).toContain('low-pressure');
      expect(guidance).toContain('never ask for information the user already provided');
      expect(guidance).not.toContain('What else can I help you with?');
    }
  });

  it('uses the exact localized general follow-up after the first three questions', () => {
    const followUp = supportGeneralFollowUp('en');
    const guidance = buildSupportFollowUpGuidance(4, followUp);

    expect(guidance).toContain('after the first three');
    expect(guidance).toContain(`final sentence: “${followUp}”`);
    expect(guidance).toContain('Do not add any text after that sentence');
  });

  it('contains product-fit guidance for first-time visitors', () => {
    const gettingStarted = getSupportKnowledgeArea('getting_started').content;
    expect(gettingStarted).toContain('Is Tutlio a good fit?');
    expect(gettingStarted).toContain('solo tutor');
    expect(gettingStarted).toContain('tutoring company');
    expect(gettingStarted).toContain('school');
    expect(gettingStarted).not.toContain('not a marketplace');
    expect(gettingStarted).not.toContain('not a full course-authoring');
  });

  it('grounds the interactive whiteboard in verified product behavior', () => {
    const tutorWorkspace = getSupportKnowledgeArea('tutor_workspace').content;
    const whiteboard = PUBLIC_PRODUCT_FEATURES.whiteboard;

    expect(tutorWorkspace).toContain('Interactive lesson whiteboard');
    expect(tutorWorkspace).toContain('real-time collaboration');
    expect(tutorWorkspace).toContain('downloaded as a PDF');
    expect(tutorWorkspace).toContain('two hours after the scheduled lesson end');
    expect(whiteboard.suggestedPageIds).toEqual(['features_overview']);
    expect(SUPPORT_PAGE_SUGGESTIONS.features_overview.description).toContain('interactive lesson whiteboard');
  });

  it.each([
    ['en', 'Does Tutlio include a whiteboard?'],
    ['lt', 'Ar turite interaktyvią lentą?'],
    ['pl', 'Czy macie tablicę interaktywną?'],
    ['lv', 'Vai ir interaktīvā tāfele?'],
    ['ee', 'Kas on olemas interaktiivne tahvel?'],
    ['fr', 'Avez-vous un tableau blanc?'],
    ['es', '¿Tenéis una pizarra interactiva?'],
    ['de', 'Gibt es eine interaktive Tafel?'],
    ['se', 'Finns det en interaktiv skrivtavla?'],
    ['dk', 'Har I en interaktiv tavle?'],
    ['fi', 'Onko käytössä interaktiivinen valkotaulu?'],
    ['no', 'Har dere en interaktiv tavle?'],
    ['nl', 'Hebben jullie een interactief whiteboard?'],
  ])('retrieves the whiteboard feature for the %s locale', (_locale, question) => {
    expect(rankPublicProductFeatures(question, 1)).toEqual(['whiteboard']);
  });

  it('injects only the precise feature facts instead of the whole topic document', () => {
    const fullArea = getSupportKnowledgeArea('tutor_workspace').content;
    const chunks = retrieveSupportKnowledgeChunks(
      'tutor_workspace',
      'Does Tutlio include an interactive whiteboard?',
      ['whiteboard'],
    );
    const context = renderSupportKnowledgeContext(
      'tutor_workspace',
      'Does Tutlio include an interactive whiteboard?',
      ['whiteboard'],
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ id: 'feature:whiteboard', source: 'feature' });
    expect(context).toContain('real-time collaboration');
    expect(context.length).toBeLessThan(fullArea.length / 2);
  });

  it('keeps the public website, support areas, facts, and page mappings on one catalog', () => {
    expect(FEATURE_HUB_HIGHLIGHT_KEYS).toEqual(PUBLIC_PRODUCT_FEATURE_HUB_IDS);
    expect(Object.keys(PUBLIC_PRODUCT_FEATURES).sort()).toEqual([...PUBLIC_PRODUCT_FEATURE_IDS].sort());
    expect(productFeatureRouterCatalog()).toContain('whiteboard: Interactive lesson whiteboard');

    const coveredDeepPages = new Set(
      Object.values(PUBLIC_PRODUCT_FEATURES)
        .flatMap((feature) => feature.deepFeaturePageId ? [feature.deepFeaturePageId] : []),
    );
    expect([...coveredDeepPages].sort()).toEqual([...FEATURE_PAGE_IDS].sort());

    for (const feature of Object.values(PUBLIC_PRODUCT_FEATURES)) {
      expect(PRODUCT_SUPPORT_AREA_IDS).toContain(feature.areaId);
      expect(feature.aliases.length).toBeGreaterThan(1);
      expect(feature.facts.length).toBeGreaterThan(1);
      expect(feature.suggestedPageIds.length).toBeGreaterThan(0);
      for (const pageId of feature.suggestedPageIds) {
        expect(PRODUCT_SUPPORT_PAGE_IDS).toContain(pageId);
      }
    }
  });

  it('keeps the model page choices on a verified public-page allowlist', () => {
    expect(Object.keys(SUPPORT_PAGE_SUGGESTIONS).sort()).toEqual([...SUPPORT_PAGE_IDS].sort());
    expect(supportPageRouterCatalog()).toContain('payments: /features/payments');

    for (const suggestion of Object.values(SUPPORT_PAGE_SUGGESTIONS)) {
      expect(suggestion.href.startsWith('/')).toBe(true);
      expect(suggestion.labelKey.length).toBeGreaterThan(3);
      expect(suggestion.description.length).toBeGreaterThan(20);
    }

    expect(new Set(Object.values(SUPPORT_PAGE_SUGGESTIONS).map(({ href }) => href)).size)
      .toBe(SUPPORT_PAGE_IDS.length);
    expect(parseSupportPageIds('payments,made_up,payments,pricing,contact,privacy'))
      .toEqual(['payments', 'pricing', 'contact']);
    expect(parseSupportPageIds(null)).toEqual([]);
    expect(supportPagesForProductFeatures(['whiteboard'])).toEqual(['features_overview']);
  });
});

describe('support chat payload boundaries', () => {
  it('keeps only the last ten valid messages and caps their length', () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `message-${index}-${'x'.repeat(2_100)}`,
    }));
    // Ensure the final message is a user turn.
    messages[11].role = 'user';

    const parsed = parseSupportBody({
      messages,
      locale: 'lt',
      page: `/calendar?student=${'a'.repeat(400)}`,
      sessionId: 'session-123',
      requestId: 'request-123',
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.messages).toHaveLength(10);
    expect(parsed?.messages[0]?.content.startsWith('message-2-')).toBe(true);
    expect(parsed?.messages.every((message) => message.content.length <= 2_000)).toBe(true);
    expect(parsed?.page.length).toBeLessThanOrEqual(300);
    expect(parsed?.requestId).toBe('request-123');
    expect(supportLocaleName(parsed!.locale)).toBe('Lithuanian');
  });

  it('rejects payloads without a final user message', () => {
    expect(parseSupportBody({ messages: [{ role: 'assistant', content: 'Hello' }] })).toBeNull();
  });
});

describe('support contact payload safety', () => {
  it('validates and bounds the contact form and transcript', () => {
    const parsed = parseSupportContact({
      name: '  Ada Lovelace  ',
      email: ' ADA@EXAMPLE.COM ',
      phone: '+37060000000',
      message: `The payment status did not update. ${'x'.repeat(5_000)}`,
      page: '/finance',
      locale: 'en',
      sessionId: 'session-123',
      requestId: 'request-123',
      attachment: {
        path: 'session-123/31cb7dde-0dc3-4bd4-a3fe-62cd323e8ed7.png',
        name: 'payment-screen.png',
        type: 'image/png',
        size: 124_000,
      },
      conversation: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `turn-${index}`,
      })),
    });

    expect(parsed?.name).toBe('Ada Lovelace');
    expect(parsed?.email).toBe('ada@example.com');
    expect(parsed?.message).toHaveLength(4_000);
    expect(parsed?.conversation).toHaveLength(6);
    expect(parsed?.attachment).toEqual({
      path: 'session-123/31cb7dde-0dc3-4bd4-a3fe-62cd323e8ed7.png',
      name: 'payment-screen.png',
      type: 'image/png',
      size: 124_000,
    });
  });

  it('escapes contact values before inserting them into email HTML', () => {
    expect(escapeSupportHtml(`<img src=x onerror="alert('x')">`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;');
  });

  it('rejects invalid contact requests', () => {
    expect(parseSupportContact({ name: 'Ada', email: 'invalid', message: 'Please help me' })).toBeNull();
    expect(parseSupportContact({ name: 'Ada', email: 'ada@example.com', message: 'short' })).toBeNull();
    expect(parseSupportContact({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Please help with this screenshot',
      attachment: { path: 'x.png', name: 'x.png', type: 'image/svg+xml', size: 100 },
    })).toBeNull();
  });
});
