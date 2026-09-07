import { afterEach, describe, expect, it } from 'vitest';
import {
  applySchoolTerminology,
  enLessonToActivity,
  ltLessonToActivity,
  schoolTerminologyForOrg,
} from '../../src/lib/i18n/schoolTerminology';
import {
  getSchoolTerminology,
  registerSchoolTerminologyOwner,
  resetSchoolTerminology,
  unregisterSchoolTerminologyOwner,
} from '../../src/lib/i18n/terminologyStore';
import { lt } from '../../src/lib/i18n/lt';

describe('schoolTerminologyForOrg', () => {
  it('turns both labels on for schools by default and lets a school switch one off', () => {
    expect(schoolTerminologyForOrg('school', {})).toEqual({ staff: true, activity: true });
    expect(schoolTerminologyForOrg('school', { school_activity_labels: false })).toEqual({ staff: true, activity: false });
    expect(schoolTerminologyForOrg('school', { school_teacher_labels: false })).toEqual({ staff: false, activity: true });
  });

  it('keeps company wording unless the org opts in explicitly', () => {
    expect(schoolTerminologyForOrg('company', {})).toEqual({ staff: false, activity: false });
    expect(schoolTerminologyForOrg('company', { school_teacher_labels: true })).toEqual({ staff: true, activity: false });
    expect(schoolTerminologyForOrg(null, null)).toEqual({ staff: false, activity: false });
  });
});

describe('ltLessonToActivity — pamoka → užsiėmimas with agreement', () => {
  const cases: Array<[string, string]> = [
    ['Pamokos', 'Užsiėmimai'],
    ['Pamoka', 'Užsiėmimas'],
    ['Ši pamoka buvo perkelta', 'Šis užsiėmimas buvo perkeltas'],
    ['Pamoka atšaukta', 'Užsiėmimas atšauktas'],
    ['📚 Pamoka patvirtinta!', '📚 Užsiėmimas patvirtintas!'],
    ['Bandomoji pamoka', 'Bandomasis užsiėmimas'],
    ['Grupinė pamoka', 'Grupinis užsiėmimas'],
    ['Artimiausia pamoka', 'Artimiausias užsiėmimas'],
    ['Visos pamokos', 'Visi užsiėmimai'],
    ['Atšauktos pamokos', 'Atšaukti užsiėmimai'],
    ['Pamokos laikas', 'Užsiėmimo laikas'],
    ['Pamokos informacija', 'Užsiėmimo informacija'],
    ['iki pamokos pradžios', 'iki užsiėmimo pradžios'],
    ['po pamokos', 'po užsiėmimo'],
    ['Nepavyko rezervuoti pamokos.', 'Nepavyko rezervuoti užsiėmimo.'],
    ['Ar tikrai norite pašalinti {name} iš šios pamokos?', 'Ar tikrai norite pašalinti {name} iš šio užsiėmimo?'],
    ['Atšaukti pamoką', 'Atšaukti užsiėmimą'],
    ['Ar tikrai norite atšaukti šią pamoką?', 'Ar tikrai norite atšaukti šį užsiėmimą?'],
    ['Peržiūrėti visas pamokas', 'Peržiūrėti visus užsiėmimus'],
    ['Taikyti kreditą kitai pamokai', 'Taikyti kreditą kitam užsiėmimui'],
    ['Šioje grupinėje pamokoje nebėra laisvų vietų.', 'Šiame grupiniame užsiėmime nebėra laisvų vietų.'],
    ['Nėra pamokų', 'Nėra užsiėmimų'],
    ['Pamokų nustatymai', 'Užsiėmimų nustatymai'],
    ['Klaida: Šis laikas dubliuojasi su kita jūsų pamoka!', 'Klaida: Šis laikas dubliuojasi su kitu jūsų užsiėmimu!'],
    ['Pamokos, kurios bus atšauktos:', 'Užsiėmimai, kurie bus atšauktos:'],
    ['Mano pamoka (grupinė)', 'Mano užsiėmimas (grupinis)'],
    ['Vaiko pamoka įvyko', 'Vaiko užsiėmimas įvyko'],
    ['Rytojaus pamokos ({count})', 'Rytojaus užsiėmimai ({count})'],
    ['Jūsų vaiko <strong>{student}</strong> pamoka pas korepetitorių', 'Jūsų vaiko <strong>{student}</strong> užsiėmimas pas korepetitorių'],
    ['Pakeitimai bus pritaikyti visoms būsimoms pamokoms', 'Pakeitimai bus pritaikyti visiems būsimiems užsiėmimams'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(ltLessonToActivity(input)).toBe(expected);
    });
  }

  it('never touches placeholders, tags or URLs', () => {
    expect(ltLessonToActivity('{pamokos} <a href="https://x.lt/pamokos">Pamokos</a>'))
      .toBe('{pamokos} <a href="https://x.lt/pamokos">Užsiėmimai</a>');
  });

  it('leaves unrelated words such as "Popamokinio" alone and returns untouched strings by reference', () => {
    const plain = 'Kalendorius';
    expect(ltLessonToActivity(plain)).toBe(plain);
    expect(ltLessonToActivity('Popamokinio ugdymo centras')).toBe('Popamokinio ugdymo centras');
  });

  it('rewrites every Lithuanian dictionary string that mentions pamoka', () => {
    const leftovers = Object.entries(lt)
      .filter(([key, value]) => /(?<!\p{L})pamok/iu.test(value) && !key.startsWith('quiz.'))
      .map(([key, value]) => [key, ltLessonToActivity(value)] as const)
      .filter(([, out]) => /(?<!\p{L})pamok/iu.test(out));
    expect(leftovers, leftovers.map(([k]) => k).join('\n')).toEqual([]);
  });
});

describe('enLessonToActivity', () => {
  it('maps lesson/lessons with case preserved', () => {
    expect(enLessonToActivity('Lessons · lesson · LESSON {lesson}')).toBe('Sessions · session · SESSION {lesson}');
  });
});

describe('applySchoolTerminology', () => {
  it('swaps staff wording through the schools copy layer and activity wording through the LT rules', () => {
    const out = applySchoolTerminology('Korepetitorius dar nepriskirtas. Čia matysite savo pamokas.', 'lt', { staff: true, activity: true });
    expect(out).toBe('Mokytojas dar nepriskirtas. Čia matysite savo užsiėmimus.');
  });

  it('is a no-op when both switches are off', () => {
    const text = 'Pamoka pas korepetitorių';
    expect(applySchoolTerminology(text, 'lt', { staff: false, activity: false })).toBe(text);
  });

  it('uses the explicit per-key override for ambiguous keys', () => {
    expect(applySchoolTerminology('Pamoka', 'lt', { staff: false, activity: true }, 'common.lesson')).toBe('Užsiėmimas');
  });
});

describe('terminologyStore', () => {
  afterEach(() => resetSchoolTerminology());

  it('unions every registered owner and keeps wording on while any owner remains', () => {
    const parent = Symbol('parent');
    const embed = Symbol('embed');
    registerSchoolTerminologyOwner(parent, { staff: true, activity: true });
    registerSchoolTerminologyOwner(embed, { staff: true, activity: false });
    expect(getSchoolTerminology()).toEqual({ staff: true, activity: true });
    unregisterSchoolTerminologyOwner(embed);
    expect(getSchoolTerminology()).toEqual({ staff: true, activity: true });
    unregisterSchoolTerminologyOwner(parent);
    expect(getSchoolTerminology()).toEqual({ staff: false, activity: false });
  });
});
