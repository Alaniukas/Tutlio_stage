/** PostgREST: function missing from the schema cache (migration not applied). */
export function isMissingPostgrestRpc(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST202';
}
