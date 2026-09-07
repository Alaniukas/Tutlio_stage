/**
 * Short LT place labels for school student forms/filters
 * (miestas be „savivaldybė“, rajonas → „… raj.“).
 */
export const LT_MUNICIPALITIES: string[] = [
  'Akmenės raj.',
  'Alytus',
  'Alytaus raj.',
  'Anykščių raj.',
  'Birštonas',
  'Biržų raj.',
  'Druskininkai',
  'Elektrėnai',
  'Ignalinos raj.',
  'Jonava',
  'Joniškio raj.',
  'Jurbarko raj.',
  'Kaišiadorys',
  'Kalvarija',
  'Kaunas',
  'Kauno raj.',
  'Kazlų Rūda',
  'Kelmės raj.',
  'Kėdainių raj.',
  'Klaipėda',
  'Klaipėdos raj.',
  'Kretingos raj.',
  'Kupiškio raj.',
  'Lazdijų raj.',
  'Marijampolė',
  'Mažeikių raj.',
  'Molėtų raj.',
  'Neringa',
  'Pagėgiai',
  'Pakruojo raj.',
  'Palanga',
  'Panevėžys',
  'Panevėžio raj.',
  'Pasvalio raj.',
  'Plungės raj.',
  'Prienų raj.',
  'Radviliškio raj.',
  'Raseinių raj.',
  'Rietavas',
  'Rokiškio raj.',
  'Skuodo raj.',
  'Šakių raj.',
  'Šalčininkų raj.',
  'Šiauliai',
  'Šiaulių raj.',
  'Šilalės raj.',
  'Šilutės raj.',
  'Širvintų raj.',
  'Švenčionių raj.',
  'Tauragės raj.',
  'Telšių raj.',
  'Trakų raj.',
  'Ukmergės raj.',
  'Utenos raj.',
  'Varėnos raj.',
  'Vilkaviškio raj.',
  'Vilnius',
  'Vilniaus raj.',
  'Visaginas',
  'Zarasų raj.',
].sort((a, b) => a.localeCompare(b, 'lt'));

/** Stored as comma-separated short labels on students.municipality. */
export function parseMunicipalities(value: string | null | undefined): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function serializeMunicipalities(values: string[]): string {
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  unique.sort((a, b) => a.localeCompare(b, 'lt'));
  return unique.join(', ');
}

export function municipalityLabel(value: string | null | undefined): string {
  const list = parseMunicipalities(value);
  return list.length ? list.join(', ') : '—';
}
