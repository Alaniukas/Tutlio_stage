import { afterEach, describe, expect, it } from 'vitest';
import {
  applySchoolTerminology,
  applySchoolTerminologyToHtml,
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
    ['Šiam mokiniui ši pamoka nesuplanuota.', 'Šiam mokiniui šis užsiėmimas nesuplanuotas.'],
    ['Mokinys dalyvavo pamokoje, kai papildomų pamokų sutartis dar nebuvo patvirtinta.', 'Mokinys dalyvavo užsiėmime, kai papildomų užsiėmimų sutartis dar nebuvo patvirtinta.'],
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
  it('keeps signed links and attributes intact while rewriting visible English school email copy', () => {
    const href = 'https://tutlio.lt/api/join-session?sid=lesson&t=token&role=tutor';
    const html = `<a href="${href}" data-role="tutor">Join the tutor lesson</a> {tutor} ${href}`;
    expect(applySchoolTerminologyToHtml(html, 'en', { staff: true, activity: true }))
      .toBe(`<a href="${href}" data-role="tutor">Join the teacher session</a> {tutor} ${href}`);
  });

  it('keeps Lithuanian link attributes intact while transforming the visible staff and activity wording', () => {
    const html = '<a href="https://example.test/korepetitorius/pamoka" title="Pamoka">Korepetitorius: pamoka</a>';
    expect(applySchoolTerminologyToHtml(html, 'lt', { staff: true, activity: true }))
      .toBe('<a href="https://example.test/korepetitorius/pamoka" title="Pamoka">Mokytojas: užsiėmimas</a>');
  });

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

  it.each([
    ['cal.deleteRecurringTitle', 'Ištrinti pasikartojantį užsiėmimą'],
    ['orgFinance.schoolCurrentPayRate', 'Dabar nustatytas bazinis atlygis: {amount} € už užsiėmimą.'],
    ['orgFinance.schoolSummaryNote', 'Atlygis skaičiuojamas už pravestą užsiėmimą, ne už mokinių skaičių. Grupiniam ir individualiam užsiėmimui galima nustatyti skirtingą atlygį. Įvykęs užsiėmimas skaičiuojamas ir be patvirtinimo žymos. Taikomas išsaugotas užsiėmimo tarifas, o jei jo nėra - atitinkamas dabartinis atlygis. Atsiskaitymus tvarko mokykla.'],
    ['orgFinance.schoolFinalizedLessons', 'Užsiėmimai su galutiniu rezultatu'],
    ['cal.deleteOnlyThis', 'Tik šį užsiėmimą'],
    ['cal.deleteThisAndFuture', 'Šį ir visus ateinančius užsiėmimus'],
    ['cal.deleteAllRemaining', 'Visus likusius serijos užsiėmimus'],
    ['cal.deleteAllRemainingHint', 'Ištrinami būsimi suplanuoti ir atšaukti šios serijos užsiėmimai. Įvykusių užsiėmimų istorija išlieka.'],
    ['cal.deleteCancelledOnlyHint', 'Pasirinkta apimtimi ištrinami tik atšaukti jūsų arba jūsų vaiko užsiėmimai.'],
    ['cal.deleteConfirmSingle', 'Ar tikrai norite IŠTRINTI šį užsiėmimą?\n\nTai ne atšaukimas — užsiėmimas bus visam laikui pašalintas iš sistemos.'],
    ['cal.deleteConfirmFuture', 'Ar tikrai norite IŠTRINTI šį užsiėmimą IR VISUS ATEINANČIUS pasikartojančius užsiėmimus?\n\nTai ne atšaukimas — užsiėmimai bus visam laikui pašalinti iš sistemos.'],
    ['cal.deleteConfirmAll', 'Ar tikrai norite ištrinti visus likusius šios serijos suplanuotus ir atšauktus užsiėmimus? Įvykusių užsiėmimų istorija išlieka.'],
  ])('inflects school deletion copy for %s without changing tutor copy', (key, expected) => {
    const tutorCopy = lt[key];
    expect(applySchoolTerminology(tutorCopy, 'lt', { staff: false, activity: true }, key)).toBe(expected);
    expect(applySchoolTerminology(tutorCopy, 'lt', { staff: false, activity: false }, key)).toBe(tutorCopy);
  });

  it('keeps the LT deletion overrides out of other locales', () => {
    expect(applySchoolTerminology('Delete recurring lesson', 'en', { staff: false, activity: true }, 'cal.deleteRecurringTitle'))
      .toBe('Delete recurring session');
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
