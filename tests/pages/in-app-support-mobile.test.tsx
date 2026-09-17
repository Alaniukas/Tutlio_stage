import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    storage: { from: vi.fn() },
  },
}));

import { InAppSupportPopover } from '@/components/support/InAppSupportAgent';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('in-app support mobile shell', () => {
  it('uses the dynamic viewport without an inset card or tinted backdrop', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });

    render(
      <MemoryRouter initialEntries={['/school']}>
        <InAppSupportPopover anchor={null} demoMode onClose={() => {}} />
      </MemoryRouter>,
    );

    const panel = screen.getByLabelText('Tutlio pagalbos agentas').parentElement;
    expect(panel?.classList.contains('inset-x-0')).toBe(true);
    expect(panel?.classList.contains('h-dvh')).toBe(true);
    expect(panel?.classList.contains('w-screen')).toBe(true);
    expect(panel?.classList.contains('rounded-none')).toBe(true);
    expect(panel?.classList.contains('shadow-none')).toBe(true);
    expect(panel?.style.top).toBe('0px');
    expect(panel?.style.height).toBe('844px');
    expect(screen.getByTestId('support-agent-backdrop').classList.contains('bg-transparent')).toBe(true);
  });

  it('does not close on outside clicks and preserves the draft while hidden', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/school']}>
        <InAppSupportPopover open anchor={null} demoMode onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pasiūlyti funkciją/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Prašau išsaugoti šį nebaigtą aprašymą.' } });
    fireEvent.click(screen.getByTestId('support-agent-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter initialEntries={['/school']}>
        <InAppSupportPopover open={false} anchor={null} demoMode onClose={onClose} />
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter initialEntries={['/school']}>
        <InAppSupportPopover open anchor={null} demoMode onClose={onClose} />
      </MemoryRouter>,
    );

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value)
      .toBe('Prašau išsaugoti šį nebaigtą aprašymą.');
  });

  it('uses one bottom chat composer and does not render form progress or helper copy', () => {
    render(
      <MemoryRouter initialEntries={['/school']}>
        <InAppSupportPopover anchor={null} demoMode onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pasiūlyti funkciją/ }));

    const composer = screen.getByLabelText('Rašykite atsakymą…');
    expect(composer.closest('footer')).toBeTruthy();
    expect(screen.queryByText(/Žingsnis \d+ iš \d+/)).toBeNull();
    expect(screen.queryByText(/Pakanka vieno natūralaus aprašymo/)).toBeNull();
  });

  it('grows the composer through four lines before enabling its own scrollbar', () => {
    render(
      <MemoryRouter initialEntries={['/school']}>
        <InAppSupportPopover anchor={null} demoMode onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pasiūlyti funkciją/ }));
    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    let measuredHeight = 80;
    Object.defineProperty(composer, 'scrollHeight', {
      configurable: true,
      get: () => measuredHeight,
    });

    fireEvent.change(composer, { target: { value: 'One\nTwo\nThree' } });
    expect(composer.style.height).toBe('80px');
    expect(composer.style.overflowY).toBe('hidden');

    measuredHeight = 140;
    fireEvent.change(composer, { target: { value: 'One\nTwo\nThree\nFour\nFive' } });
    expect(composer.style.height).toBe('100px');
    expect(composer.style.overflowY).toBe('auto');
  });

  it('shows thinking dots and progressively renders a streamed reply', async () => {
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/preview/support-agent']}>
        <InAppSupportPopover anchor={null} demoMode onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pranešti apie klaidą/ }));
    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'Icons cover the invite button on mobile.' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByRole('status')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);

    streamController.enqueue(encoder.encode(`${JSON.stringify({
      type: 'reply',
      content: 'Ačiū—supratau problemą.',
    })}\n`));
    expect(await screen.findByText('Ačiū - supratau problemą.')).toBeTruthy();

    streamController.enqueue(encoder.encode(`${JSON.stringify({
      type: 'result',
      conversation: {
        reply: 'Ačiū—supratau problemą. Kuriame puslapyje tai nutinka?',
        title: 'Ikonos uždengia kvietimo mygtuką',
        context: 'Mobiliajame vaizde ikonos uždengia mokinio kvietimo mygtuką.',
        steps: [],
        expectedOutcome: '',
        actualOutcome: 'Kvietimo mygtukas nėra paspaudžiamas.',
        impact: null,
        impactDetails: '',
        ready: false,
        missingTopics: ['context'],
      },
    })}\n`));
    streamController.close();

    expect(await screen.findByText('Ačiū - supratau problemą. Kuriame puslapyje tai nutinka?')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('honors an explicit send command even when a feature request is still incomplete', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/in-app-support-assist') {
        const body = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
          conversation: {
            reply: body.submitRequested
              ? 'Gerai, ruošiu pateikimą komandai.'
              : 'Gerai, testų funkcija. Ką ji turėtų padaryti už Jus?',
            title: 'Testų funkcija',
            context: 'Naudotojas norėtų testų funkcijos Tutlio platformoje.',
            steps: [],
            expectedOutcome: '',
            actualOutcome: '',
            impact: null,
            impactDetails: '',
            ready: false,
            missingTopics: ['expectedOutcome', 'impact'],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/in-app-support') {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.environment.reportCompleteness).toBe('user_confirmed_incomplete');
        expect(body.steps[0]).toContain('not provided');
        expect(body.expectedOutcome).toContain('not specified');
        expect(body.transcript.at(-2)).toMatchObject({ role: 'user', content: 'siųsti' });
        return new Response(JSON.stringify({ reference: 'SUP-INCOMPLETE' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/preview/support-agent']}>
        <InAppSupportPopover anchor={null} demoMode onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pasiūlyti funkciją/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hey, reikia testų' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await screen.findByText(/Ką ji turėtų padaryti/);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'siųsti' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await screen.findByText('SUP-INCOMPLETE');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/in-app-support',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('turns an explicit send command into a real submission even after inconsistent AI readiness', async () => {
    let assistCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/in-app-support-assist') {
        assistCalls += 1;
        const complete = assistCalls > 1;
        return new Response(JSON.stringify({
          conversation: {
            reply: complete
              ? 'I have enough context and the application can submit this now.'
              : 'I have enough context. Say “send it” when ready.',
            title: 'Mobile icons block invitations',
            context: 'Popup-like icons block student invitation controls on the company page.',
            steps: complete ? ['Open the company page in a mobile browser', 'Try to invite a student'] : [],
            expectedOutcome: complete ? 'The invitation controls should remain usable.' : '',
            actualOutcome: 'The icons cover the controls and inviting a student is impossible.',
            impact: 'blocking',
            impactDetails: complete ? 'Student invitations are blocked intermittently on mobile.' : '',
            ready: true,
            missingTopics: complete ? [] : ['steps', 'expectedOutcome', 'impactDetails'],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/in-app-support') {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.transcript.at(-2)).toMatchObject({ role: 'user', content: 'send it' });
        return new Response(JSON.stringify({ reference: 'SUP-17EE7859' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/preview/support-agent']}>
        <InAppSupportPopover anchor={null} demoMode onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pranešti apie klaidą/ }));
    const composer = screen.getByRole('textbox');
    fireEvent.change(composer, { target: { value: 'Icons block student invitations in a mobile browser.' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByText(/Say “send it” when ready/);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'send it' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await screen.findByText('SUP-17EE7859');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/in-app-support',
      expect.objectContaining({ method: 'POST' }),
    ));
    const assistBodies = fetchMock.mock.calls
      .filter(([url]) => url === '/api/in-app-support-assist')
      .map(([, init]) => JSON.parse(String(init?.body || '{}')));
    expect(assistBodies).toHaveLength(2);
    expect(assistBodies[0].submitRequested).toBe(false);
    expect(assistBodies[1].submitRequested).toBe(true);
  });
});
