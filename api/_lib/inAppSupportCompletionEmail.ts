import { Resend } from 'resend';
import type { InAppSupportCategory } from '../../src/lib/inAppSupport.js';
import { escapeSupportHtml } from './supportContact.js';
import { getFromEmail, getResendApiKey, INTERNAL_NOTIFY_EMAILS } from './resendConfig.js';

type SupportedLanguage = 'en' | 'lt' | 'nl' | 'pl';

export interface InAppSupportCompletionEmailInput {
  id: string;
  reference: string;
  reporterName: string | null;
  reporterEmail: string;
  category: InAppSupportCategory;
  title: string;
  locale: string;
  appUrl: string;
}

const COPY: Record<SupportedLanguage, {
  bugSubject: string;
  featureSubject: string;
  bugHeading: string;
  featureHeading: string;
  fallbackName: string;
  greeting: (name: string) => string;
  bugBody: string;
  featureBody: string;
  thanks: string;
  invitation: string;
  reference: string;
  button: string;
  footer: string;
}> = {
  en: {
    bugSubject: 'Good news - the issue you reported is fixed',
    featureSubject: 'Good news - your Tutlio idea is now live',
    bugHeading: 'Your reported issue is fixed! 🎉',
    featureHeading: 'Your idea is now live! ✨',
    fallbackName: 'there',
    greeting: (name) => `Hi ${name},`,
    bugBody: 'The issue you reported to Tutlio has now been fixed.',
    featureBody: 'The feature you suggested has now been implemented in Tutlio.',
    thanks: 'Thank you for taking the time to explain it so clearly. Your message helped us make Tutlio better for everyone.',
    invitation: 'You can return to Tutlio and try it now. If anything still feels off, simply reply to this email and we will be happy to help.',
    reference: 'Support reference',
    button: 'Open Tutlio',
    footer: 'You received this update because you contacted Tutlio support about this request.',
  },
  lt: {
    bugSubject: 'Geros naujienos - jūsų pranešta klaida ištaisyta',
    featureSubject: 'Geros naujienos - jūsų Tutlio idėja jau įgyvendinta',
    bugHeading: 'Jūsų pranešta klaida ištaisyta! 🎉',
    featureHeading: 'Jūsų idėja jau įgyvendinta! ✨',
    fallbackName: 'Tutlio naudotojau',
    greeting: (name) => `Sveiki, ${name},`,
    bugBody: 'Klaida, apie kurią pranešėte Tutlio komandai, jau ištaisyta.',
    featureBody: 'Jūsų pasiūlyta funkcija jau įdiegta Tutlio platformoje.',
    thanks: 'Labai ačiū, kad skyrėte laiko ir aiškiai viską paaiškinote. Jūsų žinutė padėjo mums padaryti Tutlio dar geresnį visiems.',
    invitation: 'Jau galite grįžti į Tutlio ir išbandyti. Jei kas nors vis dar veikia ne taip, tiesiog atsakykite į šį laišką - mielai padėsime.',
    reference: 'Pagalbos užklausos numeris',
    button: 'Atidaryti Tutlio',
    footer: 'Šį atnaujinimą gavote, nes dėl šios užklausos kreipėtės į Tutlio pagalbos komandą.',
  },
  nl: {
    bugSubject: 'Goed nieuws - het gemelde probleem is opgelost',
    featureSubject: 'Goed nieuws - je Tutlio-idee is nu beschikbaar',
    bugHeading: 'Het gemelde probleem is opgelost! 🎉',
    featureHeading: 'Je idee is nu beschikbaar! ✨',
    fallbackName: 'Tutlio-gebruiker',
    greeting: (name) => `Hallo ${name},`,
    bugBody: 'Het probleem dat je bij Tutlio hebt gemeld, is nu opgelost.',
    featureBody: 'De functie die je hebt voorgesteld, is nu in Tutlio geïmplementeerd.',
    thanks: 'Heel erg bedankt dat je de tijd hebt genomen om alles zo duidelijk uit te leggen. Je bericht heeft ons geholpen Tutlio voor iedereen beter te maken.',
    invitation: 'Je kunt nu teruggaan naar Tutlio om het uit te proberen. Als er nog iets niet goed voelt, antwoord dan gewoon op deze e-mail. We helpen je graag.',
    reference: 'Supportreferentie',
    button: 'Tutlio openen',
    footer: 'Je ontvangt deze update omdat je voor dit verzoek contact hebt opgenomen met Tutlio Support.',
  },
  pl: {
    bugSubject: 'Dobra wiadomość - zgłoszony problem został naprawiony',
    featureSubject: 'Dobra wiadomość - Twój pomysł jest już dostępny w Tutlio',
    bugHeading: 'Zgłoszony problem został naprawiony! 🎉',
    featureHeading: 'Twój pomysł jest już dostępny! ✨',
    fallbackName: 'użytkowniku Tutlio',
    greeting: (name) => `Cześć ${name},`,
    bugBody: 'Problem zgłoszony zespołowi Tutlio został już naprawiony.',
    featureBody: 'Zaproponowana przez Ciebie funkcja została już wdrożona w Tutlio.',
    thanks: 'Bardzo dziękujemy za poświęcony czas i jasne wyjaśnienie. Twoja wiadomość pomogła nam ulepszyć Tutlio dla wszystkich.',
    invitation: 'Możesz już wrócić do Tutlio i wypróbować zmianę. Jeśli coś nadal nie działa prawidłowo, odpowiedz na tę wiadomość. Chętnie pomożemy.',
    reference: 'Numer zgłoszenia',
    button: 'Otwórz Tutlio',
    footer: 'Otrzymujesz tę aktualizację, ponieważ skontaktowano się z pomocą Tutlio w sprawie tego zgłoszenia.',
  },
};

