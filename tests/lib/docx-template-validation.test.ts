import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { formatDocxTemplateError, validateDocxTemplateBytes } from '../../src/lib/docxTemplateValidation';

function minimalDocx(text: string): Uint8Array {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generate({ type: 'uint8array' });
}

describe('DOCX template validation', () => {
  it('accepts a correctly closed placeholder', () => {
    expect(validateDocxTemplateBytes(minimalDocx('{{parent_name}}'))).toBeNull();
  });

  it('identifies the exact placeholder when one closing brace is missing', () => {
    expect(validateDocxTemplateBytes(minimalDocx('{{parent_name}'))).toBe(
      'DOCX šablone neuždarytas laukelis „{{parent_name}“. Pataisykite jį į „{{parent_name}}“ ir įkelkite šabloną iš naujo.',
    );
  });

  it('does not expose Docxtemplater\'s opaque Multi error', () => {
    const message = formatDocxTemplateError({
      message: 'Multi error',
      properties: { id: 'multi_error', errors: [{ message: 'Unknown template failure' }] },
    });
    expect(message).toContain('DOCX šablono');
    expect(message).not.toContain('Multi error');
  });
});
