const keys = [
  'compStats.pageSubtitleForward', 'compStats.pageSubtitleSpanning', 'compStats.lessonsPlanned',
  'compStats.projectedRevenue', 'compStats.projectedRevenueHint', 'compStats.plannedSectionTitle',
  'compStats.topProjected', 'dateFilter.nextWeek', 'dateFilter.nextMonth', 'invoices.downloadSelected',
] as const;

const copy: Record<string, string[]> = {
  lv: [
    'Prognoze pēc plānotajām nodarbībām izvēlētajā periodā. Ieņēmumi ir paredzami, nevis saņemti.',
    'Notikušās un atlikušās plānotās nodarbības izvēlētajā periodā. Faktiskie ieņēmumi ir no notikušajām nodarbībām; prognoze aptver atlikušo laiku.',
    'Plānotās nodarbības', 'Paredzamie ieņēmumi', 'Atlikušās aktīvās nodarbības izvēlētajā periodā, kas vēl nav notikušas.',
    'Prognoze atlikušajam periodam', 'Lielākie paredzamie ieņēmumi', 'Nākamā nedēļa', 'Nākamais mēnesis', 'Lejupielādēt izvēlētos ({count})',
  ],
  ee: [
    'Prognoos valitud perioodi kavandatud tundide põhjal. Tulu on prognoositud, mitte laekunud.',
    'Valitud perioodi toimunud ja ülejäänud kavandatud tunnid. Tegelik tulu pärineb toimunud tundidest; prognoos hõlmab ülejäänud aega.',
    'Kavandatud tunnid', 'Prognoositud tulu', 'Valitud perioodi ülejäänud aktiivsed tunnid, mis pole veel toimunud.',
    'Ülejäänud perioodi prognoos', 'Suurim prognoositud tulu', 'Järgmine nädal', 'Järgmine kuu', 'Laadi valitud alla ({count})',
  ],
  fr: [
    'Prévision basée sur les cours prévus pendant la période sélectionnée. Les revenus sont prévisionnels, pas encaissés.',
    'Cours terminés et cours restants prévus pendant la période sélectionnée. Les revenus réels proviennent des cours terminés ; la prévision couvre le reste.',
    'Cours prévus', 'Revenus prévisionnels', 'Cours actifs restants pendant la période sélectionnée qui n’ont pas encore eu lieu.',
    'Prévision pour le reste de la période', 'Revenus prévisionnels les plus élevés', 'Semaine prochaine', 'Mois prochain', 'Télécharger la sélection ({count})',
  ],
  es: [
    'Previsión basada en las clases programadas del período seleccionado. Los ingresos son estimados, no cobrados.',
    'Clases completadas y clases programadas restantes del período seleccionado. Los ingresos reales proceden de las clases completadas; la previsión cubre el resto.',
    'Clases previstas', 'Ingresos previstos', 'Clases activas restantes del período seleccionado que aún no se han impartido.',
    'Previsión para el resto del período', 'Mayores ingresos previstos', 'Próxima semana', 'Próximo mes', 'Descargar seleccionadas ({count})',
  ],
  de: [
    'Prognose anhand geplanter Unterrichtsstunden im gewählten Zeitraum. Die Einnahmen sind voraussichtlich, nicht eingegangen.',
    'Abgeschlossene und verbleibende geplante Unterrichtsstunden im gewählten Zeitraum. Tatsächliche Einnahmen stammen aus abgeschlossenen Stunden; die Prognose umfasst den Rest.',
    'Geplante Unterrichtsstunden', 'Voraussichtliche Einnahmen', 'Verbleibende aktive Unterrichtsstunden im gewählten Zeitraum, die noch nicht stattgefunden haben.',
    'Prognose für den restlichen Zeitraum', 'Höchste voraussichtliche Einnahmen', 'Nächste Woche', 'Nächster Monat', 'Ausgewählte herunterladen ({count})',
  ],
  se: [
    'Prognos utifrån planerade lektioner under den valda perioden. Intäkterna är beräknade, inte inbetalda.',
    'Genomförda och återstående planerade lektioner under den valda perioden. Faktiska intäkter kommer från genomförda lektioner; prognosen omfattar resten.',
    'Planerade lektioner', 'Beräknade intäkter', 'Återstående aktiva lektioner under den valda perioden som ännu inte har genomförts.',
    'Prognos för resten av perioden', 'Högsta beräknade intäkter', 'Nästa vecka', 'Nästa månad', 'Ladda ner valda ({count})',
  ],
  dk: [
    'Prognose ud fra planlagte lektioner i den valgte periode. Indtægterne er forventede, ikke modtagne.',
    'Gennemførte og resterende planlagte lektioner i den valgte periode. Faktiske indtægter kommer fra gennemførte lektioner; prognosen dækker resten.',
    'Planlagte lektioner', 'Forventede indtægter', 'Resterende aktive lektioner i den valgte periode, som endnu ikke er gennemført.',
    'Prognose for resten af perioden', 'Højeste forventede indtægter', 'Næste uge', 'Næste måned', 'Download valgte ({count})',
  ],
  fi: [
    'Ennuste valitun ajanjakson suunniteltujen oppituntien perusteella. Tulot ovat arvioituja, eivät maksettuja.',
    'Valitun ajanjakson pidetyt ja jäljellä olevat suunnitellut oppitunnit. Toteutuneet tulot perustuvat pidettyihin oppitunteihin; ennuste kattaa loput.',
    'Suunnitellut oppitunnit', 'Arvioidut tulot', 'Valitun ajanjakson jäljellä olevat aktiiviset oppitunnit, joita ei ole vielä pidetty.',
    'Loppuajanjakson ennuste', 'Suurimmat arvioidut tulot', 'Ensi viikko', 'Ensi kuukausi', 'Lataa valitut ({count})',
  ],
  no: [
    'Prognose ut fra planlagte timer i den valgte perioden. Inntektene er forventede, ikke mottatte.',
    'Gjennomførte og gjenstående planlagte timer i den valgte perioden. Faktiske inntekter kommer fra gjennomførte timer; prognosen dekker resten.',
    'Planlagte timer', 'Forventede inntekter', 'Gjenstående aktive timer i den valgte perioden som ennå ikke er gjennomført.',
    'Prognose for resten av perioden', 'Høyeste forventede inntekter', 'Neste uke', 'Neste måned', 'Last ned valgte ({count})',
  ],
  nl: [
    'Prognose op basis van geplande lessen in de geselecteerde periode. De inkomsten zijn verwacht, niet ontvangen.',
    'Afgeronde en resterende geplande lessen in de geselecteerde periode. Werkelijke inkomsten komen uit afgeronde lessen; de prognose betreft de rest.',
    'Geplande lessen', 'Verwachte inkomsten', 'Resterende actieve lessen in de geselecteerde periode die nog niet hebben plaatsgevonden.',
    'Prognose voor de rest van de periode', 'Hoogste verwachte inkomsten', 'Volgende week', 'Volgende maand', 'Geselecteerde downloaden ({count})',
  ],
  th: [
    'คาดการณ์จากบทเรียนที่กำหนดไว้ในช่วงเวลาที่เลือก รายได้เป็นยอดที่คาดการณ์ ไม่ใช่ยอดที่ได้รับแล้ว',
    'บทเรียนที่สอนเสร็จแล้วและบทเรียนที่เหลือในช่วงเวลาที่เลือก รายได้จริงมาจากบทเรียนที่สอนเสร็จแล้ว ส่วนการคาดการณ์ครอบคลุมเวลาที่เหลือ',
    'บทเรียนที่กำหนดไว้', 'รายได้ที่คาดการณ์', 'บทเรียนที่ยังใช้งานอยู่ในช่วงเวลาที่เลือกและยังไม่ได้สอน',
    'คาดการณ์สำหรับช่วงเวลาที่เหลือ', 'รายได้ที่คาดการณ์สูงสุด', 'สัปดาห์หน้า', 'เดือนหน้า', 'ดาวน์โหลดรายการที่เลือก ({count})',
  ],
  tr: [
    'Seçilen dönemde planlanan derslere göre tahmin. Gelir tahminidir, tahsil edilmiş değildir.',
    'Seçilen dönemde tamamlanan ve kalan planlı dersler. Gerçek gelir tamamlanan derslerden gelir; tahmin kalan süreyi kapsar.',
    'Planlanan dersler', 'Tahmini gelir', 'Seçilen dönemde henüz yapılmamış kalan aktif dersler.',
    'Kalan dönem için tahmin', 'En yüksek tahmini gelir', 'Gelecek hafta', 'Gelecek ay', 'Seçilenleri indir ({count})',
  ],
  'zh-hk': [
    '根據所選期間已安排的課堂作出預測。收入為預計金額，並非已收款項。',
    '所選期間已完成及餘下已安排的課堂。實際收入來自已完成的課堂；預測涵蓋餘下時間。',
    '已安排課堂', '預計收入', '所選期間餘下仍有效、尚未進行的課堂。',
    '餘下期間預測', '最高預計收入', '下星期', '下個月', '下載所選項目（{count}）',
  ],
  it: [
    'Previsione basata sulle lezioni programmate nel periodo selezionato. I ricavi sono previsti, non incassati.',
    'Lezioni completate e lezioni programmate rimanenti nel periodo selezionato. I ricavi effettivi derivano dalle lezioni completate; la previsione copre il resto.',
    'Lezioni programmate', 'Ricavi previsti', 'Lezioni attive rimanenti nel periodo selezionato che non si sono ancora svolte.',
    'Previsione per il resto del periodo', 'Ricavi previsti più elevati', 'Prossima settimana', 'Prossimo mese', 'Scarica selezionate ({count})',
  ],
  pt: [
    'Previsão baseada nas aulas agendadas no período selecionado. As receitas são previstas, não recebidas.',
    'Aulas concluídas e aulas agendadas restantes no período selecionado. As receitas reais provêm das aulas concluídas; a previsão abrange o restante período.',
    'Aulas planeadas', 'Receitas previstas', 'Aulas ativas restantes no período selecionado que ainda não se realizaram.',
    'Previsão para o restante período', 'Maiores receitas previstas', 'Próxima semana', 'Próximo mês', 'Transferir selecionadas ({count})',
  ],
  ro: [
    'Prognoză pe baza lecțiilor programate în perioada selectată. Veniturile sunt estimate, nu încasate.',
    'Lecții finalizate și lecții programate rămase în perioada selectată. Veniturile reale provin din lecțiile finalizate; prognoza acoperă restul perioadei.',
    'Lecții planificate', 'Venituri estimate', 'Lecții active rămase în perioada selectată care nu au avut încă loc.',
    'Prognoză pentru restul perioadei', 'Cele mai mari venituri estimate', 'Săptămâna viitoare', 'Luna viitoare', 'Descarcă selecția ({count})',
  ],
  cs: [
    'Prognóza podle naplánovaných lekcí ve vybraném období. Příjmy jsou předpokládané, nikoli přijaté.',
    'Dokončené a zbývající naplánované lekce ve vybraném období. Skutečné příjmy pocházejí z dokončených lekcí; prognóza pokrývá zbytek období.',
    'Naplánované lekce', 'Předpokládané příjmy', 'Zbývající aktivní lekce ve vybraném období, které ještě neproběhly.',
    'Prognóza na zbytek období', 'Nejvyšší předpokládané příjmy', 'Příští týden', 'Příští měsíc', 'Stáhnout vybrané ({count})',
  ],
  el: [
    'Πρόβλεψη βάσει προγραμματισμένων μαθημάτων στην επιλεγμένη περίοδο. Τα έσοδα είναι προβλεπόμενα, όχι εισπραχθέντα.',
    'Ολοκληρωμένα και υπόλοιπα προγραμματισμένα μαθήματα στην επιλεγμένη περίοδο. Τα πραγματικά έσοδα προέρχονται από ολοκληρωμένα μαθήματα· η πρόβλεψη καλύπτει τα υπόλοιπα.',
    'Προγραμματισμένα μαθήματα', 'Προβλεπόμενα έσοδα', 'Υπόλοιπα ενεργά μαθήματα στην επιλεγμένη περίοδο που δεν έχουν ακόμη πραγματοποιηθεί.',
    'Πρόβλεψη για το υπόλοιπο της περιόδου', 'Υψηλότερα προβλεπόμενα έσοδα', 'Επόμενη εβδομάδα', 'Επόμενος μήνας', 'Λήψη επιλεγμένων ({count})',
  ],
  hu: [
    'Előrejelzés a kiválasztott időszak tervezett órái alapján. A bevétel várható, nem beérkezett.',
    'A kiválasztott időszak megtartott és hátralévő tervezett órái. A tényleges bevétel a megtartott órákból származik; az előrejelzés a hátralévő időt fedi le.',
    'Tervezett órák', 'Várható bevétel', 'A kiválasztott időszak hátralévő aktív órái, amelyeket még nem tartottak meg.',
    'Előrejelzés az időszak hátralévő részére', 'Legmagasabb várható bevétel', 'Jövő hét', 'Jövő hónap', 'Kijelöltek letöltése ({count})',
  ],
  bg: [
    'Прогноза въз основа на планираните уроци в избрания период. Приходите са прогнозни, а не получени.',
    'Проведени и оставащи планирани уроци в избрания период. Реалните приходи са от проведените уроци; прогнозата обхваща останалото време.',
    'Планирани уроци', 'Прогнозни приходи', 'Оставащи активни уроци в избрания период, които още не са проведени.',
    'Прогноза за останалата част от периода', 'Най-високи прогнозни приходи', 'Следващата седмица', 'Следващият месец', 'Изтегляне на избраните ({count})',
  ],
  hr: [
    'Prognoza prema zakazanim satima u odabranom razdoblju. Prihodi su očekivani, a ne naplaćeni.',
    'Održani i preostali zakazani sati u odabranom razdoblju. Stvarni prihodi dolaze od održanih sati; prognoza obuhvaća ostatak razdoblja.',
    'Planirani sati', 'Očekivani prihodi', 'Preostali aktivni sati u odabranom razdoblju koji još nisu održani.',
    'Prognoza za ostatak razdoblja', 'Najveći očekivani prihodi', 'Sljedeći tjedan', 'Sljedeći mjesec', 'Preuzmi odabrane ({count})',
  ],
  sk: [
    'Prognóza podľa naplánovaných lekcií vo vybranom období. Príjmy sú predpokladané, nie prijaté.',
    'Dokončené a zostávajúce naplánované lekcie vo vybranom období. Skutočné príjmy pochádzajú z dokončených lekcií; prognóza pokrýva zvyšok obdobia.',
    'Naplánované lekcie', 'Predpokladané príjmy', 'Zostávajúce aktívne lekcie vo vybranom období, ktoré ešte neprebehli.',
    'Prognóza na zvyšok obdobia', 'Najvyššie predpokladané príjmy', 'Budúci týždeň', 'Budúci mesiac', 'Stiahnuť vybrané ({count})',
  ],
  sl: [
    'Napoved glede na načrtovane ure v izbranem obdobju. Prihodki so predvideni, ne prejeti.',
    'Opravljene in preostale načrtovane ure v izbranem obdobju. Dejanski prihodki izvirajo iz opravljenih ur; napoved zajema preostanek obdobja.',
    'Načrtovane ure', 'Predvideni prihodki', 'Preostale aktivne ure v izbranem obdobju, ki še niso bile opravljene.',
    'Napoved za preostanek obdobja', 'Najvišji predvideni prihodki', 'Naslednji teden', 'Naslednji mesec', 'Prenesi izbrane ({count})',
  ],
  hi: [
    'चुनी गई अवधि में निर्धारित कक्षाओं के आधार पर पूर्वानुमान। आय अनुमानित है, प्राप्त राशि नहीं।',
    'चुनी गई अवधि में पूरी हुई और शेष निर्धारित कक्षाएँ। वास्तविक आय पूरी हुई कक्षाओं से है; पूर्वानुमान शेष अवधि के लिए है।',
    'निर्धारित कक्षाएँ', 'अनुमानित आय', 'चुनी गई अवधि की शेष सक्रिय कक्षाएँ जो अभी नहीं हुई हैं।',
    'शेष अवधि का पूर्वानुमान', 'सबसे अधिक अनुमानित आय', 'अगला सप्ताह', 'अगला महीना', 'चुनी हुई डाउनलोड करें ({count})',
  ],
  ko: [
    '선택한 기간에 예정된 수업을 기준으로 한 예측입니다. 수입은 예상 금액이며 실제 입금액이 아닙니다.',
    '선택한 기간에 완료된 수업과 남은 예정 수업입니다. 실제 수입은 완료된 수업에서 발생하며 예측은 남은 기간을 대상으로 합니다.',
    '예정된 수업', '예상 수입', '선택한 기간에 남아 있는 활성 수업 중 아직 진행되지 않은 수업입니다.',
    '남은 기간 예측', '가장 높은 예상 수입', '다음 주', '다음 달', '선택 항목 다운로드 ({count})',
  ],
  ja: [
    '選択した期間の予定授業に基づく予測です。収入は予測額であり、入金済みの金額ではありません。',
    '選択した期間の完了した授業と残りの予定授業です。実際の収入は完了した授業によるもので、予測は残りの期間を対象とします。',
    '予定授業', '予測収入', '選択した期間に残っている有効な授業のうち、まだ実施されていないものです。',
    '残りの期間の予測', '予測収入が最も高い講師', '来週', '来月', '選択項目をダウンロード（{count}）',
  ],
  id: [
    'Perkiraan berdasarkan pelajaran terjadwal dalam periode yang dipilih. Pendapatan masih berupa perkiraan, belum diterima.',
    'Pelajaran yang selesai dan pelajaran terjadwal yang tersisa dalam periode yang dipilih. Pendapatan aktual berasal dari pelajaran yang selesai; perkiraan mencakup sisanya.',
    'Pelajaran terjadwal', 'Perkiraan pendapatan', 'Pelajaran aktif yang tersisa dalam periode yang dipilih dan belum berlangsung.',
    'Perkiraan untuk sisa periode', 'Perkiraan pendapatan tertinggi', 'Minggu depan', 'Bulan depan', 'Unduh yang dipilih ({count})',
  ],
  ar: [
    'توقعات بناءً على الدروس المجدولة في الفترة المحددة. الإيرادات متوقعة وليست مبالغ محصلة.',
    'الدروس المكتملة والدروس المجدولة المتبقية في الفترة المحددة. الإيرادات الفعلية ناتجة عن الدروس المكتملة؛ والتوقعات تغطي الفترة المتبقية.',
    'الدروس المخطط لها', 'الإيرادات المتوقعة', 'الدروس النشطة المتبقية في الفترة المحددة التي لم تُعقد بعد.',
    'توقعات لبقية الفترة', 'أعلى إيرادات متوقعة', 'الأسبوع القادم', 'الشهر القادم', 'تنزيل المحدد ({count})',
  ],
  'pt-br': [
    'Previsão com base nas aulas agendadas no período selecionado. A receita é prevista, não recebida.',
    'Aulas concluídas e aulas agendadas restantes no período selecionado. A receita real vem das aulas concluídas; a previsão cobre o restante.',
    'Aulas planejadas', 'Receita prevista', 'Aulas ativas restantes no período selecionado que ainda não aconteceram.',
    'Previsão para o restante do período', 'Maiores receitas previstas', 'Próxima semana', 'Próximo mês', 'Baixar selecionadas ({count})',
  ],
  'es-mx': [
    'Pronóstico basado en las clases programadas del período seleccionado. Los ingresos son estimados, no cobrados.',
    'Clases completadas y clases programadas restantes del período seleccionado. Los ingresos reales provienen de las clases completadas; el pronóstico cubre el resto.',
    'Clases planeadas', 'Ingresos estimados', 'Clases activas restantes del período seleccionado que todavía no se han impartido.',
    'Pronóstico para el resto del período', 'Mayores ingresos estimados', 'Próxima semana', 'Próximo mes', 'Descargar seleccionadas ({count})',
  ],
  fil: [
    'Pagtataya batay sa mga nakaiskedyul na aralin sa napiling panahon. Ang kita ay inaasahan pa lamang, hindi pa natatanggap.',
    'Mga natapos at natitirang nakaiskedyul na aralin sa napiling panahon. Ang aktuwal na kita ay mula sa mga natapos na aralin; saklaw ng pagtataya ang natitirang panahon.',
    'Mga nakaplanong aralin', 'Inaasahang kita', 'Mga natitirang aktibong aralin sa napiling panahon na hindi pa nagaganap.',
    'Pagtataya para sa natitirang panahon', 'Pinakamataas na inaasahang kita', 'Susunod na linggo', 'Susunod na buwan', 'I-download ang napili ({count})',
  ],
  he: [
    'תחזית לפי השיעורים המתוכננים בתקופה שנבחרה. ההכנסות צפויות, ולא סכומים שכבר התקבלו.',
    'שיעורים שהושלמו ושיעורים מתוכננים שנותרו בתקופה שנבחרה. ההכנסות בפועל הן מהשיעורים שהושלמו; התחזית מתייחסת לתקופה שנותרה.',
    'שיעורים מתוכננים', 'הכנסות צפויות', 'שיעורים פעילים שנותרו בתקופה שנבחרה וטרם התקיימו.',
    'תחזית להמשך התקופה', 'ההכנסות הצפויות הגבוהות ביותר', 'השבוע הבא', 'החודש הבא', 'הורדת הפריטים שנבחרו ({count})',
  ],
  uk: [
    'Прогноз за запланованими заняттями у вибраному періоді. Доходи очікувані, а не отримані.',
    'Проведені та решта запланованих занять у вибраному періоді. Фактичні доходи походять від проведених занять; прогноз охоплює решту періоду.',
    'Заплановані заняття', 'Очікувані доходи', 'Решта активних занять у вибраному періоді, які ще не відбулися.',
    'Прогноз на решту періоду', 'Найвищі очікувані доходи', 'Наступний тиждень', 'Наступний місяць', 'Завантажити вибрані ({count})',
  ],
};