function languageFor(locale: string): SupportedLanguage {
  const language = locale.trim().toLowerCase().split(/[-_]/)[0];
  return language === 'lt' || language === 'nl' || language === 'pl' ? language : 'en';
}

function cleanOrigin(value: string): string {
  return value.trim().replace(/\/$/, '') || 'https://tutlio.lt';
}

export function buildInAppSupportCompletionEmail(input: InAppSupportCompletionEmailInput) {
  const copy = COPY[languageFor(input.locale)];
  const origin = cleanOrigin(input.appUrl);
  const name = input.reporterName?.trim() || copy.fallbackName;
  const heading = input.category === 'bug' ? copy.bugHeading : copy.featureHeading;
  const body = input.category === 'bug' ? copy.bugBody : copy.featureBody;
  const subject = input.category === 'bug' ? copy.bugSubject : copy.featureSubject;

  return {
    subject: `${subject}: ${input.title.replace(/[\r\n]+/g, ' ')}`.slice(0, 240),
    html: `
      <div style="display:none;max-height:0;overflow:hidden">${escapeSupportHtml(heading)} ${escapeSupportHtml(input.reference)}</div>
      <div style="margin:0;padding:32px 12px;background:#f5f3ff;font-family:Inter,Arial,sans-serif;color:#1e1b4b">
        <div style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #ddd6fe;border-radius:24px;background:#ffffff;box-shadow:0 16px 40px rgba(79,70,229,.10)">
          <div style="padding:26px 30px;text-align:center;background:linear-gradient(135deg,#eef2ff,#faf5ff)">
            <img src="${escapeSupportHtml(`${origin}/quiz/tutlio-logo.webp`)}" width="72" height="72" alt="Tutlio logo" style="display:block;width:72px;height:72px;margin:0 auto 8px" />
            <div style="font-size:25px;font-weight:900;letter-spacing:-.5px;color:#4f46e5">Tutlio</div>
          </div>
          <div style="padding:34px 34px 28px">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.7">${escapeSupportHtml(copy.greeting(name))}</p>
            <h1 style="margin:0 0 18px;font-size:27px;line-height:1.25;color:#312e81">${escapeSupportHtml(heading)}</h1>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#374151">${escapeSupportHtml(body)}</p>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#374151">${escapeSupportHtml(copy.thanks)}</p>
            <div style="margin:22px 0;padding:16px 18px;border:1px solid #e9d5ff;border-radius:15px;background:#faf5ff">
              <div style="margin-bottom:5px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed">${escapeSupportHtml(copy.reference)}: ${escapeSupportHtml(input.reference)}</div>
              <div style="font-size:16px;font-weight:800;line-height:1.5;color:#312e81">${escapeSupportHtml(input.title)}</div>
            </div>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151">${escapeSupportHtml(copy.invitation)}</p>
            <div style="text-align:center">
              <a href="${escapeSupportHtml(origin)}" style="display:inline-block;padding:13px 24px;border-radius:12px;background:#6559f3;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800">${escapeSupportHtml(copy.button)}</a>
            </div>
            <p style="margin:30px 0 0;font-size:15px;line-height:1.65;color:#374151">
              Best regards,<br>
              <strong>Simonas and Alanas</strong><br>
              Tutlio Team
            </p>
          </div>
          <div style="padding:20px 28px;text-align:center;border-top:1px solid #ede9fe;background:#fafafa;color:#6b7280;font-size:12px;line-height:1.6">
            <strong style="color:#4f46e5">MB Tutlio</strong> · <a href="https://tutlio.lt" style="color:#6559f3;text-decoration:none">tutlio.lt</a><br>
            ${escapeSupportHtml(copy.footer)}
          </div>
        </div>
      </div>
    `,
  };
}

export async function sendInAppSupportCompletionEmail(
  input: Omit<InAppSupportCompletionEmailInput, 'appUrl'>,
): Promise<string> {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('Completion notification email is not configured.');
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
  const email = buildInAppSupportCompletionEmail({ ...input, appUrl });
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: input.reporterEmail,
    replyTo: INTERNAL_NOTIFY_EMAILS,
    subject: email.subject,
    html: email.html,
  }, { idempotencyKey: `in-app-support-completed-${input.id}` });
  if (error) throw new Error(error.message || 'Could not send the completion notification.');
  if (!data?.id) throw new Error('The email provider did not confirm the completion notification.');
  return data.id;
}
