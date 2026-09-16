/**
 * Signed-in support agent rollout switch.
 *
 * Local development keeps the entry visible for dashboard placement and flow
 * QA. Deployments still need to opt in explicitly.
 */
export const IN_APP_SUPPORT_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_IN_APP_SUPPORT_ENABLED === 'true';