export const organizationReleaseTranslations: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(copy).map(([locale, values]) => [locale, Object.fromEntries(keys.map((key, index) => [key, values[index]]))]),
);

export const schoolGroupActivationTranslations: Record<string, Record<string, string>> = {
  nl: {
    'school.groups.suspendedWhy': 'De groepslessen zijn gepauzeerd: er zijn minstens {minimum} ondertekende overeenkomsten nodig (momenteel {active}).',
    'school.groups.suspendedOfferPending': 'Wachten op bevestiging door de ouders: {names}',
    'school.groups.suspendedNoContract': 'Nog geen overeenkomst aangeboden: {names}',
    'school.groups.memberActive': 'overeenkomst ondertekend',
    'school.groups.memberOfferPending': 'wacht op bevestiging door de ouders',
    'school.groups.memberNoContract': 'nog geen overeenkomst aangeboden',
    'school.groups.memberSuspended': 'overeenkomst gepauzeerd',
    'school.groups.memberTerminated': 'overeenkomst beëindigd',
  },
  se: {
    'school.groups.suspendedWhy': 'Grupplektionerna är pausade: minst {minimum} undertecknade avtal krävs (för närvarande {active}).',
    'school.groups.suspendedOfferPending': 'Väntar på föräldrarnas bekräftelse: {names}',
    'school.groups.suspendedNoContract': 'Inget avtal har erbjudits ännu: {names}',
    'school.groups.memberActive': 'avtalet är undertecknat',
    'school.groups.memberOfferPending': 'väntar på föräldrarnas bekräftelse',
    'school.groups.memberNoContract': 'inget avtal har erbjudits ännu',
    'school.groups.memberSuspended': 'avtalet är pausat',
    'school.groups.memberTerminated': 'avtalet har avslutats',
  },
};
