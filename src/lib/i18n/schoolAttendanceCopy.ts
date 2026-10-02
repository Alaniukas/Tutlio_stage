const lt = {
  confirmParticipation: 'Patvirtinti dalyvavimą',
  late: 'Vėlavo',
  absent: 'Nedalyvavo',
  autoJoined: 'Sistema užfiksavo prisijungimą',
  autoLate: 'Sistema užfiksavo vėlavimą ({time})',
  autoMissing: 'Sistema nefiksavo prisijungimo',
  promptTitle: 'Pažymėkite lankomumą',
  promptDesc: 'Sistema rodo automatinį prisijungimo signalą. Jei jo nėra arba jis neteisingas, patvirtinkite rezultatą ranka.',
};

export type SchoolAttendanceCopyKey = keyof typeof lt;
type Copy = Record<SchoolAttendanceCopyKey, string>;

export const schoolAttendanceCopy: Record<string, Copy> = {
  lt,
  en: {
    confirmParticipation: 'Confirm attendance',
    late: 'Late',
    absent: 'Did not attend',
    autoJoined: 'Join recorded automatically',
    autoLate: 'Late join recorded automatically ({time})',
    autoMissing: 'No join recorded by the system',
    promptTitle: 'Mark attendance',
    promptDesc: 'The system shows an automatic join signal. If it is missing or wrong, confirm the outcome manually.',
  },
  pl: {
    confirmParticipation: 'Potwierdź obecność',
    late: 'Spóźniony',
    absent: 'Nieobecny',
    autoJoined: 'System zarejestrował dołączenie',
    autoLate: 'System zarejestrował spóźnione dołączenie ({time})',
    autoMissing: 'System nie zarejestrował dołączenia',
    promptTitle: 'Oznacz obecność',
    promptDesc: 'System pokazuje automatyczny sygnał dołączenia. Jeśli go brakuje lub jest błędny, potwierdź wynik ręcznie.',
  },
};

for (const locale of ['lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl', 'th']) {
  if (!schoolAttendanceCopy[locale]) schoolAttendanceCopy[locale] = schoolAttendanceCopy.en;
}

export function schoolAttendanceLabel(locale: string, key: SchoolAttendanceCopyKey): string {
  return (schoolAttendanceCopy[locale] || schoolAttendanceCopy.en)[key];
}
