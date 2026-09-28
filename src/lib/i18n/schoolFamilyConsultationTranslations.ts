const keys = ['target', 'family', 'child', 'overview', 'bookings', 'notesTitle', 'notesHelp', 'notesEmpty', 'notesBody', 'notesSave', 'notesOpen', 'notesEdit'] as const;
export type SchoolFamilyConsultationCopyKey = typeof keys[number];
const rows = {
  lt: ['Konsultacija skirta', 'Visai šeimai', 'Konkrečiam vaikui', 'Šeimos apžvalga', 'Rezervuotos konsultacijos', 'Specialisto pastabos', 'Pastabas mato susieti tėvai ir paskirtas specialistas.', 'Pastabų dar nėra.', 'Pastabos tėvams', 'Išsaugoti pastabas', 'Peržiūrėti pastabas', 'Rašyti pastabas'],
  en: ['Consultation for', 'The whole family', 'A specific child', 'Family overview', 'Booked consultations', 'Specialist notes', 'Notes are visible to authorized parents and the assigned specialist.', 'No notes yet.', 'Notes for parents', 'Save notes', 'View notes', 'Write notes'],
  pl: ['Konsultacja dla', 'Całej rodziny', 'Konkretnego dziecka', 'Przegląd rodziny', 'Zarezerwowane konsultacje', 'Notatki specjalisty', 'Notatki widzą uprawnieni rodzice i przypisany specjalista.', 'Nie ma jeszcze notatek.', 'Notatki dla rodziców', 'Zapisz notatki', 'Zobacz notatki', 'Napisz notatki'],
  lv: ['Konsultācija paredzēta', 'Visai ģimenei', 'Konkrētam bērnam', 'Ģimenes pārskats', 'Rezervētās konsultācijas', 'Speciālista piezīmes', 'Piezīmes redz pilnvarotie vecāki un norīkotais speciālists.', 'Piezīmju vēl nav.', 'Piezīmes vecākiem', 'Saglabāt piezīmes', 'Skatīt piezīmes', 'Rakstīt piezīmes'],
  ee: ['Konsultatsioon on mõeldud', 'Kogu perele', 'Kindlale lapsele', 'Pere ülevaade', 'Broneeritud konsultatsioonid', 'Spetsialisti märkmed', 'Märkmeid näevad volitatud vanemad ja määratud spetsialist.', 'Märkmeid veel pole.', 'Märkmed vanematele', 'Salvesta märkmed', 'Vaata märkmeid', 'Kirjuta märkmeid'],
  fr: ['Consultation pour', 'Toute la famille', 'Un enfant précis', 'Vue familiale', 'Consultations réservées', 'Notes du spécialiste', 'Les notes sont visibles par les parents autorisés et le spécialiste désigné.', 'Aucune note pour le moment.', 'Notes pour les parents', 'Enregistrer les notes', 'Voir les notes', 'Rédiger des notes'],
  es: ['Consulta para', 'Toda la familia', 'Un niño concreto', 'Vista familiar', 'Consultas reservadas', 'Notas del especialista', 'Las notas son visibles para los padres autorizados y el especialista asignado.', 'Aún no hay notas.', 'Notas para los padres', 'Guardar notas', 'Ver notas', 'Escribir notas'],
  de: ['Beratung für', 'Die ganze Familie', 'Ein bestimmtes Kind', 'Familienübersicht', 'Gebuchte Beratungen', 'Notizen der Fachkraft', 'Die Notizen sind für berechtigte Eltern und die zugewiesene Fachkraft sichtbar.', 'Noch keine Notizen.', 'Notizen für die Eltern', 'Notizen speichern', 'Notizen ansehen', 'Notizen schreiben'],
  se: ['Konsultation för', 'Hela familjen', 'Ett visst barn', 'Familjeöversikt', 'Bokade konsultationer', 'Specialistens anteckningar', 'Anteckningar visas för behöriga föräldrar och den tilldelade specialisten.', 'Inga anteckningar ännu.', 'Anteckningar till föräldrar', 'Spara anteckningar', 'Visa anteckningar', 'Skriv anteckningar'],
  dk: ['Konsultation for', 'Hele familien', 'Et bestemt barn', 'Familieoversigt', 'Bookede konsultationer', 'Specialistens noter', 'Noterne vises til godkendte forældre og den tilknyttede specialist.', 'Ingen noter endnu.', 'Noter til forældrene', 'Gem noter', 'Se noter', 'Skriv noter'],
  fi: ['Konsultaatio koskee', 'Koko perhettä', 'Tiettyä lasta', 'Perheen yleiskatsaus', 'Varatut konsultaatiot', 'Asiantuntijan muistiinpanot', 'Muistiinpanot näkyvät valtuutetuille vanhemmille ja nimetylle asiantuntijalle.', 'Ei vielä muistiinpanoja.', 'Muistiinpanot vanhemmille', 'Tallenna muistiinpanot', 'Näytä muistiinpanot', 'Kirjoita muistiinpanoja'],
  no: ['Konsultasjon for', 'Hele familien', 'Et bestemt barn', 'Familieoversikt', 'Bestilte konsultasjoner', 'Spesialistens notater', 'Notatene vises til autoriserte foreldre og den tildelte spesialisten.', 'Ingen notater ennå.', 'Notater til foreldrene', 'Lagre notater', 'Se notater', 'Skriv notater'],
  nl: ['Consult voor', 'Het hele gezin', 'Een specifiek kind', 'Gezinsoverzicht', 'Geboekte consulten', 'Notities van de specialist', 'Notities zijn zichtbaar voor bevoegde ouders en de toegewezen specialist.', 'Nog geen notities.', 'Notities voor ouders', 'Notities opslaan', 'Notities bekijken', 'Notities schrijven'],
} satisfies Record<string, string[]>;

export const schoolFamilyConsultationTranslations = Object.fromEntries(Object.entries(rows).map(([locale, values]) => [locale,
  Object.fromEntries(keys.map((key, index) => [`school.family.consultation.${key}`, values[index]])),
])) as Record<keyof typeof rows, Record<string, string>>;

export function schoolFamilyConsultationText(locale: string, key: SchoolFamilyConsultationCopyKey): string {
  return (rows[locale as keyof typeof rows] || rows.en)[keys.indexOf(key)];
}
