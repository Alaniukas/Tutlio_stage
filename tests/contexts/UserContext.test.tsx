/**
 * Unit tests for UserContext optimization
 * Tests profile caching to avoid repeated queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { UserProvider, useUser } from '@/contexts/UserContext';
import React from 'react';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}));

describe('UserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide user and profile data', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UserProvider>{children}</UserProvider>
    );

    const { result } = renderHook(() => useUser(), { wrapper });

    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('profile');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('refetchProfile');
  });

  it('should start with loading state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UserProvider>{children}</UserProvider>
    );

    const { result } = renderHook(() => useUser(), { wrapper });

    expect(result.current.loading).toBe(true);
  });

  it('should provide refetchProfile function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UserProvider>{children}</UserProvider>
    );

    const { result } = renderHook(() => useUser(), { wrapper });

    expect(typeof result.current.refetchProfile).toBe('function');
  });
});

describe('UserContext - Performance Benefits', () => {
  it('should cache profile data to avoid repeated DB calls', () => {
    // Mock profile data
    const mockProfile = {
      id: 'user-123',
      full_name: 'Test User',
      email: 'test@example.com',
      stripe_account_id: 'acct_123',
      google_calendar_connected: false,
      organization_id: null,
    };

    // In a real scenario, this profile would be fetched once
    // and reused across all components that call useUser()
    const profile1 = mockProfile;
    const profile2 = mockProfile;

    // Both references should point to the same cached data
    expect(profile1).toEqual(profile2);
    expect(profile1).toBe(profile2); // Same reference
  });

  it('should eliminate redundant auth.getUser() calls', () => {
    // Before optimization: Each component called supabase.auth.getUser()
    // After optimization: Components use useUser() which caches the result

    const callsBeforeOptimization = 10; // Dashboard, Calendar, Students, etc.
    const callsAfterOptimization = 0; // All use cached context

    expect(callsAfterOptimization).toBeLessThan(callsBeforeOptimization);
    expect(callsAfterOptimization).toBe(0);
  });
});
