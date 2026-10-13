import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminUsagePanel from '../../src/components/admin/AdminUsagePanel';
import { previewAdminUsageData } from '../../src/pages/dev/previewAdminUsageData';

afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('internal usage analytics panel',()=>{
  it('shows organization signals and opens per-admin activity and sanitized error context without a support ticket',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    render(<AdminUsagePanel adminSecret="" preview={previewAdminUsageData()} />);
    await screen.findByText('Pavyzdinė agentūra');expect(screen.getByText('5+ dienos be aktyvumo')).toBeTruthy();
    fireEvent.click(screen.getByText('Pavyzdinė agentūra'));
    await screen.findByText('Administratorė A');expect(screen.getByText('admin@example.test')).toBeTruthy();
    expect(screen.getByText('db_57014')).toBeTruthy();expect(screen.getByText('Moduliai per 30 dienų')).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Visos organizacijos'));await screen.findByText('Pavyzdinė mokykla');
  });
  it('treats absent history as unknown instead of declaring inactivity',async()=>{
    const data=previewAdminUsageData();data.organizations=data.organizations.slice(0,1);data.last_ingested_at=null;
    Object.assign(data.organizations[0],{errors_today:0,repeated_errors_today:0});
    Object.assign(data.organizations[0].admins[0],{first_observed_at:null,last_active_at:null});
    render(<AdminUsagePanel adminSecret="" preview={data} />);
    await screen.findByText('Duomenų nepakanka');expect(screen.queryByText('5+ dienos be aktyvumo')).toBeNull();
  });
  it('uses the protected read endpoint and recovers from a failed request',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:503,headers:{'content-type':'application/json'}})).mockResolvedValueOnce(new Response(JSON.stringify(previewAdminUsageData()),{headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',fetcher);render(<AdminUsagePanel adminSecret="private-admin-secret" />);
    await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Atnaujinti naudojimo duomenis'}));
    await screen.findByText('Pavyzdinė agentūra');expect(fetcher.mock.calls[0][1].headers).toEqual({'x-admin-secret':'private-admin-secret'});
  });
  it('opens organization details from a later page and preserves the list page when returning',async()=>{
    vi.useFakeTimers();
    const data=previewAdminUsageData();
    data.organizations=Array.from({length:26},(_,index)=>({
      ...data.organizations[0],id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,name:`Agency ${index+1}`,
    }));
    data.total=data.organizations.length;
    const fetcher=vi.fn(async(input:string)=>{
      const query=new URL(input,'https://tutlio.lt').searchParams;
      const selected=query.get('organization');
      const rows=selected ? data.organizations.filter(org=>org.id===selected) : data.organizations;
      const offset=Number(query.get('offset'));
      return new Response(JSON.stringify({...data,total:rows.length,organizations:rows.slice(offset,offset+25)}),{headers:{'content-type':'application/json'}});
    });
    vi.stubGlobal('fetch',fetcher);render(<AdminUsagePanel adminSecret="secret" />);
    await act(async()=>{await vi.advanceTimersByTimeAsync(350);});
    fireEvent.click(screen.getByRole('button',{name:'Kitas'}));await act(async()=>{});
    expect(new URL(fetcher.mock.calls.at(-1)![0],'https://tutlio.lt').searchParams.get('offset')).toBe('25');
    fireEvent.click(screen.getByRole('button',{name:'Agency 26'}));await act(async()=>{});
    expect(screen.getByRole('heading',{name:'Agency 26'})).toBeTruthy();
    expect(screen.getByText('Administratorė A')).toBeTruthy();
    expect(new URL(fetcher.mock.calls.at(-1)![0],'https://tutlio.lt').searchParams.get('offset')).toBe('0');
    fireEvent.click(screen.getByRole('button',{name:'Visos organizacijos'}));await act(async()=>{});
    expect(screen.getByRole('button',{name:'Agency 26'})).toBeTruthy();
    expect(new URL(fetcher.mock.calls.at(-1)![0],'https://tutlio.lt').searchParams.get('offset')).toBe('25');
  });
  it('clears the loading indicator after an aborted deadline',async()=>{
    vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))))));
    render(<AdminUsagePanel adminSecret="secret" />);
    const {act}=await import('@testing-library/react');await act(async()=>{await vi.advanceTimersByTimeAsync(15_000);});
    expect(screen.getByRole('alert').textContent).toContain('užtruko');expect(screen.queryByRole('status')).toBeNull();
  });
});
