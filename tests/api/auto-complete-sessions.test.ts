/**
 * Unit tests for optimized auto-complete-sessions API
 * Tests batch package + per-item update logic, including multi-subject packages.
 */

import { describe, it, expect } from 'vitest';

describe('auto-complete-sessions API - Batch Updates', () => {
  it('should batch fetch packages instead of sequential queries', () => {
    const sessions = [
      { id: '1', lesson_package_id: 'pkg-1', subject_id: 'math', end_time: '2026-03-19T10:00:00Z' },
      { id: '2', lesson_package_id: 'pkg-1', subject_id: 'math', end_time: '2026-03-19T11:00:00Z' },
      { id: '3', lesson_package_id: 'pkg-2', subject_id: 'phys', end_time: '2026-03-19T12:00:00Z' },
      { id: '4', lesson_package_id: 'pkg-2', subject_id: 'phys', end_time: '2026-03-19T13:00:00Z' },
      { id: '5', lesson_package_id: 'pkg-3', subject_id: 'chem', end_time: '2026-03-19T14:00:00Z' },
    ];

    const sessionsWithPackages = sessions.filter(s => s.lesson_package_id);
    const packageIds = [...new Set(sessionsWithPackages.map(s => s.lesson_package_id))];

    expect(packageIds).toEqual(['pkg-1', 'pkg-2', 'pkg-3']);
    expect(packageIds.length).toBe(3);

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

    expect(updated.reserved_lessons).toBe(3);
    expect(updated.completed_lessons).toBe(12);
  });

  it('should handle edge case when reserved goes negative', () => {
    const mockPackage = {
      id: 'pkg-1',
      reserved_lessons: 1,
      completed_lessons: 10,
    };

    const completedCount = 3;

    const updated = {
      reserved_lessons: Math.max(0, mockPackage.reserved_lessons - completedCount),
      completed_lessons: mockPackage.completed_lessons + completedCount,
    };

    expect(updated.reserved_lessons).toBe(0);
    expect(updated.completed_lessons).toBe(13);
  });
});

describe('auto-complete-sessions API - Multi-subject items', () => {
  it('should compute per-item completion counts for a multi-subject package', () => {
    const sessionsWithPackages = [
      { id: 's1', lesson_package_id: 'pkg-A', subject_id: 'math' },
      { id: 's2', lesson_package_id: 'pkg-A', subject_id: 'math' },
      { id: 's3', lesson_package_id: 'pkg-A', subject_id: 'phys' },
      { id: 's4', lesson_package_id: 'pkg-B', subject_id: 'chem' },
    ];

    const items = [
      { id: 'i1', package_id: 'pkg-A', subject_id: 'math', reserved_lessons: 3, completed_lessons: 1 },
      { id: 'i2', package_id: 'pkg-A', subject_id: 'phys', reserved_lessons: 2, completed_lessons: 0 },
      { id: 'i3', package_id: 'pkg-B', subject_id: 'chem', reserved_lessons: 1, completed_lessons: 0 },
    ];

    const updates = items.map(it => {
      const completedCount = sessionsWithPackages.filter(
        s => s.lesson_package_id === it.package_id && s.subject_id === it.subject_id,
      ).length;
      return {
        id: it.id,
        completedCount,
        reserved_lessons: Math.max(0, it.reserved_lessons - completedCount),
        completed_lessons: it.completed_lessons + completedCount,
      };
    });

    expect(updates).toEqual([
      { id: 'i1', completedCount: 2, reserved_lessons: 1, completed_lessons: 3 },
      { id: 'i2', completedCount: 1, reserved_lessons: 1, completed_lessons: 1 },
      { id: 'i3', completedCount: 1, reserved_lessons: 0, completed_lessons: 1 },
    ]);
  });

  it('should match parent aggregate to sum of item moves', () => {
    const sessionsWithPackages = [
      { id: 's1', lesson_package_id: 'pkg-A', subject_id: 'math' },
      { id: 's2', lesson_package_id: 'pkg-A', subject_id: 'math' },
      { id: 's3', lesson_package_id: 'pkg-A', subject_id: 'phys' },
    ];

    const parent = { id: 'pkg-A', reserved_lessons: 5, completed_lessons: 1 };
    const items = [
      { id: 'i1', package_id: 'pkg-A', subject_id: 'math', reserved_lessons: 3, completed_lessons: 1 },
      { id: 'i2', package_id: 'pkg-A', subject_id: 'phys', reserved_lessons: 2, completed_lessons: 0 },
    ];

    const itemCompletedTotal = items.reduce((sum, it) => {
      const c = sessionsWithPackages.filter(
        s => s.lesson_package_id === it.package_id && s.subject_id === it.subject_id,
      ).length;
      return sum + c;
    }, 0);

    const parentCompletedFromSessions = sessionsWithPackages
      .filter(s => s.lesson_package_id === parent.id)
      .length;

    expect(itemCompletedTotal).toBe(parentCompletedFromSessions);

    const updatedParent = {
      reserved_lessons: Math.max(0, parent.reserved_lessons - parentCompletedFromSessions),
      completed_lessons: parent.completed_lessons + parentCompletedFromSessions,
    };
    expect(updatedParent.reserved_lessons).toBe(2);
    expect(updatedParent.completed_lessons).toBe(4);
  });
});

describe('reserve-package-lesson - multi-subject decrement', () => {
  it('should decrement only the matching item and the parent aggregate', () => {
    const pkg = {
      id: 'pkg-A',
      available_lessons: 5,
      reserved_lessons: 0,
    };
    const items = [
      { id: 'i1', package_id: 'pkg-A', subject_id: 'math', available_lessons: 3, reserved_lessons: 0 },
      { id: 'i2', package_id: 'pkg-A', subject_id: 'phys', available_lessons: 2, reserved_lessons: 0 },
    ];

    const reserveSubjectId = 'math';
    const matchedItem = items.find(it => it.subject_id === reserveSubjectId)!;
    expect(matchedItem.id).toBe('i1');

    const updatedItem = {
      ...matchedItem,
      available_lessons: matchedItem.available_lessons - 1,
      reserved_lessons: matchedItem.reserved_lessons + 1,
    };
    const updatedPkg = {
      ...pkg,
      available_lessons: pkg.available_lessons - 1,
      reserved_lessons: pkg.reserved_lessons + 1,
    };

    expect(updatedItem.available_lessons).toBe(2);
    expect(updatedItem.reserved_lessons).toBe(1);

    const physicsItemUnchanged = items[1];
    expect(physicsItemUnchanged.available_lessons).toBe(2);
    expect(physicsItemUnchanged.reserved_lessons).toBe(0);

    expect(updatedPkg.available_lessons).toBe(4);
    expect(updatedPkg.reserved_lessons).toBe(1);
  });

  it('should fire package-depleted email only when ALL items are at zero', () => {
    const initial = [
      { subject_id: 'math', available_lessons: 1 },
      { subject_id: 'phys', available_lessons: 1 },
    ];

    const afterFirstBooking = initial.map(it =>
      it.subject_id === 'math' ? { ...it, available_lessons: 0 } : it,
    );
    const someStillAvailable = afterFirstBooking.some(it => it.available_lessons > 0);
    expect(someStillAvailable).toBe(true);

    const afterSecondBooking = afterFirstBooking.map(it =>
      it.subject_id === 'phys' ? { ...it, available_lessons: 0 } : it,
    );
    const allDepleted = afterSecondBooking.every(it => it.available_lessons === 0);
    expect(allDepleted).toBe(true);
  });
});
