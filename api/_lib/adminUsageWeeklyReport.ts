import { enrichTelemetryReport, type TelemetryAdminReport, type TelemetryOrgReport, type TelemetryReport } from '../../src/lib/orgAdminTelemetryShared.js';

const DAY_MS = 86_400_000;

const MODULE_LABELS_LT: Record<string, string> = {
  dashboard: 'Apžvalga',
  students: 'Mokiniai',
  tutors: 'Korepetitoriai',
  schedule: 'Tvarkaraštis',
  sessions: 'Užsiėmimai',
  finance: 'Finansai',
  payments: 'Mokėjimai',
  contracts: 'Sutartys',
  groups: 'Grupės',
  messages: 'Žinutės',
  stats: 'Statistika',
  settings: 'Nustatymai',
  team: 'Komanda',
  recordings: 'Įrašai',
  support: 'Pagalba',
  instructions: 'Instrukcijos',
  consultations: 'Konsultacijos',
  'staff-documents': 'Darbuotojų dokumentai',
  'dynamic-pricing': 'Dinaminė kainodara',
};

const MILESTONE_LABELS_LT: Record<string, string> = {
  'student.create': 'Pridėti mokinį',
  'tutor.invite': 'Pakviesti korepetitorių',
  'session.create': 'Suplanuoti pamoką / užsiėmimą',
  'invoice.create': 'Išrašyti sąskaitą',
  'contract.send': 'Išsiųsti sutartį',
  'group.create': 'Sukurti grupę',
};

export type InactiveAdminRow = {
  organizationId: string;
  organizationName: string;
  entityType: string;
  userId: string;
  fullName: string;
  email: string;
  lastSeenAt: string | null;
  lastModule: string | null;
  inactiveDays: number | null;
  tier: 'warning' | 'alert' | 'unknown';
};

