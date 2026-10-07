import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({canEdit:true,rpc:vi.fn(),load:vi.fn(),invoices:[] as any[],filters:[] as any[]}));
vi.mock('../../api/_lib/schoolConsultationsAccess.js',()=>({
  assertSchoolMonthlyInvoiceEnabled:async()=>({ok:true}),serviceSupabase:()=>({rpc:state.rpc,from:()=>{
    let rows=[...state.invoices]; const query:any={select:()=>query,order:()=>query,
      eq:(key:string,value:any)=>{state.filters.push([key,value]);rows=rows.filter(row=>row[key]===value);return query;},
      range:(from:number,to:number)=>{rows=rows.slice(from,to+1);return query;},then:(resolve:any)=>resolve({data:rows,error:null})};return query;
  }}),
}));
vi.mock('../../api/_lib/orgAdminAccess.js',()=>({requireOrgAdminAccess:async()=>({ok:true,access:{organizationId:'org',userId:'admin',role:'custom',permissions:{'finance.view':true,'finance.edit':state.canEdit}}})}));
vi.mock('../../api/_lib/schoolInvoiceOverpayments.js',()=>({loadSchoolInvoiceOverpayments:state.load}));
import handler from '../../api/school-invoice-overpayments';
const invoiceId='00000000-0000-4000-8000-000000000031',requestId='00000000-0000-4000-8000-000000000041';
async function request(body:any){const result={status:0,body:null as any};const response:any={status(code:number){result.status=code;return this;},json(value:any){result.body=value;return this;}};await handler({method:'POST',body} as any,response);return result;}
beforeEach(()=>{vi.clearAllMocks();state.canEdit=true;state.load.mockResolvedValue([]);state.rpc.mockResolvedValue({data:'credit',error:null});state.invoices=[];state.filters=[];});
describe('school overpayment administration',()=>{
  it('takes organization and administrator only from authenticated access',async()=>{
    const result=await request({action:'register',invoiceId,requestId,amountEur:12,reason:'Wrong Monday lessons',createdBy:'outsider'});
    expect(result.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('register_school_invoice_overpayment',expect.objectContaining({p_organization_id:'org',p_created_by:'admin',p_amount_eur:12,p_request_id:requestId}));
    expect((await request({action:'register',organizationId:'foreign',invoiceId,requestId,amountEur:12,reason:'Adjustment'})).status).toBe(403);
    expect(state.rpc).toHaveBeenCalledOnce();
  });
  it('blocks read-only mutation, invalid money and empty reasons',async()=>{
    state.canEdit=false;
    expect((await request({action:'register',invoiceId,requestId,amountEur:12,reason:'Adjustment'})).status).toBe(403);
    state.canEdit=true;
    for(const amountEur of [-1,0,1.001,'bad']) expect((await request({action:'register',invoiceId,requestId,amountEur,reason:'Adjustment'})).status).toBe(400);
    expect((await request({action:'register',invoiceId,requestId,amountEur:12,reason:''})).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('lists only own paid cash invoices and removes already adjusted sources',async()=>{
    state.invoices=[{id:invoiceId,organization_id:'org',payment_status:'paid',student:{full_name:'Child',payer_email:'parent@example.test'},total_eur:96},
      {id:'pending',organization_id:'org',payment_status:'pending',student:{payer_email:'parent'},total_eur:96},
      {id:'foreign',organization_id:'foreign',payment_status:'paid',student:{payer_email:'other'},total_eur:96},
      {id:'settled',organization_id:'org',payment_status:'paid',student:{payer_email:'parent'},total_eur:12,credit_applied_eur:12}];
    expect((await request({action:'list'})).body.invoices.map((row:any)=>row.id)).toEqual([invoiceId]);
    state.load.mockResolvedValue([{id:'credit',source_invoice_id:invoiceId}]);
    const listed=await request({action:'list'});
    expect(listed.body.invoices).toEqual([]);
    expect(listed.body.credits[0].studentName).toBe('Child');
    expect(state.load).toHaveBeenCalledWith(expect.anything(),'org');
  });
  it('returns a database rejection without claiming the adjustment succeeded',async()=>{
    state.rpc.mockResolvedValue({data:null,error:{message:'Panaudotos permokos atšaukti negalima.'}});
    const result=await request({action:'void',overpaymentId:invoiceId,reason:'Mistaken entry'});
    expect(result).toEqual({status:400,body:{error:'Panaudotos permokos atšaukti negalima.'}});
  });
});
