/**
 * Organization-side route for the public landing page editor.
 *
 * The editor itself is shared with the solo-tutor route — which page it loads is
 * decided server-side from the session, so this is only about chrome: company
 * routes already sit inside CompanyLayout's <Outlet />, so the bare content
 * variant is used rather than the tutor-wrapped default export.
 */

import { PublicPageEditorContent } from '@/pages/PublicPageEditor';

export default function CompanyPublicPage() {
  return <PublicPageEditorContent />;
}
