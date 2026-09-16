import { describe, expect, it } from 'vitest';
import { readInAppSupportConversationResponse } from '@/lib/inAppSupportStream';

const completeConversation = {
  reply: 'Thanks - I have enough context.',
  title: 'Mobile icons block invitations',
  context: 'Floating icons cover invitation controls on the company students page.',
  steps: ['Open the company students page on mobile', 'Try to invite a student'],
  expectedOutcome: 'Invitation controls should remain tappable.',
  actualOutcome: 'Floating icons cover the controls.',
  impact: 'blocking',
  impactDetails: 'Mobile administrators cannot invite students.',
  ready: true,
  missingTopics: [],
};

describe('in-app support conversation streaming', () => {
  it('renders reply snapshots while preserving the final structured result', async () => {
    const encoder = new TextEncoder();
    const payload = [
      JSON.stringify({ type: 'reply', content: 'Thanks—' }),
      JSON.stringify({ type: 'reply', content: 'Thanks—that explains it.' }),
      JSON.stringify({ type: 'result', conversation: completeConversation }),
    ].join('\n') + '\n';
    const midpoint = Math.floor(payload.length / 2);
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload.slice(0, midpoint)));
        controller.enqueue(encoder.encode(payload.slice(midpoint)));
        controller.close();
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    });
    const snapshots: string[] = [];

    const result = await readInAppSupportConversationResponse(response, (content) => snapshots.push(content));

    expect(snapshots).toEqual(['Thanks -', 'Thanks - that explains it.']);
    expect(result).toEqual(completeConversation);
  });

  it('keeps JSON responses as a safe backwards-compatible fallback', async () => {
    const response = new Response(JSON.stringify({ conversation: completeConversation }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const snapshots: string[] = [];

    const result = await readInAppSupportConversationResponse(response, (content) => snapshots.push(content));

    expect(snapshots).toEqual([completeConversation.reply]);
    expect(result.ready).toBe(true);
  });
});
