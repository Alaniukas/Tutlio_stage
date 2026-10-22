/** Read-only production audit. Writes reports locally; never changes database records or sends mail. */
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import { schoolMeetingOccurrences } from '../src/lib/schoolSessionMonitoring.js';
import { schoolTutorPayOccurrences } from '../src/lib/schoolTutorLessonPay.js';
import { resolveSchoolTutorGroupPayRate } from '../src/lib/schoolTutorDefaultPay.js';
import { loadSchoolTutorAttendancePayRows } from '../api/_lib/schoolTutorAttendancePay.js';

process.loadEnvFile('.env');
const orgId = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const url = process.env.VITE_SUPABASE_URL;
if (url !== 'https://cuhciqwmqfuajeeqjjbm.supabase.co' || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Expected the configured production project and server credentials');
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const now = new Date();
const cutoff = new Date(Math.min(now.getTime(), Date.parse('2026-10-22T00:00:00+03:00')));
const from = '2026-09-01T00:00:00+03:00';
const until = '2026-10-22T00:00:00+03:00';
const local = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kiev', year: 'numeric',
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const cell = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const getRows = <T>(query: (first: number, last: number) => any) => fetchAllRows<T>(query, 20_000);

const [sessions, attestations, invoices, teacherInvoices, orgResult] = await Promise.all([
  getRows<any>((first, last) => db.from('sessions').select(`id,tutor_id,student_id,class_group_id,subject_id,start_time,end_time,
    status,status_confirmed_at,status_confirmed_by,tutor_joined_at,student_joined_at,tutor_pay_eur_snapshot,
    no_show_reason,cancelled_by,created_at,meeting_link,students!inner(organization_id,full_name),
    subjects(name,is_group),class_group:school_class_groups!sessions_class_group_id_fkey(name)`)
    .eq('students.organization_id', orgId).gte('start_time', from).lt('start_time', until).lte('end_time', cutoff.toISOString())
    .order('start_time').order('id').range(first, last)),
  getRows<any>((first, last) => db.from('school_group_attendance_attestations')
    .select('id,tutor_id,group_id,start_time,end_time,confirmed_at,confirmed_by,status')
    .eq('organization_id', orgId).gte('start_time', from).lt('start_time', until).lte('end_time', cutoff.toISOString())
    .order('id').range(first, last)),
  getRows<any>((first, last) => db.from('school_monthly_invoices')
    .select('id,invoice_number,student_id,payment_status,total_eur,discount_amount_eur,period_start,period_end,lines:school_monthly_invoice_lines(id,quantity,unit_price_eur,amount_eur,session_ids,session_id)')
    .eq('organization_id', orgId).neq('payment_status', 'cancelled').gte('period_start', '2026-09-01').lt('period_start', '2026-11-01')
    .order('id').range(first, last)),
  getRows<any>((first, last) => db.from('invoices')
    .select('id,invoice_number,status,total_amount,period_start,period_end,pdf_meta,lines:invoice_line_items(session_ids,school_attendance_ids,quantity,total_price)')
    .eq('organization_id', orgId).eq('pdf_meta->>invoiceKind', 'tutor_pay').neq('status', 'cancelled')
    .gte('period_end', '2026-09-01').lt('period_start', '2026-11-01').order('id').range(first, last)),
  db.from('organizations').select('default_company_commission_percent,features').eq('id', orgId).single(),
]);
if (orgResult.error) throw new Error(orgResult.error.message);
if (sessions.length >= 20_000 || new Set(sessions.map(row => row.id)).size !== sessions.length) throw new Error('Incomplete session pagination');
// Do not retain private join URLs in the report or diagnostic objects.
for (const row of sessions) { row.has_meeting_link = Boolean(row.meeting_link); delete row.meeting_link; }
const tutorIds = [...new Set<string>([...sessions, ...attestations].map(row => row.tutor_id).filter(Boolean))];
const profileResult = await db.from('profiles').select('id,full_name,company_commission_percent,company_individual_commission_percent').in('id', tutorIds);
if (profileResult.error || profileResult.data?.length !== tutorIds.length) throw new Error('Incomplete teacher profiles');
const profiles = new Map(profileResult.data.map(row => [row.id, row]));
const attendance: any[] = [];
for (let index = 0; index < tutorIds.length; index += 4) {
  const batch = await Promise.all(tutorIds.slice(index, index + 4).map(tutorId => loadSchoolTutorAttendancePayRows(db, {
    tutorId, organizationId: orgId, periodStart: '2026-09-01', periodEnd: '2026-10-21', now: cutoff,
  })));
  attendance.push(...batch.flat());
}
const attById = new Map(attestations.map(row => [row.id, row]));
for (const row of attendance) row.status_confirmed_by = attById.get(row.id)?.confirmed_by;
const allRows = [...sessions, ...attendance];
const operationalRows = [...sessions, ...attendance.filter(row => !row.pay_evidence_only)];
const meetings = schoolMeetingOccurrences<any>(operationalRows);
const paidSources = new Map<string, any[]>();
for (const invoice of invoices) for (const line of invoice.lines || []) {
  const ids = [...new Set<string>([...(line.session_ids || []), ...(line.session_id ? [line.session_id] : [])])];
  for (const id of ids) {
    const list = paidSources.get(id) || [];
    list.push({ invoiceNumber: invoice.invoice_number, invoiceId: invoice.id, status: invoice.payment_status,
      netLineUnitEur: Number(line.quantity) > 0 ? Number(line.amount_eur) / Number(line.quantity) : null,
      lineQuantity: Number(line.quantity), lineAmountEur: Number(line.amount_eur), invoiceDiscountEur: Number(invoice.discount_amount_eur || 0) });
    paidSources.set(id, list);
  }
}
const teacherSources = new Map<string, string[]>();
for (const invoice of teacherInvoices) for (const line of invoice.lines || []) for (const id of line.session_ids || []) {
  teacherSources.set(id, [...(teacherSources.get(id) || []), invoice.invoice_number]);
}
const isManual = (row: any) => row.status === 'completed' && row.status_confirmed_by && row.status_confirmed_at
  && Date.parse(row.status_confirmed_at) >= Date.parse(row.end_time);
const isLegacy = (row: any) => row.status === 'completed' && !row.status_confirmed_by && row.status_confirmed_at
  && Date.parse(row.status_confirmed_at) === Date.parse(row.end_time);
const describe = (meeting: any) => {
  const real = meeting.rows.filter((row: any) => row.source_kind !== 'attendance');
  const row = meeting.row;
  return { key: meeting.key, tutorId: row.tutor_id, teacher: profiles.get(row.tutor_id)?.full_name,
    localTime: local(row.start_time), activity: row.class_group?.name || row.subjects?.name || 'Nenurodytas dalykas',
    studentNames: [...new Set(real.map((child: any) => child.students?.full_name).filter(Boolean))],
    sessionIds: real.map((child: any) => child.id),
    testNamed: /^(test|demo|bandym)/i.test(row.class_group?.name || '')
      || (real.length > 0 && real.every((child: any) => /(test|demo|bandym)/i.test(child.students?.full_name || ''))),
    createdAfterLesson: real.length > 0 && real.every((child: any) => Date.parse(child.created_at) > Date.parse(child.end_time)),
    studentInvoices: real.flatMap((child: any) => paidSources.get(child.id) || []),
    teacherInvoices: [...new Set(real.flatMap((child: any) => teacherSources.get(child.id) || []))] };
};
const septemberReview = meetings.filter(meeting => local(meeting.row.start_time).startsWith('2026-09')
  && meeting.row.status === 'completed' && meeting.rows.some(isLegacy) && !meeting.rows.some(isManual)
  && !meeting.rows.some(row => row.tutor_joined_at || row.student_joined_at)).map(describe);
const legacyMeetings = meetings.filter(meeting => meeting.row.status === 'completed'
  && meeting.rows.some(isLegacy) && !meeting.rows.some(isManual));

// For this snapshot every no_show has a confirmation stamp. Thus the ordinary
// non-confirmation projection exactly reproduces the old completed-status pay
// policy, without accidentally including unconfirmed no_show outcomes.
if (sessions.some(row => row.status === 'no_show' && !row.status_confirmed_at)) throw new Error('Review unstamped absence before comparing pay policies');
const monthly: any[] = [];
const awaiting: any[] = [];
const legacyPay: any[] = [];
for (const tutorId of tutorIds) for (const month of ['2026-09', '2026-10']) {
  const profile = profiles.get(tutorId)!;
  const rows = allRows.filter(row => row.tutor_id === tutorId && local(row.start_time).startsWith(month));
  if (!rows.length) continue;
  const rate = resolveSchoolTutorGroupPayRate({ tutorRate: profile.company_commission_percent,
    orgDefaultRate: orgResult.data.default_company_commission_percent, organizationId: orgId });
  const options = { individualRate: profile.company_individual_commission_percent };
  const oldPay = schoolTutorPayOccurrences<any>(rows, rate, cutoff, { ...options, requireConfirmation: false });
  const strictPay = schoolTutorPayOccurrences<any>(rows, rate, cutoff, { ...options, requireConfirmation: true });
  const confirmed = new Set(strictPay.map(occurrence => occurrence.key));
  const missing = oldPay.filter(occurrence => !confirmed.has(occurrence.key));
  const amount = (items: any[]) => Math.round(items.reduce((sum, occurrence) => sum + (occurrence.payEur || 0), 0) * 100) / 100;
  monthly.push({ teacher: profile.full_name, tutorId, month, storedStatusMeetings: oldPay.length, requiredConfirmationMeetings: strictPay.length,
    awaitingConfirmation: missing.length, storedStatusPayEur: amount(oldPay), requiredConfirmationPayEur: amount(strictPay),
    awaitingConfirmationPayEur: amount(missing), unresolvedRates: oldPay.filter(occurrence => occurrence.payIssue).length });
  for (const occurrence of missing) {
    const meeting = meetings.find(item => item.key === occurrence.key)!;
    awaiting.push({ ...describe(meeting), payEur: occurrence.payEur,
      hasStudentJoin: meeting.rows.some(row => row.student_joined_at), hasTeacherJoin: meeting.rows.some(row => row.tutor_joined_at) });
  }
  legacyPay.push(...oldPay.map(occurrence => ({ ...occurrence, teacher: profile.full_name })));
}
const overlaps: any[] = [];
for (let index = 0; index < legacyPay.length; index++) for (let second = index + 1; second < legacyPay.length; second++) {
  const a = legacyPay[index], b = legacyPay[second];
  if (a.row.tutor_id !== b.row.tutor_id || Date.parse(a.row.start_time) >= Date.parse(b.row.end_time)
    || Date.parse(b.row.start_time) >= Date.parse(a.row.end_time)) continue;
  const firstMeeting = meetings.find(item => item.key === a.key), secondMeeting = meetings.find(item => item.key === b.key);
  if (firstMeeting && secondMeeting) overlaps.push({ first: describe(firstMeeting), second: describe(secondMeeting),
    combinedTutorPayEur: Number(a.payEur || 0) + Number(b.payEur || 0) });
}
// Six simultaneous sources produce fifteen pairs but describe one disputed time slot.
const parents = new Map<string, string>();
const root = (key: string): string => {
  if (!parents.has(key)) parents.set(key, key);
  const parent = parents.get(key)!;
  if (parent === key) return key;
  const resolved = root(parent); parents.set(key, resolved); return resolved;
};
for (const pair of overlaps) parents.set(root(pair.second.key), root(pair.first.key));
const conflicts = new Map<string, string[]>();
for (const key of parents.keys()) { const keyRoot = root(key); conflicts.set(keyRoot, [...(conflicts.get(keyRoot) || []), key]); }
const meetingByKey = new Map(meetings.map(meeting => [meeting.key, meeting]));
const payByKey = new Map(legacyPay.map(occurrence => [occurrence.key, occurrence]));
const conflictStudentIds = [...new Set([...parents.keys()].flatMap(key => meetingByKey.get(key)!.rows
  .filter(row => row.source_kind !== 'attendance').map(row => row.student_id).filter(Boolean)))];
const contracts = conflictStudentIds.length ? await getRows<any>((first, last) => db.from('school_contracts')
  .select('id,student_id,class_group_id,service_name:order_snapshot->>service_name,signing_status')
  .eq('organization_id', orgId).eq('kind', 'extra_lessons').in('student_id', conflictStudentIds).order('id').range(first, last)) : [];
const overlapGroups = [...conflicts.values()].map(keys => {
  const sources = keys.map(key => meetingByKey.get(key)!);
  const paid = keys.map(key => payByKey.get(key)!);
  const teacher = paid[0].teacher;
  const studentIds = [...new Set(sources.flatMap(meeting => meeting.rows.filter(row => row.source_kind !== 'attendance')
    .map(row => row.student_id).filter(Boolean)))];
  const childServices = studentIds.map(studentId => new Set<string>(contracts
    .filter(contract => contract.student_id === studentId && contract.service_name?.includes(teacher))
    .map(contract => contract.service_name)));
  const commonServices = childServices.length ? [...childServices[0]].filter(service => childServices.every(set => set.has(service))) : [];
  const starts = sources.map(meeting => Date.parse(meeting.row.start_time));
  const ends = sources.map(meeting => Date.parse(meeting.row.end_time));
  const sameStart = new Set(starts).size === 1;
  const sameEnd = new Set(ends).size === 1;
  const sumPayEur = paid.reduce((sum, occurrence) => sum + Number(occurrence.payEur || 0), 0);
  const rates = [...new Set<number>(paid.map(occurrence => Number(occurrence.payEur)))];
  const commonGroupEvidence = commonServices.length === 1 && !/individual/i.test(commonServices[0]);
  const sourceInvoiceNumbers = [...new Set(sources.flatMap(meeting => describe(meeting).teacherInvoices))];
  return { teacher, localTime: local(new Date(Math.min(...starts)).toISOString()), sourceCount: keys.length,
    sameStart, sameEnd, commonServices, commonGroupEvidence, storedPayEur: sumPayEur,
    singleMeetingRateEur: rates.length === 1 ? rates[0] : null,
    differenceIfOneMeetingEur: rates.length === 1 ? sumPayEur - rates[0] : null,
    existingTeacherInvoices: sourceInvoiceNumbers, sources: sources.map(describe) };
}).sort((a, b) => a.localTime.localeCompare(b.localTime) || a.teacher.localeCompare(b.teacher));
const report = { checkedAt: cutoff.toISOString(), scope: { organizationId: orgId, from: '2026-09-01', through: '2026-10-21', teachers: tutorIds.length,
  sessionRows: sessions.length, attendanceFacts: attestations.length, operationalMeetings: meetings.length,
  sourceStudentInvoices: invoices.length, teacherInvoices: teacherInvoices.length },
  notes: ['Read-only investigation; no financial or attendance records changed and no messages sent.',
    'Missing joins and legacy confirmation stamps do not establish that a lesson did not happen.',
    'A September session created after its end time may be a legitimate historical entry.',
    'Net line unit amounts can be zero where a discount already covers the lesson.',
    'Test-named records are reported separately; no records were deleted or excluded from product calculations.'],
  septemberReview, legacyMeetingsCount: legacyMeetings.length, monthly, awaitingConfirmation: awaiting, overlapGroups,
  teacherInvoiceSummaries: teacherInvoices.map(invoice => ({ id: invoice.id, number: invoice.invoice_number,
    amount: Number(invoice.total_amount), status: invoice.status, periodStart: invoice.period_start, periodEnd: invoice.period_end })),
  overlappingSourceContractEvidence: contracts, overlaps };
const output = 'output/qa/laisvi-lesson-outcomes-20261021';
await mkdir('output/qa', { recursive: true });
await writeFile(`${output}.json`, JSON.stringify(report, null, 2));
const detail = ['# Laisvi vaikai: pamokų įrašų patikra', '', `Patikrinta: ${local(cutoff.toISOString())}. Laikotarpis: 2026-09-01–2026-10-21.`,
  `Apimtis: ${tutorIds.length} mokytojų, ${sessions.length} mokinių pamokų eilučių, ${attestations.length} atskirų lankomumo faktų.`, '',
  'Duomenys ir sąskaitos nekeisti. Prisijungimų nebuvimas savaime neįrodo, kad pamoka nevyko.', '',
  '## Pakartotinio atlygio skaičiavimo atvejai', '',
  '| Mokytojas | Data ir laikas | Skaičiuojami įrašai | Įtraukta į atlygį | Vieno užsiėmimo tarifas | Skirtumas, jei tai vienas užsiėmimas | Esama mokytojo sąskaita | Sutartyse sutampanti grupė |',
  '|---|---|---:|---:|---:|---:|---|---|',
  ...overlapGroups.map(group => `| ${cell(group.teacher)} | ${cell(group.localTime)} | ${group.sourceCount} | ${group.storedPayEur} € | ${group.singleMeetingRateEur} € | ${group.differenceIfOneMeetingEur} € | ${cell(group.existingTeacherInvoices.join(', '))} | ${cell(group.commonServices.join(', ') || 'Reikia patikslinti su mokytoju')} |`),
  '', 'Ievos Šimkonytės 2026-09-11 15:00 trys įrašai turi tą patį laiką ir prisijungimo nuorodą, o visų trijų mokinių sutartyse nurodyta ta pati 5 klasės matematikos grupė. LV-009 šiems įrašams įtraukta 3 × 45 € = 135 €; vieno grupinio užsiėmimo tarifas 45 €, skirtumas 90 €. Sąskaitos bendra suma 810 €. Jei kitos jos pamokos teisingos, po šios vienos korekcijos būtų 720 €.',
  '', 'Godos spalio 12 d. 11:15 lankomumo faktas išsaugo buvusios grupės pavadinimą, tačiau pati grupė jau ištrinta. To paties užsiėmimo vaikų pamokose nebėra grupės ir dalyko ryšių; dėl to jos skaičiuojamos atskirai. Spalio mokytojo sąskaitos dar nerasta.', '',
  '## Rugsėjis: ką pirmiausia sutikrinti', '', '| Mokytojas | Data ir laikas | Mokinys | Mokinio sąskaita | Pamokos dalis | Mokytojo sąskaita |', '|---|---|---|---|---|---|',
  ...septemberReview.filter(row => !row.testNamed).map(row => `| ${cell(row.teacher)} | ${cell(row.localTime)} | ${cell(row.studentNames.join(', '))} | ${cell(row.studentInvoices.map(i => `${i.invoiceNumber} (${i.status})`).join(', '))} | ${cell(row.studentInvoices.map(i => `${i.netLineUnitEur} €`).join(', '))} | ${cell(row.teacherInvoices.join(', '))} |`),
  '', 'Šių pamokų neįvykimas dar nepatvirtintas. Patikrinti su mokytoju arba palyginti su jo rankiniu būdu išrašyta rugsėjo sąskaita.', '',
  '## Testiniai įrašai', '', ...septemberReview.filter(row => row.testNamed).map(row => `- ${row.teacher}, ${row.localTime}: mokinys „${row.studentNames.join(', ')}“, mokinių ir mokytojo sąskaitose nerasta.`),
  '', '## Spalis: trūksta įvykimo patvirtinimo', '',
  'Toliau nurodyti skaičiavimo įrašai pagal dabartinį grupavimą. Kai kurios grupinės pamokos suskaidytos į kelių vaikų įrašus, todėl tai nėra faktinis pamokų skaičius ar nustatyta permoka.', '',
  '| Mokytojas | Skaičiavimo įrašų be patvirtinimo | Atlygio dalis, kurią reikia patvirtinti |', '|---|---:|---:|',
  ...monthly.filter(row => row.month === '2026-10' && row.awaitingConfirmation).map(row => `| ${cell(row.teacher)} | ${row.awaitingConfirmation} | ${row.awaitingConfirmationPayEur} € |`),
  '', 'Tai nėra nustatyta permoka ar įrodymas, kad užsiėmimai nevyko. Čia būtinas įvykimo patvirtinimas prieš išrašant atlygio sąskaitą.', '',
  ...awaiting.map(row => `- ${row.localTime}, ${row.teacher}: ${row.activity}${row.testNamed ? ' (testinis įrašas)' : ''}; ${row.payEur} €.`),
  '', '## Kiti persidengiantys laikai', '', ...overlapGroups.filter(group => !group.commonGroupEvidence)
    .map(group => `- ${group.teacher}, ${group.localTime}: ${group.sources.map(source => source.activity).join(' / ')}. Reikia patikslinti laiką arba ar tai buvo vienas bendras užsiėmimas.`),
  '', 'Išsamūs šaltinių ID ir peržiūros skaičiavimai pateikti greta esančiame JSON faile.'];
await writeFile(`${output}.md`, detail.join('\n'));
console.log(JSON.stringify({ ...report.scope, checkedAt: report.checkedAt, septemberReview: septemberReview.map(row => ({ teacher: row.teacher, time: row.localTime, test: row.testNamed,
  invoiceNumbers: row.studentInvoices.map(i => i.invoiceNumber), netLessonEur: row.studentInvoices.map(i => i.netLineUnitEur), teacherInvoices: row.teacherInvoices })),
  octoberAwaiting: monthly.filter(row => row.month === '2026-10' && row.awaitingConfirmation), legacyMeetings: legacyMeetings.length,
  overlapGroups: overlapGroups.map(({ sources, ...group }) => group), report: `${output}.md` }));
