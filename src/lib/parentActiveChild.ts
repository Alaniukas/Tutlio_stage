export const PARENT_ACTIVE_CHILD_KEY = 'tutlio_parent_active_child_id';
export const PARENT_HIDE_ADD_CHILD_PROMPT_KEY = 'tutlio_parent_hide_add_child_prompt';
export const PARENT_ACTIVE_CHILD_EVENT = 'parent-active-child-changed';

export type ParentChildOption = { id: string; fullName: string };

export function getParentActiveChildId(): string | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(PARENT_ACTIVE_CHILD_KEY);
  return v && v.trim() ? v.trim() : null;
}

export function setParentActiveChildId(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  localStorage.setItem(PARENT_ACTIVE_CHILD_KEY, id);
  window.dispatchEvent(new Event(PARENT_ACTIVE_CHILD_EVENT));
}

/** Prefer URL / stored id when it still belongs to this parent. */
export function pickParentChildId(childIds: string[], preferred?: string | null): string | null {
  if (childIds.length === 0) return null;
  if (preferred && childIds.includes(preferred)) return preferred;
  const stored = getParentActiveChildId();
  if (stored && childIds.includes(stored)) return stored;
  return childIds[0];
}

export function isParentAddChildPromptHidden(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PARENT_HIDE_ADD_CHILD_PROMPT_KEY) === '1';
}

export function hideParentAddChildPrompt(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PARENT_HIDE_ADD_CHILD_PROMPT_KEY, '1');
}
