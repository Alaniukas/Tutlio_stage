// /api/admin-perlas-payouts — Admin-only API for PerlasFinance batch payouts.
// Actions: summary, settings, generate-xml, mark-paid, mark-cancelled, mark-individual
// Auth: x-admin-secret header

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

const DEBTOR_NAME = 'MB Tutlio';
const DEBTOR_IBAN = 'LT153020020000002859';
const DEBTOR_BIC = 'PEPGLT21XXX';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any) as any;
}

function verifyAdmin(req: VercelRequest): boolean {
  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  return !!(adminSecret && secret && secretsMatch(secret, adminSecret));
}

// ── Summary: pending balances grouped by entity ─────────────────────
async function handleSummary(sb: any, res: VercelResponse) {
  const { data, error } = await sb
    .from('perlas_ledger')
    .select('entity_type, entity_id, volume, net_amount')
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message });

  const grouped: Record<string, { entity_type: string; entity_id: string; total_volume: number; total_net: number; entry_count: number }> = {};
  for (const row of data || []) {
    const key = `${row.entity_type}:${row.entity_id}`;
    if (!grouped[key]) {
      grouped[key] = { entity_type: row.entity_type, entity_id: row.entity_id, total_volume: 0, total_net: 0, entry_count: 0 };
    }
    grouped[key].total_volume += Number(row.volume);
    grouped[key].total_net += Number(row.net_amount);
    grouped[key].entry_count += 1;
  }

  const entityIds = Object.values(grouped).map(g => g.entity_id);
  const tutorIds = Object.values(grouped).filter(g => g.entity_type === 'tutor').map(g => g.entity_id);
  const orgIds = Object.values(grouped).filter(g => g.entity_type === 'org').map(g => g.entity_id);

  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    tutorIds.length > 0
      ? sb.from('profiles').select('id, full_name, payout_iban, payout_recipient_name, payout_country, payout_city, payout_address, payout_postal_code').in('id', tutorIds)
      : { data: [] },
    orgIds.length > 0
      ? sb.from('organizations').select('id, name, payout_iban, payout_recipient_name, payout_country, payout_city, payout_address, payout_postal_code').in('id', orgIds)
      : { data: [] },
  ]);

  const entityMap: Record<string, any> = {};
  for (const p of profiles || []) entityMap[`tutor:${p.id}`] = p;
  for (const o of orgs || []) entityMap[`org:${o.id}`] = { ...o, full_name: o.name };

  const result = Object.entries(grouped).map(([key, g]) => ({
    ...g,
    total_volume: Math.round(g.total_volume * 100) / 100,
    total_net: Math.round(g.total_net * 100) / 100,
    entity: entityMap[key] || null,
  }));

  return res.status(200).json({ entities: result });
}

