import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

type TemplateErrorProperties = {
  context?: unknown;
  errors?: unknown;
  explanation?: unknown;
  id?: unknown;
  xtag?: unknown;
};

type TemplateErrorLike = {
  message?: unknown;
  properties?: TemplateErrorProperties;
};

function asTemplateError(value: unknown): TemplateErrorLike | null {
  return value && typeof value === 'object' ? (value as TemplateErrorLike) : null;
}

function nestedTemplateErrors(error: unknown): TemplateErrorLike[] {
  const root = asTemplateError(error);
  if (!root) return [];
  const nested = Array.isArray(root.properties?.errors) ? root.properties.errors : [];
  if (nested.length === 0) return [root];
  return nested.flatMap((item) => nestedTemplateErrors(item));
}

function stringProperty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function unclosedPlaceholderMessage(error: TemplateErrorLike): string | null {
  if (stringProperty(error.properties?.id) !== 'unclosed_tag') return null;

  const source = [
    stringProperty(error.properties?.context),
    stringProperty(error.properties?.xtag),
    stringProperty(error.properties?.explanation),
  ].join(' ');
  const oneClosingBrace = source.match(/\{\{([a-zA-Z0-9_]+)\}(?!\})/);
  if (!oneClosingBrace) {
    return 'DOCX šablone yra neuždarytas {{...}} laukelis. Patikrinkite, kad kiekvienas laukelis turėtų po du atidaromuosius ir uždaromuosius skliaustus.';
  }

  const field = oneClosingBrace[1];
  const broken = `{{${field}}`;
  const expected = `{{${field}}}`;
  return `DOCX šablone neuždarytas laukelis „${broken}“. Pataisykite jį į „${expected}“ ir įkelkite šabloną iš naujo.`;
}

/** Convert Docxtemplater's opaque "Multi error" into a safe, actionable message. */
export function formatDocxTemplateError(error: unknown): string {
  const errors = nestedTemplateErrors(error);
  const actionable = errors.map(unclosedPlaceholderMessage).filter((message): message is string => Boolean(message));
  if (actionable.length > 0) return [...new Set(actionable)].slice(0, 3).join(' ');

  const rootMessage = stringProperty(asTemplateError(error)?.message);
  if (rootMessage && rootMessage !== 'Multi error') return rootMessage;
  return 'DOCX šablono {{...}} laukelių sintaksė neteisinga. Patikrinkite, kad visi laukeliai būtų uždaryti, pvz. „{{parent_name}}“.';
}

/** Parse a DOCX template without rendering it, so syntax failures are caught before upload. */
export function validateDocxTemplateBytes(bytes: ArrayBuffer | Uint8Array): string | null {
  try {
    const zip = new PizZip(bytes);
    new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
    });
    return null;
  } catch (error) {
    return formatDocxTemplateError(error);
  }
}
