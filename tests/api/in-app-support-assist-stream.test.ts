import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('ai')>(),
  streamText: mocks.streamText,
}));
vi.mock('../../api/_lib/supportRequest.js', () => ({ allowSupportRequest: () => true }));

import handler from '../../api/in-app-support-assist';

const completedConversation = {
  reply: 'Thanks—that is enough context. Say “send it” when ready.',
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

function response() {
  const result = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    ended: false,
    headersSent: false,
  };
  return {
    result,
    res: {
      get headersSent() {
        return result.headersSent;
      },
      setHeader(name: string, value: string) {
        result.headers[name] = value;
      },
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(body: unknown) {
        result.chunks.push(JSON.stringify(body));
        result.ended = true;
      },
      flushHeaders() {
        result.headersSent = true;
      },
      write(chunk: string) {
        result.chunks.push(chunk);
        return true;
      },
      end() {
        result.ended = true;
      },
    },
  };
}

describe('in-app support AI conversation stream', () => {
  it.each(['answer', 'handoff'] as const)('does not replace a %s with repetitive report-intake questions', async (responseKind) => {
    const output = { ...completedConversation, responseKind, impact: null, impactDetails: '', ready: false,
      reply: responseKind === 'answer' ? 'Open Chat history below the recording.' : 'I can prepare the existing facts for the team. Say "send it".',
      missingTopics: [] };
    mocks.streamText.mockReturnValueOnce({ partialOutputStream: (async function* () { yield { reply: output.reply }; }()),
      output: Promise.resolve(output) });
    const { res, result } = response();
    await handler({ method: 'POST', headers: { 'x-in-app-support-preview': '1' }, body: {
      mode: 'conversation', category: 'bug', locale: 'en', page: '/recordings', draft: output,
      latestMessage: responseKind === 'answer' ? 'Where does the chat appear?' : 'Please ask a human, we are going in circles.',
      conversation: [{ role: 'user', content: 'Where does the chat appear?' }],
    } } as any, res as any);
    const events = result.chunks.join('').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.at(-1).conversation).toMatchObject({ responseKind, reply: output.reply, ready: false, missingTopics: [] });
    expect(events.at(-1).conversation.reply).not.toContain('?');
  });
  it('works when only GEMINI_API_KEY is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    const { res, result } = response();
    await handler({
      method: 'POST',
      headers: { 'x-in-app-support-preview': '1' },
      body: {
        mode: 'conversation',
        submitRequested: false,
        category: 'feature',
        latestMessage: 'Where are student contacts?',
        conversation: [
          { role: 'assistant', content: 'What would you like to improve?' },
          { role: 'user', content: 'Where are student contacts?' },
        ],
        draft: completedConversation,
        attachmentNames: [],
        page: '/students',
        locale: 'en',
      },
    } as any, res as any);

    expect(result.statusCode).toBe(200);
    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.anything(),
    }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocks.streamText.mockReturnValue({
      partialOutputStream: (async function* () {
        yield { reply: 'Thanks—' };
        yield { reply: completedConversation.reply };
      }()),
      output: Promise.resolve(completedConversation),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('streams sanitized reply snapshots followed by the structured result', async () => {
    const { res, result } = response();
    await handler({
      method: 'POST',
      headers: { 'x-in-app-support-preview': '1' },
      body: {
        mode: 'conversation',
        submitRequested: false,
        category: 'bug',
        latestMessage: 'The invite button is covered on mobile.',
        conversation: [
          { role: 'assistant', content: 'What happened?' },
          { role: 'user', content: 'The invite button is covered on mobile.' },
        ],
        draft: completedConversation,
        attachmentNames: [],
        page: '/company/students',
        locale: 'en',
      },
    } as any, res as any);

    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toBe('application/x-ndjson; charset=utf-8');
    expect(result.ended).toBe(true);
    const events = result.chunks.join('').trim().split('\n').map((line) => JSON.parse(line));
    expect(events[0]).toEqual({ type: 'reply', content: 'Thanks -' });
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      conversation: {
        reply: 'Thanks - that is enough context. Say “send it” when ready.',
        ready: true,
      },
    });
    expect(JSON.stringify(events)).not.toContain('—');
    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      instructions: expect.stringContaining('First extract every usable fact from latestMessage'),
    }));
    const instructions = mocks.streamText.mock.calls[0][0].instructions as string;
    expect(instructions).toContain('Treat the supplied page as known location context');
    expect(instructions).toContain('Never ask a feature requester what happened immediately before an error');
    expect(instructions).toContain('must not contain bundled alternatives');
    expect(instructions).toContain('Never use an em dash');
    const prompt = JSON.parse(mocks.streamText.mock.calls[0][0].prompt as string);
    expect(prompt.verifiedSupportContext).toContain('Verified customer function scope');
    expect(prompt.verifiedSupportContext).toContain('Never describe an optional function that is not listed');
  });

  it('replaces an inconsistent ready response with one question about a genuinely missing field', async () => {
    const inconsistentConversation = {
      reply: 'That is ready to send.',
      title: 'Recurring lessons do not appear',
      context: 'An organization admin saves a recurring lesson from the calendar.',
      steps: ['Open the calendar', 'Create a recurring lesson', 'Select Save'],
      expectedOutcome: 'Every weekly lesson should appear.',
      actualOutcome: '',
      impact: null,
      impactDetails: '',
      ready: true,
      missingTopics: [],
    };
    mocks.streamText.mockReturnValueOnce({
      partialOutputStream: (async function* () {
        yield { reply: inconsistentConversation.reply };
      }()),
      output: Promise.resolve(inconsistentConversation),
    });

    const { res, result } = response();
    await handler({
      method: 'POST',
      headers: { 'x-in-app-support-preview': '1' },
      body: {
        mode: 'conversation',
        submitRequested: false,
        category: 'bug',
        latestMessage: 'I select Save after setting it to repeat every Monday.',
        conversation: [
          { role: 'assistant', content: 'What was the last action you took?' },
          { role: 'user', content: 'I select Save after setting it to repeat every Monday.' },
        ],
        draft: inconsistentConversation,
        attachmentNames: [],
        page: '/company/calendar',
        locale: 'en',
      },
    } as any, res as any);

    const events = result.chunks.join('').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      conversation: {
        reply: 'What appeared on screen instead?',
        ready: false,
        missingTopics: ['actualOutcome'],
      },
    });
  });

  it('falls back to bundled student-contact guidance when the model turn fails', async () => {
    mocks.streamText.mockReturnValueOnce({
      partialOutputStream: (async function* () {})(),
      output: Promise.reject(new Error('Invalid AI conversation output.')),
    });

    const { res, result } = response();
    await handler({
      method: 'POST',
      headers: { 'x-in-app-support-preview': '1' },
      body: {
        mode: 'conversation',
        submitRequested: false,
        category: 'feature',
        latestMessage: 'kur galiu surasti savo mokiniu kontaktus?',
        conversation: [
          { role: 'assistant', content: 'Ką norėtumėte patobulinti?' },
          { role: 'user', content: 'kur galiu surasti savo mokiniu kontaktus?' },
        ],
        draft: {
          title: '',
          context: '',
          steps: [],
          expectedOutcome: '',
          actualOutcome: '',
          impact: null,
          impactDetails: '',
        },
        attachmentNames: [],
        page: '/students',
        locale: 'lt',
      },
    } as any, res as any);

    expect(result.statusCode).toBe(200);
    const events = result.chunks.join('').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      conversation: {
        responseKind: 'answer',
        ready: false,
        missingTopics: [],
      },
    });
    expect(events.at(-1).conversation.reply).toContain('Mokiniai');
    expect(events.at(-1).conversation.reply).not.toMatch(/\/students/);
  });

  it('preserves known draft facts and does not ask for them again when model output drops them', async () => {
    const existingDraft = {
      title: 'Recurring lessons do not appear',
      context: 'An organization admin saves a recurring lesson from the calendar.',
      steps: ['Open the calendar', 'Create a recurring lesson', 'Select Save'],
      expectedOutcome: 'Every weekly lesson should appear.',
      actualOutcome: 'Only the first Monday appears.',
      impact: null,
      impactDetails: '',
    };
    const forgetfulConversation = {
      reply: 'What appeared on screen instead?',
      ...existingDraft,
      actualOutcome: '',
      ready: false,
      missingTopics: ['actualOutcome'],
    };
    mocks.streamText.mockReturnValueOnce({
      partialOutputStream: (async function* () {
        yield { reply: forgetfulConversation.reply };
      }()),
      output: Promise.resolve(forgetfulConversation),
    });

    const { res, result } = response();
    await handler({
      method: 'POST',
      headers: { 'x-in-app-support-preview': '1' },
      body: {
        mode: 'conversation',
        submitRequested: false,
        category: 'bug',
        latestMessage: 'Only the first Monday appears.',
        conversation: [
          { role: 'assistant', content: 'What appeared after you selected Save?' },
          { role: 'user', content: 'Only the first Monday appears.' },
        ],
        draft: existingDraft,
        attachmentNames: [],
        page: '/company/calendar',
        locale: 'en',
      },
    } as any, res as any);

    const events = result.chunks.join('').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      conversation: {
        actualOutcome: 'Only the first Monday appears.',
        reply: 'How often does this problem happen?',
        missingTopics: ['impactDetails'],
      },
    });
  });
});
