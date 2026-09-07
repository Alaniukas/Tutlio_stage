import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
}

const chatMigration = read(
  'supabase/migrations/20260825171242_capacity_chat_broadcast.sql',
);
const chatPermissionMigration = read(
  'supabase/migrations/20260825180724_capacity_chat_broadcast_admin_permissions.sql',
);
const jobMigration = read(
  'supabase/migrations/20260825171248_capacity_background_jobs.sql',
);
const reminders = read('api/send-reminders.ts');
const schoolReminders = read('api/school-installment-reminders.ts');
const materializer = read('api/materialize-recurring-sessions.ts');
const loadHarness = read('scripts/load/k6-capacity.js');
const packageJson = JSON.parse(read('package.json')) as {
  engines?: { node?: string };
};
const ciWorkflow = read('.github/workflows/webpack.yml');
const vercel = JSON.parse(read('vercel.json')) as {
  functions: Record<string, { maxDuration?: number }>;
  crons: Array<{ path: string; schedule: string }>;
};

describe('capacity hardening invariants', () => {
  it('uses private, permission-checked chat broadcasts without a rolling-deploy flag day', () => {
    expect(chatMigration).toContain('private.broadcast_chat_message_insert');
    expect(chatMigration).toContain('CREATE POLICY tutlio_private_chat_broadcasts');
    expect(chatMigration).toContain('public.can_access_conversation');
    expect(chatMigration).toContain('private.org_admin_permission_gate');
    expect(chatMigration).toContain("'user:' || (SELECT auth.uid())::text || ':inbox'");
    expect(chatMigration).not.toContain("jsonb_build_object('message', to_jsonb(NEW))");
    expect(chatPermissionMigration).toContain('private.org_admin_permission_gate');
    expect(chatPermissionMigration).toContain("'message_id', NEW.id");
    expect(chatPermissionMigration).not.toContain("jsonb_build_object('message', to_jsonb(NEW))");
    expect(chatMigration).not.toContain(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages',
    );
    expect(chatMigration).not.toContain(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_participants',
    );
  });

  it('indexes the cursor and bounded background-job scans', () => {
    expect(jobMigration).toContain('last_materialized_at ASC NULLS FIRST, id');
    expect(jobMigration).toContain('idx_sessions_reminder_pending_start');
    expect(jobMigration).toContain('idx_school_installments_reminder_pending');
    expect(jobMigration).toContain('idx_sessions_recurring_start');
    expect(jobMigration).toContain('public.get_due_session_reminder_ids');
    expect(jobMigration).toContain('public.get_due_school_installment_reminder_ids');
  });

  it('keeps cron work bounded and runs the fair materializer hourly', () => {
    expect(reminders).toContain('SESSION_REMINDER_BATCH_SIZE = 250');
    expect(reminders).toContain('SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT = 100');
    expect(schoolReminders).toContain('SCHOOL_REMINDER_BATCH_SIZE = 25');
    expect(materializer).toContain('MATERIALIZER_BATCH_SIZE = 100');
    expect(
      vercel.crons.find((cron) => cron.path === '/api/materialize-recurring-sessions'),
    ).toEqual({ path: '/api/materialize-recurring-sessions', schedule: '15 * * * *' });
    expect(vercel.functions['api/send-reminders.ts']?.maxDuration).toBe(300);
    expect(vercel.functions['api/school-installment-reminders.ts']?.maxDuration).toBe(300);
    expect(vercel.functions['api/materialize-recurring-sessions.ts']?.maxDuration).toBe(300);
  });

  it('keeps production and CI on supported Node runtimes', () => {
    expect(packageJson.engines?.node).toBe('>=22 <25');
    expect(ciWorkflow).toContain('node-version: [22.x, 24.x]');
    expect(ciWorkflow).not.toContain('node-version: [20.x');
  });

  it('keeps the 1,000-user harness staging-only and includes private sockets', () => {
    expect(loadHarness).toContain("__ENV.TARGET_ENV !== 'staging'");
    expect(loadHarness).toContain('Production Tutlio domains are blocked');
    expect(loadHarness).toContain('TARGET_VUS || 1000');
    expect(loadHarness).toContain('private: true');
    expect(loadHarness).toContain('realtime_join_success');
  });
});
