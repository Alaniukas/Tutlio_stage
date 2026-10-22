const keys = ["confirmStopTutor","tutorRemovalBilling","tutorRemovalChanged"] as const;

const rows = {
  "lt": [
    "Pašalinti šį korepetitorių ir atšaukti jo būsimas neapmokėtas individualias pamokas? Pamokų istorija ir apmokėti paketai išliks.",
    "Pirmiausia sutvarkykite su mokėjimais, paketais ar sąskaitomis susietas būsimas pamokas ir laukiančius paketų pasiūlymus. Korepetitorius nepašalintas.",
    "Priskyrimas arba pamokos pasikeitė. Atnaujinkite mokinio kortelę ir bandykite dar kartą."
  ],
  "en": [
    "Remove this tutor and cancel their future unpaid individual lessons? Lesson history and paid packages will be kept.",
    "First resolve future lessons and pending offers linked to payments, packages or invoices. The tutor has not been removed.",
    "The assignment or lessons changed. Refresh the student card and try again."
  ],
  "pl": [
    "Usunąć tego korepetytora i odwołać jego przyszłe nieopłacone lekcje indywidualne? Historia lekcji i opłacone pakiety zostaną zachowane.",
    "Najpierw rozlicz przyszłe lekcje i oczekujące oferty powiązane z płatnościami, pakietami lub fakturami. Korepetytor nie został usunięty.",
    "Przypisanie lub lekcje uległy zmianie. Odśwież kartę ucznia i spróbuj ponownie."
  ],
  "lv": [
    "Noņemt šo pasniedzēju un atcelt viņa turpmākās neapmaksātās individuālās nodarbības? Nodarbību vēsture un apmaksātās paketes tiks saglabātas.",
    "Vispirms sakārtojiet turpmākās nodarbības un gaidošos piedāvājumus, kas saistīti ar maksājumiem, paketēm vai rēķiniem. Pasniedzējs nav noņemts.",
    "Piesaistījums vai nodarbības ir mainījušās. Atjaunojiet skolēna kartīti un mēģiniet vēlreiz."
  ],
  "ee": [
    "Kas eemaldada see õpetaja ja tühistada tema tulevased tasumata individuaaltunnid? Tundide ajalugu ja tasutud paketid säilivad.",
    "Esmalt lahendage maksete, pakettide või arvetega seotud tulevased tunnid ja ootel pakkumised. Õpetajat ei eemaldatud.",
    "Seos või tunnid on muutunud. Värskendage õpilase kaarti ja proovige uuesti."
  ],
  "fr": [
    "Retirer ce professeur et annuler ses futurs cours individuels non payés ? L’historique des cours et les forfaits payés seront conservés.",
    "Réglez d’abord les futurs cours et les offres en attente liés à des paiements, forfaits ou factures. Le professeur n’a pas été retiré.",
    "L’affectation ou les cours ont changé. Actualisez la fiche de l’élève et réessayez."
  ],
  "es": [
    "¿Quitar este tutor y cancelar sus futuras clases individuales sin pagar? Se conservarán el historial de clases y los paquetes pagados.",
    "Primero revisa las clases futuras y las ofertas pendientes vinculadas a pagos, paquetes o facturas. No se ha quitado al tutor.",
    "La asignación o las clases han cambiado. Actualiza la ficha del alumno e inténtalo de nuevo."
  ],
  "de": [
    "Diesen Lehrer entfernen und seine künftigen unbezahlten Einzelstunden absagen? Der Unterrichtsverlauf und bezahlte Pakete bleiben erhalten.",
    "Klären Sie zuerst künftige Stunden und offene Angebote mit verknüpften Zahlungen, Paketen oder Rechnungen. Der Lehrer wurde nicht entfernt.",
    "Die Zuordnung oder die Stunden haben sich geändert. Aktualisieren Sie die Schülerkarte und versuchen Sie es erneut."
  ],
  "se": [
    "Ta bort den här läraren och avboka lärarens framtida obetalda privatlektioner? Lektionshistorik och betalda paket sparas.",
    "Hantera först framtida lektioner och väntande erbjudanden kopplade till betalningar, paket eller fakturor. Läraren har inte tagits bort.",
    "Tilldelningen eller lektionerna har ändrats. Uppdatera elevkortet och försök igen."
  ],
  "dk": [
    "Fjern denne underviser og aflys underviserens fremtidige ubetalte enkelttimer? Lektionshistorik og betalte pakker bevares.",
    "Afklar først fremtidige timer og afventende tilbud knyttet til betalinger, pakker eller fakturaer. Underviseren er ikke fjernet.",
    "Tilknytningen eller timerne er ændret. Opdater elevkortet, og prøv igen."
  ],
  "fi": [
    "Poistetaanko tämä opettaja ja perutaanko hänen tulevat maksamattomat yksityistuntinsa? Tuntihistoria ja maksetut paketit säilyvät.",
    "Selvitä ensin tulevat tunnit ja odottavat tarjoukset, joihin liittyy maksuja, paketteja tai laskuja. Opettajaa ei poistettu.",
    "Opettajan määritys tai tunnit ovat muuttuneet. Päivitä oppilaskortti ja yritä uudelleen."
  ],
  "no": [
    "Fjerne denne læreren og avlyse lærerens fremtidige ubetalte enkelttimer? Timehistorikk og betalte pakker beholdes.",
    "Avklar først fremtidige timer og ventende tilbud knyttet til betalinger, pakker eller fakturaer. Læreren er ikke fjernet.",
    "Tildelingen eller timene er endret. Oppdater elevkortet og prøv igjen."
  ],
  "nl": [
    "Deze docent verwijderen en diens toekomstige onbetaalde individuele lessen annuleren? De lesgeschiedenis en betaalde pakketten blijven behouden.",
    "Handel eerst toekomstige lessen en openstaande aanbiedingen af die aan betalingen, pakketten of facturen zijn gekoppeld. De docent is niet verwijderd.",
    "De toewijzing of lessen zijn gewijzigd. Vernieuw de leerlingkaart en probeer het opnieuw."
  ]
};

export const tutorPairingTranslations = Object.fromEntries(
  Object.entries(rows).map(([locale, values]) => [locale,
    Object.fromEntries(keys.map((key, index) => [`compStu.${key}`, values[index]])),
  ]),
) as Record<keyof typeof rows, Record<string, string>>;
