const LESSON_TZ = 'Europe/Vilnius';

/** Lesson emails must show Europe/Vilnius. Vercel runs in UTC, so a bare toLocaleTimeString prints 13:00 for a 16:00 lesson. */
export function lessonEmailDateTime(start: Date): { date: string; time: string } {
  return {
    date: start.toLocaleDateString('lt-LT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: LESSON_TZ,
    }),
    time: start.toLocaleTimeString('lt-LT', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: LESSON_TZ,
    }),
  };
}
