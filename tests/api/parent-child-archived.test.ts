import { expect, it } from 'vitest';
import { loadParentContext } from '../../api/parent-child';
it('excludes the archived placeholder while retaining the named child for the same parent', async () => {
  const db: any = { from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: 'parent' } }), then: (resolve: any) => Promise.resolve({ data: [
      { students: { id: 'old', full_name: 'Laukiama registracijos', detached_at: '2026-09-07' } },
      { students: { id: 'kotryna', full_name: 'Kotryna', detached_at: null } },
    ] }).then(resolve) }; return q;
  } };
  expect((await loadParentContext(db, 'parent-user'))?.children.map(c => c.id)).toEqual(['kotryna']);
});
