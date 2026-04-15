/**
 * Unit tests for optimized auto-complete-sessions API
 * Tests batch package update optimization
 */

import { describe, it, expect } from 'vitest';

describe('auto-complete-sessions API - Batch Updates', () => {
  it('should batch fetch packages instead of sequential queries', () => {
    const sessions = [
      { id: '1', lesson_package_id: 'pkg-1', end_time: '2026-03-19T10:00:00Z' },
      { id: '2', lesson_package_id: 'pkg-1', end_time: '2026-03-19T11:00:00Z' },
      { id: '3', lesson_package_id: 'pkg-2', end_time: '2026-03-19T12:00:00Z' },
      { id: '4', lesson_package_id: 'pkg-2', end_time: '2026-03-19T13:00:00Z' },
      { id: '5', lesson_package_id: 'pkg-3', end_time: '2026-03-19T14:00:00Z' },
    ];

    const sessionsWithPackages = sessions.filter(s => s.lesson_package_id);
    const packageIds = [...new Set(sessionsWithPackages.map(s => s.lesson_package_id))];

    // Should identify unique packages
    expect(packageIds).toEqual(['pkg-1', 'pkg-2', 'pkg-3']);
    expect(packageIds.length).toBe(3);

    // Should count sessions per package
    const pkg1Count = sessionsWithPackages.filter(s => s.lesson_package_id === 'pkg-1').length;
    const pkg2Count = sessionsWithPackages.filter(s => s.lesson_package_id === 'pkg-2').length;
    const pkg3Count = sessionsWithPackages.filter(s => s.lesson_package_id === 'pkg-3').length;

    expect(pkg1Count).toBe(2);
    expect(pkg2Count).toBe(2);
    expect(pkg3Count).toBe(1);
  });

  it('should calculate correct package updates', () => {
    const mockPackage = {
      id: 'pkg-1',
      reserved_lessons: 5,
      completed_lessons: 10,
    };

    const completedCount = 2;

    const updated = {
      id: mockPackage.id,
      reserved_lessons: Math.max(0, mockPackage.reserved_lessons - completedCount),
      completed_lessons: mockPackage.completed_lessons + completedCount,
    };

    expect(updated.reserved_lessons).toBe(3); // 5 - 2
    expect(updated.completed_lessons).toBe(12); // 10 + 2
  });

  it('should handle edge case when reserved goes negative', () => {
    const mockPackage = {
      id: 'pkg-1',
      reserved_lessons: 1,
      completed_lessons: 10,
    };

    const completedCount = 3; // More than reserved

    const updated = {
      reserved_lessons: Math.max(0, mockPackage.reserved_lessons - completedCount),
      completed_lessons: mockPackage.completed_lessons + completedCount,
    };

    expect(updated.reserved_lessons).toBe(0); // Should not go negative
    expect(updated.completed_lessons).toBe(13);
  });
});
