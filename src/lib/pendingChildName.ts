/** Known placeholder values stored in `students.full_name` before parent/student sets a real name. */
const PENDING_CHILD_NAME_LABELS = [
  'Laukiama registracijos',
  'Pending registration',
  'Oczekuje rejestracji',
  'Gaida reģistrāciju',
  'Registreerimine ootel',
  'Afventer registrering',
  'Venter på registrering',
  'Väntar på registrering',
  'Rekisteröinti kesken',
  'Registrierung ausstehend',
  'Inscription en attente',
  'Registro pendiente',
  'In afwachting van registratie',
  'Menunggu pendaftaran',
  'Kayıt bekleniyor',
  'Čeká na registraci',
  'Čaká na registráciu',
  'Čaka na registracijo',
  'Čeka registraciju',
  'Εκκρεμεί εγγραφή',
  'Regisztrációra vár',
  'Чака регистрация',
  'Очікує реєстрації',
  'Înregistrare în așteptare',
  'Registrazione in attesa',
  'Registo pendente',
  'Cadastro pendente',
  'Naghihintay ng pagpaparehistro',
  'รอการลงทะเบียน',
  '登録待ち',
  '가입 대기 중',
  '等待註冊',
  '等待注册',
  'ממתין להרשמה',
  'بانتظار التسجيل',
  'पंजीकरण बाकी है',
] as const;

const pendingLower = new Set(PENDING_CHILD_NAME_LABELS.map((s) => s.toLowerCase()));

/** True when the DB name is empty or a known “pending registration” placeholder. */
export function isPendingChildName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return true;
  return pendingLower.has(trimmed.toLowerCase());
}

/** Use in emails / tutor-facing copy — never expose the placeholder label as a person name. */
export function sanitizeStudentNameForEmail(
  name: string | null | undefined,
  fallback = 'Mokinys',
): string {
  if (isPendingChildName(name)) return fallback;
  const trimmed = (name ?? '').trim();
  return trimmed || fallback;
}
