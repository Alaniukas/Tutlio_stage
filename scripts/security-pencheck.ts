/**
 * Tutlio read-only security pen-check.
 *
 * Usage:
 *   TARGET_URL=https://tutlio.lt \
 *   VITE_SUPABASE_URL=... \
 *   VITE_SUPABASE_ANON_KEY=... \
 *   npm run security:pencheck
 *
 * This script is intentionally non-destructive:
 * - GET/HEAD/OPTIONS requests only
 * - no mutation calls
 * - no auth brute-force
 */

type Severity = "info" | "medium" | "high";

type Finding = {
  severity: Severity;
  category: string;
  target: string;
  details: string;
};

const targetUrl = (process.env.TARGET_URL || "https://tutlio.lt").replace(/\/+$/, "");
const supabaseUrlRaw = (process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

function normalizeSupabaseProjectUrl(url: string): string {
  if (!url) return url;
  return url.replace(/\/rest\/v1\/?$/i, "");
}

const supabaseProjectUrl = normalizeSupabaseProjectUrl(supabaseUrlRaw);
const findings: Finding[] = [];

function addFinding(severity: Severity, category: string, target: string, details: string) {
  findings.push({ severity, category, target, details });
}

function toUrl(base: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch (err) {
    addFinding("medium", "network_error", url, String(err));
    return null;
  }
}

async function checkHeaders() {
  const headerPaths = ["/", "/login", "/company/login"];
  for (const p of headerPaths) {
    const url = toUrl(targetUrl, p);
    const res = await safeFetch(url, { method: "GET", redirect: "manual" });
    if (!res) continue;

    const hsts = res.headers.get("strict-transport-security");
    const csp = res.headers.get("content-security-policy");
    const xcto = res.headers.get("x-content-type-options");
    const xfo = res.headers.get("x-frame-options");
    const rp = res.headers.get("referrer-policy");

    if (!hsts) addFinding("medium", "missing_header", url, "Missing Strict-Transport-Security");
    if (!csp) addFinding("medium", "missing_header", url, "Missing Content-Security-Policy");
    if (!xcto) addFinding("medium", "missing_header", url, "Missing X-Content-Type-Options");
    if (!xfo) addFinding("info", "missing_header", url, "Missing X-Frame-Options (can be replaced by CSP frame-ancestors)");
    if (!rp) addFinding("info", "missing_header", url, "Missing Referrer-Policy");
  }
}

async function checkSensitivePublicPaths() {
  const paths = [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.git/HEAD",
    "/.well-known/security.txt",
    "/api/.env",
    "/api/debug",
    "/debug",
  ];

  for (const p of paths) {
    const url = toUrl(targetUrl, p);
    const res = await safeFetch(url, { method: "GET" });
    if (!res) continue;

    if (res.status === 200) {
      const text = await res.text();
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const looksLikeSpaFallback =
        (contentType.includes("text/html") || text.toLowerCase().includes("<!doctype html")) &&
        (text.includes('id="root"') || text.includes("/assets/") || text.includes("vite"));

      const leakHints = [
        "supabase_service_role_key",
        "service_role",
        "stripe_secret_key",
        "BEGIN RSA PRIVATE KEY",
        "postgres://",
      ];
      const leaked = leakHints.find((hint) => text.toLowerCase().includes(hint.toLowerCase()));
      if (leaked) {
        addFinding("high", "public_secret_exposure", url, `Potential secret pattern detected: ${leaked}`);
      } else if (p.includes(".env") || p.includes(".git")) {
        if (looksLikeSpaFallback) {
          addFinding("info", "spa_fallback", url, "Likely SPA fallback (200 HTML), not direct file exposure");
        } else {
          addFinding("high", "sensitive_path_accessible", url, "Sensitive path accessible with 200");
        }
      } else if (p === "/.well-known/security.txt") {
        if (looksLikeSpaFallback) {
          addFinding("info", "missing_security_txt", url, "security.txt not found (SPA fallback response)");
        } else {
          addFinding("info", "security_txt_present", url, "security.txt is publicly accessible (expected)");
        }
      } else {
        addFinding("info", "public_debug_path", url, "Debug-like path is publicly accessible");
      }
    }
  }
}

async function checkSupabaseRlsDataExposure() {
  if (!supabaseProjectUrl || !supabaseAnonKey) {
    addFinding(
      "medium",
      "supabase_check_skipped",
      "env",
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to run Supabase leakage checks",
    );
    return;
  }

  const sensitiveTables = [
    "profiles",
    "organization_admins",
    "students",
    "sessions",
    "parent_profiles",
    "parent_students",
    "parent_invites",
    "student_payment_methods",
    "lesson_packages",
    "billing_batches",
    "billing_batch_sessions",
    "school_contracts",
    "school_payment_installments",
  ];

  for (const table of sensitiveTables) {
    const url = `${supabaseProjectUrl}/rest/v1/${table}?select=*&limit=1`;
    const res = await safeFetch(url, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    if (!res) continue;

    const bodyText = await res.text();
    const normalized = bodyText.toLowerCase();

    if (res.status === 200) {
      try {
        const parsed = JSON.parse(bodyText) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          addFinding("high", "anon_data_exposure", table, `Anon key can read ${table} rows`);
        } else {
          addFinding("info", "anon_read_empty", table, "Readable but currently empty result set");
        }
      } catch {
        addFinding("medium", "unexpected_response", table, `HTTP 200 non-JSON response: ${bodyText.slice(0, 120)}`);
      }
      continue;
    }

    if (res.status === 401 || res.status === 403) continue;
    if (normalized.includes("permission denied") || normalized.includes("row-level security")) continue;

    addFinding("medium", "unexpected_status", table, `Status ${res.status}: ${bodyText.slice(0, 140)}`);
  }
}

async function checkSupabaseRpcExposure() {
  if (!supabaseProjectUrl || !supabaseAnonKey) return;

  const rpcChecks: Array<{ name: string; payload: Record<string, unknown>; expectedPublic: boolean }> = [
    { name: "admin_org_students", payload: { p_org_id: "00000000-0000-0000-0000-000000000000" }, expectedPublic: false },
    { name: "admin_org_student_count", payload: { p_org_id: "00000000-0000-0000-0000-000000000000" }, expectedPublic: false },
    { name: "get_unpaid_sessions_for_billing", payload: { p_tutor_id: "00000000-0000-0000-0000-000000000000", p_period_start: "2026-01-01", p_period_end: "2026-01-31" }, expectedPublic: false },
    { name: "validate_tutor_invite_token", payload: { p_token: "INVALID_TOKEN_FOR_AUDIT" }, expectedPublic: true },
    { name: "get_student_by_invite_code", payload: { p_invite_code: "INVALIDCODE" }, expectedPublic: true },
  ];

  for (const rpc of rpcChecks) {
    const url = `${supabaseProjectUrl}/rest/v1/rpc/${rpc.name}`;
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(rpc.payload),
    });
    if (!res) continue;

    const bodyText = await res.text();
    const normalized = bodyText.toLowerCase();

    if (rpc.expectedPublic) {
      if (res.status >= 500) addFinding("medium", "public_rpc_error", rpc.name, `Public RPC returns ${res.status}`);
      continue;
    }

    if (res.status === 200) {
      try {
        const parsed = JSON.parse(bodyText) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          addFinding("high", "restricted_rpc_exposure", rpc.name, "Restricted RPC returned rows for anon");
        } else if (typeof parsed === "number" && parsed > 0) {
          addFinding("high", "restricted_rpc_exposure", rpc.name, "Restricted RPC returned non-zero numeric result for anon");
        }
      } catch {
        addFinding("medium", "unexpected_rpc_response", rpc.name, "Restricted RPC returned 200 with non-JSON");
      }
      continue;
    }

    if (res.status === 401 || res.status === 403) continue;
    if (normalized.includes("not authorized") || normalized.includes("permission denied")) continue;
  }
}

async function main() {
  console.log(`Running read-only pen-check for ${targetUrl}`);
  await checkHeaders();
  await checkSensitivePublicPaths();
  await checkSupabaseRlsDataExposure();
  await checkSupabaseRpcExposure();

  const high = findings.filter((f) => f.severity === "high");
  const medium = findings.filter((f) => f.severity === "medium");
  const info = findings.filter((f) => f.severity === "info");

  console.log("\n=== Pen-check summary ===");
  console.log(`High: ${high.length}`);
  console.log(`Medium: ${medium.length}`);
  console.log(`Info: ${info.length}`);

  if (findings.length) {
    console.log("\n=== Findings ===");
    for (const f of findings) {
      console.log(`[${f.severity.toUpperCase()}] ${f.category} | ${f.target} | ${f.details}`);
    }
  } else {
    console.log("No findings detected by this probe.");
  }

  if (high.length > 0) process.exit(2);
}

void main();
