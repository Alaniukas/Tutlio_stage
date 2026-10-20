import { Resend as ProviderResend } from 'resend';
import { redirectEmailDelivery } from './emailDeliveryRedirects.js';

/** All application mail uses one delivery boundary. Account identities, links,
 * preferences, attachments and provider idempotency keys stay unchanged. */
export class Resend extends ProviderResend {
  constructor(...args: ConstructorParameters<typeof ProviderResend>) {
    super(...args);
    const send = this.emails.send.bind(this.emails);
    this.emails.send = (payload, options) => options === undefined
      ? send(redirectEmailDelivery(payload))
      : send(redirectEmailDelivery(payload), options);
  }
}