// ── Settings: get/update commission rates ───────────────────────────
async function handleSettings(req: VercelRequest, sb: any, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data, error } = await sb.from('platform_settings').select('key, value');
    if (error) return res.status(500).json({ error: error.message });
    const settings: Record<string, string> = {};
    for (const r of data || []) settings[r.key] = r.value;
    return res.status(200).json({ settings });
  }

  if (req.method === 'POST') {
    const body = req.body as Record<string, string>;
    const allowed = ['perlas_platform_fee_percent', 'perlas_provider_fee_percent', 'perlas_platform_fee_fixed', 'perlas_provider_fee_fixed', 'perlas_payout_fee_fixed'];
    const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
    for (const [key, value] of updates) {
      const num = Number(value);
      if (isNaN(num) || num < 0) return res.status(400).json({ error: `Invalid value for ${key}: must be a non-negative number` });
      if (key.endsWith('_percent') && num > 100) return res.status(400).json({ error: `${key} cannot exceed 100%` });
      if (key.endsWith('_fixed') && num > 1000) return res.status(400).json({ error: `${key} cannot exceed 1000 EUR` });
    }
    for (const [key, value] of updates) {
      await sb.from('platform_settings').upsert({ key, value: String(Number(value)), updated_at: new Date().toISOString() });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Generate XML: reserve pending entries, generate SEPA pain.001 ───
async function handleGenerateXml(sb: any, req: VercelRequest, res: VercelResponse) {
  const { data: pending, error: pendErr } = await sb
    .from('perlas_ledger')
    .select('id, entity_type, entity_id, net_amount')
    .eq('status', 'pending');

  if (pendErr) return res.status(500).json({ error: pendErr.message });
  if (!pending || pending.length === 0) return res.status(400).json({ error: 'No pending entries to export' });

  // Aggregate by entity
  const grouped: Record<string, { entity_type: string; entity_id: string; total_net: number; ledger_ids: string[] }> = {};
  for (const row of pending) {
    const key = `${row.entity_type}:${row.entity_id}`;
    if (!grouped[key]) grouped[key] = { entity_type: row.entity_type, entity_id: row.entity_id, total_net: 0, ledger_ids: [] };
    grouped[key].total_net += Number(row.net_amount);
    grouped[key].ledger_ids.push(row.id);
  }

  const entities = Object.values(grouped);
  const allEntityIds = entities.map(e => e.entity_id);
  const tutorIds = entities.filter(e => e.entity_type === 'tutor').map(e => e.entity_id);
  const orgIds = entities.filter(e => e.entity_type === 'org').map(e => e.entity_id);

  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    tutorIds.length > 0
      ? sb.from('profiles').select('id, payout_iban, payout_recipient_name, payout_bank_bic, payout_country, payout_city, payout_address, payout_postal_code').in('id', tutorIds)
      : { data: [] },
    orgIds.length > 0
      ? sb.from('organizations').select('id, payout_iban, payout_recipient_name, payout_bank_bic, payout_country, payout_city, payout_address, payout_postal_code').in('id', orgIds)
      : { data: [] },
  ]);

  const entityMap: Record<string, any> = {};
  for (const p of profiles || []) entityMap[`tutor:${p.id}`] = p;
  for (const o of orgs || []) entityMap[`org:${o.id}`] = o;

  // Load per-payout bank transfer fee
  const { data: payoutFeeRow } = await sb
    .from('platform_settings')
    .select('value')
    .eq('key', 'perlas_payout_fee_fixed')
    .maybeSingle();
  const payoutFee = Number(payoutFeeRow?.value || 0);

  // Filter out entities missing IBAN or with insufficient net amount after payout fee
  const validEntities = entities.filter(e => {
    const info = entityMap[`${e.entity_type}:${e.entity_id}`];
    return info?.payout_iban && info?.payout_recipient_name && (e.total_net - payoutFee) > 0;
  });

  if (validEntities.length === 0) {
    return res.status(400).json({ error: 'No entities have valid IBAN/name configured or sufficient balance after payout fee' });
  }

  // Apply per-payout fee: each entity pays one bank transfer fee
  for (const e of validEntities) {
    e.total_net = Math.round((e.total_net - payoutFee) * 100) / 100;
  }

  const allLedgerIds = validEntities.flatMap(e => e.ledger_ids);
  const totalAmount = validEntities.reduce((sum, e) => sum + e.total_net, 0);
  const roundedTotal = Math.round(totalAmount * 100) / 100;

  // Create batch record
  const { data: batch, error: batchErr } = await sb
    .from('payout_batches')
    .insert({
      total_amount: roundedTotal,
      entry_count: allLedgerIds.length,
      status: 'generated',
      xml_filename: `payout_batch_${new Date().toISOString().slice(0, 10)}.xml`,
    })
    .select('id, xml_filename')
    .single();

  if (batchErr || !batch) return res.status(500).json({ error: batchErr?.message || 'Failed to create batch' });

  // Reserve ledger entries
  const { error: reserveErr } = await sb
    .from('perlas_ledger')
    .update({ status: 'reserved', batch_id: batch.id })
    .in('id', allLedgerIds)
    .eq('status', 'pending');

  if (reserveErr) {
    console.error('[admin-perlas-payouts] reserve error:', reserveErr.message);
  }

  // Generate SEPA pain.001 XML
  const batchId = batch.id;
  const now = new Date().toISOString().slice(0, 19); // pain.001 ISODateTime: no millis/Z
  const xml = generateSepaXml(batchId, now, validEntities, entityMap, roundedTotal);

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${batch.xml_filename}"`);
  return res.status(200).send(xml);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function generateSepaXml(
  batchId: string,
  creationTime: string,
  entities: { entity_type: string; entity_id: string; total_net: number }[],
  entityMap: Record<string, any>,
  controlSum: number,
): string {
  const nbOfTxs = entities.length;
  const execDate = creationTime.slice(0, 10);
  // pain.001 MsgId & PmtInfId are Max35Text — UUID (36 chars) exceeds this
  const shortId = batchId.replace(/-/g, ''); // 32-char hex
  const msgId = `MSG${shortId}`.slice(0, 35);
  const pmtInfId = `PMT${shortId}`.slice(0, 35);

  const txEntries = entities.map((e, i) => {
    const info = entityMap[`${e.entity_type}:${e.entity_id}`];
    const amount = (Math.round(e.total_net * 100) / 100).toFixed(2);
    const name = escapeXml((info.payout_recipient_name || '').slice(0, 70));
    const iban = escapeXml(info.payout_iban || '');
    const bic = info.payout_bank_bic ? escapeXml(info.payout_bank_bic) : '';

    const lines = [
      '            <CdtTrfTxInf>',
      '                <PmtId>',
      `                    <EndToEndId>PAYMENT-${String(i + 1).padStart(3, '0')}</EndToEndId>`,
      '                </PmtId>',
      '                <Amt>',
      `                    <InstdAmt Ccy="EUR">${amount}</InstdAmt>`,
      '                </Amt>',
    ];
    if (bic) {
      lines.push(
        '                <CdtrAgt>',
        '                    <FinInstnId>',
        `                        <BIC>${bic}</BIC>`,
        '                    </FinInstnId>',
        '                </CdtrAgt>',
      );
    }
    lines.push(
      '                <Cdtr>',
      `                    <Nm>${name}</Nm>`,
      '                </Cdtr>',
      '                <CdtrAcct>',
      '                    <Id>',
      `                        <IBAN>${iban}</IBAN>`,
      '                    </Id>',
      '                </CdtrAcct>',
      '                <RmtInf>',
      `                    <Ustrd>Tutlio ismokejimas</Ustrd>`,
      '                </RmtInf>',
      '            </CdtTrfTxInf>',
    );
    return lines.join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>${msgId}</MsgId>
            <CreDtTm>${creationTime}</CreDtTm>
            <NbOfTxs>${nbOfTxs}</NbOfTxs>
            <CtrlSum>${controlSum.toFixed(2)}</CtrlSum>
            <InitgPty>
                <Nm>${DEBTOR_NAME}</Nm>
            </InitgPty>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>${pmtInfId}</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <BtchBookg>true</BtchBookg>
            <NbOfTxs>${nbOfTxs}</NbOfTxs>
            <CtrlSum>${controlSum.toFixed(2)}</CtrlSum>
            <PmtTpInf>
                <SvcLvl>
                    <Cd>SEPA</Cd>
                </SvcLvl>
            </PmtTpInf>
            <ReqdExctnDt>${execDate}</ReqdExctnDt>
            <Dbtr>
                <Nm>${DEBTOR_NAME}</Nm>
            </Dbtr>
            <DbtrAcct>
                <Id>
                    <IBAN>${DEBTOR_IBAN}</IBAN>
                </Id>
            </DbtrAcct>
            <DbtrAgt>
                <FinInstnId>
                    <BIC>${DEBTOR_BIC}</BIC>
                </FinInstnId>
            </DbtrAgt>
            <ChrgBr>SLEV</ChrgBr>
${txEntries}
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>`;
}

// ── Mark batch as paid ──────────────────────────────────────────────
async function handleMarkPaid(sb: any, req: VercelRequest, res: VercelResponse) {
  const { batchId } = req.body as { batchId?: string };
  if (!batchId) return res.status(400).json({ error: 'batchId required' });

  const { data: batch } = await sb.from('payout_batches').select('status').eq('id', batchId).single();
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  if (batch.status !== 'generated') return res.status(400).json({ error: `Batch is already ${batch.status}` });

  const now = new Date().toISOString();
  const { error: ledgerErr } = await sb
    .from('perlas_ledger')
    .update({ status: 'paid_out', paid_out_at: now })
    .eq('batch_id', batchId)
    .eq('status', 'reserved');

  if (ledgerErr) return res.status(500).json({ error: ledgerErr.message });

  await sb.from('payout_batches').update({ status: 'paid', completed_at: now }).eq('id', batchId);

  return res.status(200).json({ ok: true });
}

// ── Mark batch as cancelled ─────────────────────────────────────────
async function handleMarkCancelled(sb: any, req: VercelRequest, res: VercelResponse) {
  const { batchId } = req.body as { batchId?: string };
  if (!batchId) return res.status(400).json({ error: 'batchId required' });

  const { data: batch } = await sb.from('payout_batches').select('status').eq('id', batchId).single();
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  if (batch.status !== 'generated') return res.status(400).json({ error: `Batch is already ${batch.status}` });

  const { error: ledgerErr } = await sb
    .from('perlas_ledger')
    .update({ status: 'pending', batch_id: null })
    .eq('batch_id', batchId)
    .eq('status', 'reserved');

  if (ledgerErr) return res.status(500).json({ error: ledgerErr.message });

  await sb.from('payout_batches').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', batchId);

  return res.status(200).json({ ok: true });
}

// ── Mark individual entity entries in a batch ───────────────────────
async function handleMarkIndividual(sb: any, req: VercelRequest, res: VercelResponse) {
  const { entityType, entityId, batchId, paid } = req.body as { entityType?: string; entityId?: string; batchId?: string; paid?: boolean };
  if (!entityType || !entityId || !batchId) return res.status(400).json({ error: 'entityType, entityId, batchId required' });

  if (paid) {
    await sb.from('perlas_ledger')
      .update({ status: 'paid_out', paid_out_at: new Date().toISOString() })
      .eq('batch_id', batchId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'reserved');
  } else {
    await sb.from('perlas_ledger')
      .update({ status: 'pending', batch_id: null })
      .eq('batch_id', batchId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'reserved');
  }

  return res.status(200).json({ ok: true });
}

// ── Batches list ────────────────────────────────────────────────────
async function handleBatches(sb: any, res: VercelResponse) {
  const { data, error } = await sb
    .from('payout_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ batches: data || [] });
}

// ── Main handler ────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Database not configured' });

  const action = String(req.query.action || '');

  const isPost = req.method === 'POST';

  switch (action) {
    case 'summary': return handleSummary(sb, res);
    case 'settings': return handleSettings(req, sb, res);
    case 'generate-xml':
      if (!isPost) return res.status(405).json({ error: 'Use POST for generate-xml' });
      return handleGenerateXml(sb, req, res);
    case 'mark-paid':
      if (!isPost) return res.status(405).json({ error: 'Use POST' });
      return handleMarkPaid(sb, req, res);
    case 'mark-cancelled':
      if (!isPost) return res.status(405).json({ error: 'Use POST' });
      return handleMarkCancelled(sb, req, res);
    case 'mark-individual':
      if (!isPost) return res.status(405).json({ error: 'Use POST' });
      return handleMarkIndividual(sb, req, res);
    case 'batches': return handleBatches(sb, res);
    default: return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}