export type WeeklyDigest = {
  weekLabel: string;
  generatedAt: string;
  telemetryStartedAt: string | null;
  lastIngestedAt: string | null;
  organizationCount: number;
  activeOrganizations7: number;
  totalActionsThisWeek: number;
  totalActionsPrevWeek: number;
  organizationsWithErrors: number;
  onboardingOrganizations: TelemetryOrgReport[];
  inactiveAdmins: InactiveAdminRow[];
  topModules: Array<{ module: string; hits: number }>;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatLtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('lt-LT', { timeZone: 'Europe/Vilnius', dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso.slice(0, 16);
  }
}

function adminLastSeenMs(admin: TelemetryAdminReport): number | null {
  const stamps = [admin.last_active_at, admin.last_login_at].filter(Boolean).map((value) => Date.parse(String(value)));
  return stamps.length ? Math.max(...stamps) : null;
}

export function buildInactiveAdminRows(organizations: TelemetryOrgReport[], now = Date.now()): InactiveAdminRow[] {
  const rows: InactiveAdminRow[] = [];
  for (const org of organizations) {
    if (org.is_demo || org.status !== 'active') continue;
    for (const admin of org.admins.filter((row) => row.status === 'active')) {
      const lastSeenMs = adminLastSeenMs(admin);
      const inactiveDays = lastSeenMs === null ? null : Math.floor((now - lastSeenMs) / DAY_MS);
      let tier: InactiveAdminRow['tier'] = 'unknown';
      if (inactiveDays === null) {
        tier = Date.parse(org.created_at) <= now - 14 * DAY_MS ? 'alert' : 'warning';
      } else if (inactiveDays >= 14) tier = 'alert';
      else if (inactiveDays >= 7) tier = 'warning';
      else continue;
      const email = String(admin.email || '').trim() || '—';
      rows.push({
        organizationId: org.id,
        organizationName: org.name,
        entityType: org.entity_type,
        userId: admin.user_id,
        fullName: String(admin.full_name || '').trim() || email,
        email,
        lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
        lastModule: admin.last_module,
        inactiveDays,
        tier,
      });
    }
  }
  return rows.sort((a, b) => {
    const rank = (tier: InactiveAdminRow['tier']) => (tier === 'alert' ? 0 : tier === 'warning' ? 1 : 2);
    return rank(a.tier) - rank(b.tier) || String(a.organizationName).localeCompare(b.organizationName, 'lt');
  });
}

export function buildWeeklyDigest(report: TelemetryReport, now = Date.now()): WeeklyDigest {
  const enriched = enrichTelemetryReport(report, now);
  const organizations = enriched.organizations.filter((org) => !org.is_demo && org.status === 'active');
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekLabel = weekStart.toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', day: 'numeric', month: 'long', year: 'numeric' });

  const moduleTotals = new Map<string, number>();
  for (const org of organizations) {
    for (const [key, count] of Object.entries(org.modules_30 || {})) {
      moduleTotals.set(key, (moduleTotals.get(key) || 0) + Number(count) || 0);
    }
  }
  const topModules = [...moduleTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([module, hits]) => ({ module, hits }));

  return {
    weekLabel,
    generatedAt: new Date(now).toISOString(),
    telemetryStartedAt: enriched.started_at || null,
    lastIngestedAt: enriched.last_ingested_at,
    organizationCount: organizations.length,
    activeOrganizations7: organizations.filter((org) => org.active_days_7 > 0).length,
    totalActionsThisWeek: organizations.reduce((sum, org) => sum + Number(org.current_week_actions || 0), 0),
    totalActionsPrevWeek: organizations.reduce((sum, org) => sum + Number(org.previous_week_actions || 0), 0),
    organizationsWithErrors: organizations.filter((org) => org.errors_7 > 0).length,
    onboardingOrganizations: organizations.filter((org) => org.reasons?.includes('onboarding')),
    inactiveAdmins: buildInactiveAdminRows(organizations, now),
    topModules,
  };
}

export async function fetchFullTelemetryReport(
  db: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  projectId: string | null,
): Promise<TelemetryReport | null> {
  const limit = 50;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const organizations: TelemetryOrgReport[] = [];
  let base: TelemetryReport | null = null;
  while (offset < total) {
    const { data, error } = await db.rpc('org_admin_usage_report', {
      p_organization_id: null,
      p_limit: limit,
      p_offset: offset,
      p_search: '',
      p_include_demo: false,
      p_project_id: projectId,
    });
    if (error || !data) return null;
    const page = enrichTelemetryReport(data as TelemetryReport);
    if (!base) base = page;
    organizations.push(...page.organizations);
    total = Number(page.total) || organizations.length;
    offset += limit;
    if (!page.organizations.length) break;
  }
  if (!base) return null;
  return { ...base, organizations, total: organizations.length };
}

function renderAdminTable(rows: InactiveAdminRow[]): string {
  if (!rows.length) return '<p style="color:#6b7280">Šią savaitę tokių administratorių nėra.</p>';
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f3f4f6;text-align:left">
      <th style="padding:8px;border:1px solid #e5e7eb">Organizacija</th>
      <th style="padding:8px;border:1px solid #e5e7eb">Adminas</th>
      <th style="padding:8px;border:1px solid #e5e7eb">Paskutinis aktyvumas</th>
      <th style="padding:8px;border:1px solid #e5e7eb">Modulis</th>
      <th style="padding:8px;border:1px solid #e5e7eb">Dienos</th>
    </tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(row.organizationName)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(row.fullName)}<br><span style="color:#6b7280">${escapeHtml(row.email)}</span></td>
      <td style="padding:8px;border:1px solid #e5e7eb">${formatLtDate(row.lastSeenAt)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(MODULE_LABELS_LT[row.lastModule || ''] || row.lastModule || '—')}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${row.inactiveDays ?? 'nėra duomenų'}</td>
    </tr>`).join('')}</tbody></table>`;
}

