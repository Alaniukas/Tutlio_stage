import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/apiHelpers',()=>({authHeaders:async()=>({Authorization:'Bearer mock'})}));
const translate=(key:string)=>key;
vi.mock('../../src/lib/i18n',()=>({useTranslation:()=>({t:translate,locale:'lt'})}));
import SchoolInvoiceOverpaymentsDialog from '../../src/components/school/SchoolInvoiceOverpaymentsDialog';
import { SchoolMonthlyInvoicePreviewCard } from '../../src/components/school/SchoolMonthlyInvoiceDialog';
const listed={canEdit:true,credits:[],invoices:[{id:'paid',invoice_number:'PAM-800',paidCashEur:96,student:{full_name:'Benediktas'}}]};
beforeEach(()=>{vi.clearAllMocks();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('school overpayment dialog',()=>{
  it('registers a chosen amount and reason only after an explicit save',async()=>{
    const requests:any[]=[]; const changed=vi.fn();
    vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init.body);requests.push(body);return {ok:true,json:async()=>body.action==='list'?listed:{ok:true}};}));
    render(<SchoolInvoiceOverpaymentsDialog open onOpenChange={()=>{}} organizationId="org" onChanged={changed}/>);
    await screen.findByRole('option',{name:/PAM-800/});
    expect(requests.map(row=>row.action)).toEqual(['list']);
    const save=screen.getByRole('button',{name:'school.invoice.credit.save'});
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('school.invoice.credit.source'),{target:{value:'paid'}});
    fireEvent.change(screen.getByLabelText('school.invoice.credit.amount'),{target:{value:'12,00'}});
    fireEvent.change(screen.getByLabelText('school.invoice.credit.reason'),{target:{value:'Anglų grupė tik antradieniais'}});
    fireEvent.click(save);
    await waitFor(()=>expect(changed).toHaveBeenCalledOnce());
    expect(requests[1]).toMatchObject({action:'register',organizationId:'org',invoiceId:'paid',amountEur:12,reason:'Anglų grupė tik antradieniais'});
    expect(requests[1].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests.every(row=>!['refund','send'].includes(row.action))).toBe(true);
  });
  it('shows the source, next invoice, reason and remaining balance for a read-only administrator',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...listed,canEdit:false,credits:[{
      id:'credit',source_invoice_id:'paid',source:{invoice_number:'PAM-800'},studentName:'Benediktas',payer_email:'parent@example.test',
      amount_eur:12,reason:'Tik antradieniais',created_at:'2026-10-07',uses:[{invoice_id:'next',amount_eur:10,invoice:{invoice_number:'PAM-900'}}],
    }]})})));
    render(<SchoolInvoiceOverpaymentsDialog open onOpenChange={()=>{}} organizationId="org"/>);
    await screen.findByText('Tik antradieniais');
    expect(screen.getByText(/PAM-800/)).toBeTruthy();
    expect(screen.getByText(/PAM-900/)).toBeTruthy();
    expect(screen.getByText(/school.invoice.credit.remaining: 2,00 €/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'school.invoice.credit.save'})).toBeNull();
    expect(screen.queryByRole('button',{name:'school.invoice.credit.void'})).toBeNull();
  });
  it('shows an unsuccessful registration as an error and preserves the retry id',async()=>{
    const ids:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='list')return {ok:true,json:async()=>listed};ids.push(body.requestId);return {ok:false,json:async()=>({error:'Nepavyko užregistruoti'})};}));
    render(<SchoolInvoiceOverpaymentsDialog open onOpenChange={()=>{}} organizationId="org"/>);
    await screen.findByRole('option',{name:/PAM-800/});
    fireEvent.change(screen.getByLabelText('school.invoice.credit.source'),{target:{value:'paid'}});
    fireEvent.change(screen.getByLabelText('school.invoice.credit.amount'),{target:{value:'12'}});
    fireEvent.change(screen.getByLabelText('school.invoice.credit.reason'),{target:{value:'Adjustment reason'}});
    fireEvent.click(screen.getByRole('button',{name:'school.invoice.credit.save'}));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'school.invoice.credit.save'}));
    await waitFor(()=>expect(ids).toHaveLength(2));
    expect(ids[0]).toBe(ids[1]);
  });
  it('distinguishes a service amount from the amount still payable',()=>{
    render(<SchoolMonthlyInvoicePreviewCard preview={{previewToken:'p',student:{id:'child',fullName:'Vaikas'},periodLabel:'spalis',dueDate:'2026-11-07',lines:[],subtotalEur:84,discountAmountEur:0,totalEur:84,creditAppliedEur:12,amountDueEur:72}}/>);
    expect(screen.getByText('school.invoice.credit.applied')).toBeTruthy();
    expect(screen.getByText('-12,00 €')).toBeTruthy();
    expect(screen.getByText('72,00 €')).toBeTruthy();
  });
});
