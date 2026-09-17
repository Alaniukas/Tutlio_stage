import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';
import { embedMany } from 'ai';
import {
  buildInAppSupportKnowledgeDocuments,
} from '../api/_lib/inAppSupportKnowledgeDocuments.js';
import { IN_APP_SUPPORT_EMBEDDING_MODEL } from '../api/_lib/inAppSupportVectorContext.js';

function loadEnvironment(): Record<string, string | undefined> {
  const environment = { ...process.env };
  const candidates = [process.env.ENV_FILE, '.env.local', '.env.vercel.stage', '.env'].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const path = resolve(candidate);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || environment[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      environment[match[1]] = value;
    }
    process.stdout.write(`Loaded environment from ${path}\n`);
    break;
  }
  return environment;
}

const environment = loadEnvironment();
const supabaseUrl = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL;
const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = environment.OPENAI_API_KEY;
if (!supabaseUrl || !serviceKey || !openaiKey) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY are required.');
}
if (supabaseUrl.includes('xklzjhfztjxltrdkplog')) {
  throw new Error('Refusing to use the retired Supabase project.');
}

const documents = buildInAppSupportKnowledgeDocuments();
const provider = createOpenAI({ apiKey: openaiKey });
const { embeddings } = await embedMany({
  model: provider.embedding(IN_APP_SUPPORT_EMBEDDING_MODEL),
  values: documents.map((document) => `${document.title}\n${document.content}`),
  maxParallelCalls: 2,
});
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rows = documents.map((document, index) => ({
  knowledge_key: document.knowledgeKey,
  title: document.title,
  content: document.content,
  locale: 'multi',
  portals: document.portals,
  entity_types: document.entityTypes,
  feature_id: document.featureId,
  required_permission: document.requiredPermission,
  organization_id: null,
  metadata: { source: 'feature_registry', embedding_model: IN_APP_SUPPORT_EMBEDDING_MODEL },
  embedding: embeddings[index],
  is_active: true,
  updated_at: new Date().toISOString(),
}));

for (let offset = 0; offset < rows.length; offset += 50) {
  const batch = rows.slice(offset, offset + 50);
  const { error } = await supabase
    .from('in_app_support_knowledge')
    .upsert(batch, { onConflict: 'knowledge_key' });
  if (error) throw error;
}

process.stdout.write(`Synced ${rows.length} entitlement-filtered support knowledge documents.\n`);