export function buildWeeklyDigestEmail(digest: WeeklyDigest): { subject: string; html: string } {
  const alerts = digest.inactiveAdmins.filter((row) => row.tier === 'alert');
  const warnings = digest.inactiveAdmins.filter((row) => row.tier === 'warning' || row.tier === 'unknown');
  const actionDelta = digest.totalActionsPrevWeek > 0
    ? Math.round((digest.totalActionsThisWeek / digest.totalActionsPrevWeek - 1) * 100)
    : null;

  const onboardingHtml = digest.onboardingOrganizations.length
    ? digest.onboardingOrganizations.map((org) => {
      const steps = (org.missing_milestones || []).map((step) => MILESTONE_LABELS_LT[step] || step);
      const modules = (org.expected_modules || []).slice(0, 6).map((module) => MODULE_LABELS_LT[module] || module);
      return `<li style="margin-bottom:12px"><strong>${escapeHtml(org.name)}</strong> (${escapeHtml(org.entity_type)})
        <br>Onboarding žingsniai: ${steps.length ? escapeHtml(steps.join(', ')) : 'visi pagrindiniai žingsniai matomi'}
        <br>Moduliai šiai org: ${escapeHtml(modules.join(', ') || '—')}
      </li>`;
    }).join('')
    : '<li>Naujų organizacijų be onboarding žingsnių šią savaitę nėra.</li>';

  const modulesHtml = digest.topModules.length
    ? digest.topModules.map((row) => `<li>${escapeHtml(MODULE_LABELS_LT[row.module] || row.module)}: ${row.hits}</li>`).join('')
    : '<li>Modulių duomenų dar nėra.</li>';

  const subject = `[Tutlio savaitinė] ${alerts.length ? `${alerts.length} adminai ≥14 d. ` : ''}klientų naudojimas (${digest.weekLabel})`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;max-width:760px;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 8px">Savaitinė klientų naudojimo suvestinė</h1>
      <p style="margin:0 0 20px;color:#6b7280">Laikotarpis nuo ${escapeHtml(digest.weekLabel)}. Telemetrija: ${formatLtDate(digest.telemetryStartedAt)} · paskutinis ingest: ${formatLtDate(digest.lastIngestedAt)}</p>

      <h2 style="font-size:16px;margin:24px 0 8px">Kaip sekasi klientams</h2>
      <ul>
        <li>Aktyvios organizacijos (≥1 aktyvi diena per 7 d.): <strong>${digest.activeOrganizations7}</strong> / ${digest.organizationCount}</li>
        <li>Sėkmingi veiksmai šią savaitę: <strong>${digest.totalActionsThisWeek}</strong>${actionDelta !== null ? ` (${actionDelta > 0 ? '+' : ''}${actionDelta}% vs praeita savaitė)` : ''}</li>
        <li>Organizacijos su klaidomis (7 d.): <strong>${digest.organizationsWithErrors}</strong></li>
      </ul>
      <p style="margin:8px 0 4px;font-weight:600">Populiariausi moduliai (30 d.)</p>
      <ul>${modulesHtml}</ul>

      <h2 style="font-size:16px;margin:24px 0 8px;color:#b45309">Neaktyvūs administratoriai (≥7 d. be prisijungimo / veiksmų)</h2>
      ${renderAdminTable(warnings)}

      <h2 style="font-size:16px;margin:24px 0 8px;color:#b91c1c">Įspėjimas: ≥14 d. neaktyvūs</h2>
      ${renderAdminTable(alerts)}

      <h2 style="font-size:16px;margin:24px 0 8px">Onboarding checklist (naujos org, &lt;30 d.)</h2>
      <ul>${onboardingHtml}</ul>

      <p style="margin-top:24px;color:#6b7280;font-size:12px">Pilna analitika: platformos admin → Klientų naudojimas. Šis laiškas neinformuoja klientų.</p>
    </div>
  `;
  return { subject, html };
}
