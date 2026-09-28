import { describe, expect, it } from 'vitest';
import { fillExtraLessonsBody } from '../../api/_lib/extraLessonsContractShared';

const templateBody = 'Sutartis {{sutarties_nr}}. Akcepto data {{data_laikas_Europe_Vilnius}}. Sutarties data {{data}}. Sutikimas {{sutikimo_su_salygomis_busena}}. Išsiųsta {{el_pastas_ir_issiuntimo_data_laikas}}.';
const payload = {
  sutarties_nr: 'QA-1',
  data_laikas_Europe_Vilnius: '2026-09-28 18:49:53',
  data: '2026-09-28',
  sutikimo_su_salygomis_busena: '—',
  el_pastas_ir_issiuntimo_data_laikas: 'parent@example.com · 2026-09-28 18:50:00',
};

describe('extra lessons acceptance dates', () => {
  it('does not treat an offer preparation timestamp as parent consent', () => {
    const body = fillExtraLessonsBody({ templateBody, payload });
    expect(body).toContain('Akcepto data —. Sutarties data —. Sutikimas —.');
    expect(body).toContain('Išsiųsta parent@example.com · 2026-09-28 18:50:00.');
    expect(body).not.toContain('18:49:53');
    expect(payload.data_laikas_Europe_Vilnius).toBe('2026-09-28 18:49:53');
  });

  it('retains the recorded dates when the parent has accepted the terms', () => {
    const body = fillExtraLessonsBody({ templateBody, payload: { ...payload, sutikimo_su_salygomis_busena: 'TAIP' } });
    expect(body).toContain('Akcepto data 2026-09-28 18:49:53. Sutarties data 2026-09-28. Sutikimas TAIP.');
  });

  it('uses the explicit acceptance timestamp without inventing one when it is missing', () => {
    expect(fillExtraLessonsBody({ templateBody, payload, acceptedAtLabel: '2026-09-29 10:00:00', termsAcceptedLabel: 'TAIP' }))
      .toContain('Akcepto data 2026-09-29 10:00:00.');
    expect(fillExtraLessonsBody({ templateBody, payload: { sutarties_nr: 'QA-1', sutikimo_su_salygomis_busena: 'TAIP' } }))
      .toContain('Akcepto data —.');
  });
});
