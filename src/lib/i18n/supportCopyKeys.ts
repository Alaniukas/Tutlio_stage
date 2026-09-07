/**
 * Every localized string rendered by the public support widget.
 * Keep this list explicit so locale coverage can be enforced in tests and
 * newly added UI copy cannot silently fall back to English.
 */
export const SUPPORT_WIDGET_COPY_KEYS = [
  'support.widget.label',
  'support.widget.title',
  'support.widget.online',
  'support.widget.welcome',
  'support.widget.nudge',
  'support.widget.dismissNudge',
  'support.widget.close',
  'support.widget.contact',
  'support.widget.contactHint',
  'support.widget.whatsappAlternative',
  'support.widget.placeholder',
  'support.widget.send',
  'support.widget.stop',
  'support.widget.thinking',
  'support.widget.error',
  'support.widget.suggestion1',
  'support.widget.suggestion2',
  'support.widget.suggestion3',
  'support.widget.recommendedPages',
  'support.widget.purchaseCta',
  'support.widget.closeWarningTitle',
  'support.widget.closeWarningBody',
  'support.widget.keepChat',
  'support.widget.closeAndClear',
  'support.contact.title',
  'support.contact.subtitle',
  'support.contact.name',
  'support.contact.email',
  'support.contact.phone',
  'support.contact.message',
  'support.contact.messagePlaceholder',
  'support.contact.attachImage',
  'support.contact.attachImageHint',
  'support.contact.removeImage',
  'support.contact.imageError',
  'support.contact.submit',
  'support.contact.successTitle',
  'support.contact.successBody',
  'support.contact.error',
  'support.contact.back',
] as const;

export type SupportWidgetCopyKey = (typeof SUPPORT_WIDGET_COPY_KEYS)[number];
