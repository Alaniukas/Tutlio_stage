import {
  normalizeInAppSupportAgentReply,
  parseInAppSupportAiConversation,
  type InAppSupportAiConversation,
} from './inAppSupport';

type InAppSupportConversationStreamEvent =
  | { type: 'reply'; content: string }
  | { type: 'result'; conversation: unknown }
  | { type: 'error'; error: string };

function parseEvent(line: string): InAppSupportConversationStreamEvent | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    if (value.type === 'reply' && typeof value.content === 'string') {
      return { type: 'reply', content: value.content };
    }
    if (value.type === 'result') {
      return { type: 'result', conversation: value.conversation };
    }
    if (value.type === 'error' && typeof value.error === 'string') {
      return { type: 'error', error: value.error };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizedConversation(value: unknown): InAppSupportAiConversation | null {
  const conversation = parseInAppSupportAiConversation(value);
  return conversation
    ? { ...conversation, reply: normalizeInAppSupportAgentReply(conversation.reply) }
    : null;
}

export async function readInAppSupportConversationResponse(
  response: Response,
  onReply: (content: string) => void,
): Promise<InAppSupportAiConversation> {
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(failure?.error || 'AI conversation failed.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/x-ndjson')) {
    const body = await response.json().catch(() => null) as { conversation?: unknown } | null;
    const conversation = normalizedConversation(body?.conversation);
    if (!conversation) throw new Error('AI conversation failed.');
    onReply(conversation.reply);
    return conversation;
  }

  if (!response.body) throw new Error('AI conversation stream is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalConversation: InAppSupportAiConversation | null = null;

  const consumeLine = (line: string) => {
    const event = parseEvent(line);
    if (!event) return;
    if (event.type === 'reply') {
      const content = normalizeInAppSupportAgentReply(event.content);
      if (content) onReply(content);
      return;
    }
    if (event.type === 'error') throw new Error(event.error || 'AI conversation failed.');
    finalConversation = normalizedConversation(event.conversation);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) consumeLine(line);
    }
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer);
  if (!finalConversation) throw new Error('AI conversation stream ended without a result.');
  return finalConversation;
}
