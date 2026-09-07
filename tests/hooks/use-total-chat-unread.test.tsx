import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const channelMock = vi.fn();
const removeChannelMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (...args: unknown[]) => channelMock(...args),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));
vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { id: 'admin-1' }, profile: null, loading: false, refetchProfile: async () => {} }),
}));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/lib/preload', () => ({ orgAdminRowByUserDeduped: async () => null }));

import { useTotalChatUnread } from '@/hooks/useChat';

function fakeChannel() {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return channel;
}

beforeEach(() => {
  channelMock.mockReset();
  removeChannelMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
  channelMock.mockImplementation(() => fakeChannel());
});

describe('useTotalChatUnread', () => {
  it('joins the private inbox topic for a seat the RLS policy accepts', async () => {
    const { unmount } = renderHook(() => useTotalChatUnread());
    await waitFor(() => {
      expect(channelMock).toHaveBeenCalledWith('user:admin-1:inbox', { config: { private: true } });
    });
    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it('never joins the inbox topic when disabled, so a rejected seat does not retry forever', async () => {
    const { result } = renderHook(() => useTotalChatUnread({ enabled: false }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(channelMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });
});
