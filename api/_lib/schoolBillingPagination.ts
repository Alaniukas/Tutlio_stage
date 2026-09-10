/** Read by stable UUID cursor until empty, including projects with a lower API row cap. */
export async function readAllSchoolBillingRows<T extends { id: string }>(
  readPage: (afterId: string | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await readPage(afterId);
    if (page.error) return { data: [], error: page.error };
    if (!page.data?.length) return { data: rows, error: null };
    const nextId = page.data[page.data.length - 1].id;
    if (nextId === afterId) return { data: [], error: { message: 'Billing pagination cursor did not advance' } };
    rows.push(...page.data);
    afterId = nextId;
  }
}
