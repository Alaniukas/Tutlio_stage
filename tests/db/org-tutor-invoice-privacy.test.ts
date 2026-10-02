import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const sql=readFileSync('supabase/migrations/20261001134513_org_tutor_invoice_privacy.sql','utf8');
const id=(n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db: PGlite;
beforeAll(async () => {
  db=new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY,name text,entity_type text DEFAULT 'company',features jsonb DEFAULT '{}');
    CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,full_name text);
    CREATE TABLE organization_admins(user_id uuid,organization_id uuid);
    CREATE TABLE invoice_profiles(user_id uuid,organization_id uuid,business_name text,company_code text);
    CREATE TABLE invoices(id uuid PRIMARY KEY,organization_id uuid,issued_by_user_id uuid,buyer_snapshot jsonb,
      seller_snapshot jsonb,pdf_meta jsonb,pdf_storage_path text,billing_batch_id uuid,source_session_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE invoice_line_items(id uuid PRIMARY KEY,invoice_id uuid);
    CREATE TABLE lesson_packages(manual_sales_invoice_id uuid);
    CREATE TABLE family_invoice_links(invoice_id uuid,user_id uuid);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text);
    CREATE FUNCTION parent_can_view_sales_invoice(i uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM family_invoice_links f WHERE f.invoice_id=i AND f.user_id=auth.uid()) $$;
    CREATE FUNCTION student_can_view_sales_invoice(i uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY invoices_tutor_all ON invoices FOR ALL USING (issued_by_user_id=auth.uid());
    CREATE POLICY invoices_org_admin_select ON invoices FOR SELECT USING (organization_id IN (SELECT organization_id FROM organization_admins WHERE user_id=auth.uid()));
    CREATE POLICY invoices_parent_select ON invoices FOR SELECT USING (parent_can_view_sales_invoice(id));
    CREATE POLICY invoice_lines_issuer ON invoice_line_items FOR ALL USING (invoice_id IN (SELECT id FROM invoices WHERE issued_by_user_id=auth.uid()));
    CREATE POLICY invoice_lines_parent ON invoice_line_items FOR SELECT USING (parent_can_view_sales_invoice(invoice_id));
    CREATE POLICY pdf_issuer ON storage.objects FOR ALL USING (bucket_id='invoices' AND EXISTS(SELECT 1 FROM invoices i WHERE i.pdf_storage_path=objects.name AND i.issued_by_user_id=auth.uid()));
    CREATE POLICY pdf_parent ON storage.objects FOR SELECT USING (bucket_id='invoices' AND EXISTS(SELECT 1 FROM invoices i WHERE i.pdf_storage_path=objects.name AND parent_can_view_sales_invoice(i.id)));
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO authenticated;
    INSERT INTO organizations(id,name) VALUES ('${id(1)}','Pro Klasė');
    INSERT INTO profiles VALUES ('${id(2)}','${id(1)}','ADMINISTRACIJOS KOREPETITORIUS'),('${id(3)}','${id(1)}','Other teacher');
    INSERT INTO organization_admins VALUES ('${id(4)}','${id(1)}');
    INSERT INTO invoice_profiles VALUES (NULL,'${id(1)}','MB POKALBIŲ ERDVĖ','123');
  `);
  const fixtures=[
    [11,id(2),'Ruste',null], // Exact incident: customer sale attributed to tutor, no lesson references.
    [12,id(4),'Client',null],
    [13,id(2),'MB POKALBIŲ ERDVĖ',{ invoiceKind:'tutor_pay',tutorId:id(2) }],
    [14,id(4),'MB POKALBIŲ ERDVĖ',{ invoiceKind:'tutor_pay',tutorId:id(2) }],
    [15,id(3),'MB POKALBIŲ ERDVĖ',{ invoiceKind:'tutor_pay',tutorId:id(3) }],
    [16,id(2),'MB POKALBIŲ ERDVĖ',null], // Unambiguous historical tutor -> org invoice.
    [17,id(4),'MB POKALBIŲ ERDVĖ',{ layout:'school_tutor_meetings',tutorId:id(2) }],
    [18,id(2),'Unknown buyer',null],
  ] as const;
  for (const [n,issuer,buyer,meta] of fixtures) {
    await db.query('INSERT INTO invoices(id,organization_id,issued_by_user_id,buyer_snapshot,seller_snapshot,pdf_meta,pdf_storage_path) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id(n),id(1),issuer,{ name:buyer },{ name:'ADMINISTRACIJOS KOREPETITORIUS' },meta,`${n}.pdf`]);
    await db.query('INSERT INTO invoice_line_items VALUES($1,$2)',[id(n+100),id(n)]);
    await db.query("INSERT INTO storage.objects VALUES($1,'invoices',$2)",[id(n+200),`${n}.pdf`]);
  }
  await db.exec(`INSERT INTO family_invoice_links VALUES('${id(11)}','${id(5)}'),('${id(13)}','${id(5)}');`);
  await db.exec(sql);
},30_000);
afterAll(async () => { await db?.close(); });
async function asUser<T=any>(user: string,query: string) {
  await db.exec('SET ROLE authenticated');
  try { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]); return (await db.query<T>(query)).rows; }
  finally { await db.exec('RESET ROLE'); }
}
describe('actual PostgreSQL invoice access policies', () => {
  it.each([
    ['Pro Klasė QA', 'company', 700],
    ['Unconfigured tutor organization', 'company', 800],
    ['Unconfigured school', 'school', 900],
  ] as const)('protects invoices, line items, and PDF storage in %s with all feature flags off', async (name, entityType, seed) => {
    const orgId = id(seed), tutorId = id(seed + 1), otherTutorId = id(seed + 2);
    const customerId = id(seed + 10), ownId = id(seed + 11), otherPayId = id(seed + 12);
    await db.query('INSERT INTO organizations(id,name,entity_type,features) VALUES($1,$2,$3,$4)', [orgId,name,entityType,{}]);
    await db.query('INSERT INTO profiles VALUES($1,$2,$3)', [tutorId,orgId,'Tutor']);
    for (const [invoiceId, buyer, meta] of [
      [customerId,'Private customer',null],
      [ownId,name,{ invoiceKind:'tutor_pay',tutorId }],
      [otherPayId,name,{ invoiceKind:'tutor_pay',tutorId:otherTutorId }],
    ] as const) {
      await db.query('INSERT INTO invoices(id,organization_id,issued_by_user_id,buyer_snapshot,pdf_meta,pdf_storage_path) VALUES($1,$2,$3,$4,$5,$6)',
        [invoiceId,orgId,tutorId,{name:buyer},meta,`${invoiceId}.pdf`]);
      await db.query('INSERT INTO invoice_line_items VALUES($1,$2)',[invoiceId,invoiceId]);
      await db.query("INSERT INTO storage.objects VALUES($1,'invoices',$2)",[invoiceId,`${invoiceId}.pdf`]);
    }
    expect((await asUser(tutorId,'SELECT id FROM invoices')).map(r => r.id)).toEqual([ownId]);
    expect((await asUser(tutorId,'SELECT invoice_id FROM invoice_line_items')).map(r => r.invoice_id)).toEqual([ownId]);
    expect((await asUser(tutorId,'SELECT name FROM storage.objects')).map(r => r.name)).toEqual([`${ownId}.pdf`]);
    expect(await asUser(id(2),`SELECT id FROM invoices WHERE organization_id='${orgId}'`)).toEqual([]);
  });
  it('denies the reported automatic client invoice, and preserves only own tutor pay', async () => {
    expect((await asUser(id(2),'SELECT id FROM invoices ORDER BY id')).map(r => r.id)).toEqual([13,14,16,17].map(id));
    expect((await asUser(id(2),'SELECT invoice_id FROM invoice_line_items ORDER BY invoice_id')).map(r => r.invoice_id)).toEqual([13,14,16,17].map(id));
    expect((await asUser(id(2),"SELECT name FROM storage.objects ORDER BY name")).map(r => r.name)).toEqual(['13.pdf','14.pdf','16.pdf','17.pdf']);
  });
  it('preserves genuine customer access for parents without exposing tutor pay', async () => {
    expect((await asUser(id(5),'SELECT id FROM invoices')).map(r => r.id)).toEqual([id(11)]);
    expect((await asUser(id(5),'SELECT invoice_id FROM invoice_line_items')).map(r => r.invoice_id)).toEqual([id(11)]);
    expect((await asUser(id(5),'SELECT name FROM storage.objects')).map(r => r.name)).toEqual(['11.pdf']);
  });
  it('preserves organization admin invoices and denies unrelated users', async () => {
    expect(await asUser(id(4),'SELECT id FROM invoices')).toHaveLength(8);
    expect(await asUser(id(6),'SELECT id FROM invoices')).toEqual([]);
  });
  it('does not permit the nominal issuer to reclassify a hidden customer invoice', async () => {
    expect(await asUser(id(2),`UPDATE invoices SET pdf_meta='{"invoiceKind":"tutor_pay","tutorId":"${id(2)}"}' WHERE id='${id(11)}' RETURNING id`)).toEqual([]);
    await expect(asUser(id(2),`INSERT INTO invoices(id,organization_id,issued_by_user_id,buyer_snapshot) VALUES('${id(50)}','${id(1)}','${id(2)}','{"name":"Client"}')`)).rejects.toThrow(/row-level security/);
  });
  it('remains closed if a future permissive policy allows every row', async () => {
    await db.exec(`CREATE POLICY accidental_broad_access ON invoices FOR ALL USING(true) WITH CHECK(true);
      CREATE POLICY accidental_broad_lines ON invoice_line_items FOR ALL USING(true) WITH CHECK(true);
      CREATE POLICY accidental_broad_pdf ON storage.objects FOR ALL USING(true) WITH CHECK(true);`);
    expect((await asUser(id(2),'SELECT id FROM invoices ORDER BY id')).map(r => r.id)).toEqual([13,14,16,17].map(id));
    expect(await asUser(id(2),`SELECT id FROM invoice_line_items WHERE invoice_id='${id(11)}'`)).toEqual([]);
    expect(await asUser(id(2),"SELECT id FROM storage.objects WHERE name='11.pdf'")).toEqual([]);
    await db.exec('DROP POLICY accidental_broad_access ON invoices; DROP POLICY accidental_broad_lines ON invoice_line_items; DROP POLICY accidental_broad_pdf ON storage.objects;');
  });
  it('can be applied again without changing invoice classification', async () => {
    await db.exec(sql);
    expect((await db.query<any>(`SELECT pdf_meta FROM invoices WHERE id='${id(11)}'`)).rows[0].pdf_meta).toBeNull();
    expect((await db.query<any>(`SELECT pdf_meta FROM invoices WHERE id='${id(16)}'`)).rows[0].pdf_meta).toEqual({ invoiceKind:'tutor_pay',tutorId:id(2) });
  });
});
