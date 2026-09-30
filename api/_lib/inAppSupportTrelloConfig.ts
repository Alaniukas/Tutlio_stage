export type TrelloSupportLists = {
  registered: string;
  inProgress: string;
  resolved: string;
};

export type TrelloFeatureListSettings =
  | { state: 'unconfigured' }
  | { state: 'configured'; lists: TrelloSupportLists }
  | { state: 'invalid'; error: string };

/** All three feature lists are optional together, and must be separate from bug lists. */
export function getTrelloFeatureListSettings(supportLists: TrelloSupportLists): TrelloFeatureListSettings {
  const registered = process.env.TRELLO_FEATURE_LIST_NEW_ID?.trim() || '';
  const inProgress = process.env.TRELLO_FEATURE_LIST_IN_PROGRESS_ID?.trim() || '';
  const resolved = process.env.TRELLO_FEATURE_LIST_RESOLVED_ID?.trim() || '';
  const ids = [registered, inProgress, resolved];
  if (ids.every((id) => !id)) return { state: 'unconfigured' };
  if (ids.some((id) => !id)) return {
    state: 'invalid',
    error: 'Set all three TRELLO_FEATURE_LIST_*_ID settings before synchronizing feature requests.',
  };
  if (ids.some((id) => !/^[a-f\d]{24}$/i.test(id))) return {
    state: 'invalid',
    error: 'TRELLO_FEATURE_LIST_*_ID settings must be valid Trello list IDs.',
  };
  const normalized = ids.map((id) => id.toLowerCase());
  const supportIds = Object.values(supportLists).map((id) => id.toLowerCase());
  if (new Set(normalized).size !== 3 || normalized.some((id) => supportIds.includes(id))) return {
    state: 'invalid',
    error: 'TRELLO_FEATURE_LIST_*_ID settings must identify three distinct lists separate from the support lists.',
  };
  return {
    state: 'configured',
    lists: { registered: normalized[0], inProgress: normalized[1], resolved: normalized[2] },
  };
}
