const keys = [
  'viewingCompany', 'choose', 'chooseHint', 'switch', 'current', 'switching',
  'error.failed', 'error.notTutor', 'error.sameCompany', 'error.notLinked',
  'error.mfaRequired', 'error.setupRequired', 'admin.title', 'admin.hint',
  'admin.organization', 'admin.account', 'admin.assign', 'admin.remove',
] as const;

const copy: Record<string, string[]> = {
  en: [
    'Viewing company', 'Choose company', 'Choose the company whose lessons and finances you want to see.',
    'Switch', 'Current company', 'Switching company…',
    'Could not load company access. Please try again.', 'Choose an active tutor account belonging to a company.',
    'Choose an account from a different company.', 'Access to this company is no longer assigned. Contact Tutlio support.',
    'Accounts with two-step verification must sign in separately.', 'Company selection is not available yet. Contact support.',
    'Company access', 'Assign only accounts confirmed to belong to the same person. Companies appear automatically after sign-in.',
    'Other company', 'Tutor account', 'Assign company access', 'Remove access',
  ],
  lt: [
    'Pasirinkta organizacija', 'Pasirinkite organizaciją', 'Pasirinkite, kurios organizacijos pamokas ir finansus norite matyti.',
    'Perjungti', 'Dabartinė organizacija', 'Keičiama organizacija…',
    'Nepavyko įkelti organizacijų. Bandykite dar kartą.', 'Pasirinkite aktyvią organizacijai priklausančią korepetitoriaus paskyrą.',
    'Pasirinkite paskyrą iš kitos organizacijos.', 'Prieiga prie šios organizacijos nebepriskirta. Kreipkitės į Tutlio pagalbą.',
    'Prie paskyrų su dviejų žingsnių patvirtinimu reikia prisijungti atskirai.', 'Organizacijos pasirinkimas dar nepasiekiamas. Kreipkitės į pagalbą.',
    'Prieiga prie organizacijų', 'Priskirkite tik patvirtintai tam pačiam žmogui priklausančias paskyras. Organizacijos matomos automatiškai prisijungus.',
    'Kita organizacija', 'Korepetitoriaus paskyra', 'Priskirti organizaciją', 'Pašalinti prieigą',
  ],
  pl: [
    'Wybrana organizacja', 'Wybierz organizację', 'Wybierz organizację, której lekcje i finanse chcesz zobaczyć.',
    'Przełącz', 'Bieżąca organizacja', 'Przełączanie organizacji…',
    'Nie udało się wczytać organizacji. Spróbuj ponownie.', 'Wybierz aktywne konto korepetytora należące do organizacji.',
    'Wybierz konto z innej organizacji.', 'Dostęp do tej organizacji nie jest już przypisany. Skontaktuj się z pomocą Tutlio.',
    'Konta z weryfikacją dwuetapową wymagają osobnego logowania.', 'Wybór organizacji nie jest jeszcze dostępny. Skontaktuj się z pomocą.',
    'Dostęp do organizacji', 'Przypisuj wyłącznie konta potwierdzone jako należące do tej samej osoby. Organizacje pojawią się automatycznie po zalogowaniu.',
    'Inna organizacja', 'Konto korepetytora', 'Przypisz organizację', 'Usuń dostęp',
  ],
  lv: [
    'Izvēlētā organizācija', 'Izvēlieties organizāciju', 'Izvēlieties organizāciju, kuras nodarbības un finanses vēlaties skatīt.',
    'Pārslēgt', 'Pašreizējā organizācija', 'Organizācija tiek mainīta…',
    'Neizdevās ielādēt organizācijas. Mēģiniet vēlreiz.', 'Izvēlieties aktīvu organizācijai piederošu pasniedzēja kontu.',
    'Izvēlieties kontu no citas organizācijas.', 'Piekļuve šai organizācijai vairs nav piešķirta. Sazinieties ar Tutlio atbalstu.',
    'Kontos ar divpakāpju verifikāciju jāpiesakās atsevišķi.', 'Organizācijas izvēle vēl nav pieejama. Sazinieties ar atbalstu.',
    'Piekļuve organizācijām', 'Piešķiriet tikai kontus, kuru piederība vienai personai ir apstiprināta. Organizācijas parādās automātiski pēc pieteikšanās.',
    'Cita organizācija', 'Pasniedzēja konts', 'Piešķirt organizāciju', 'Noņemt piekļuvi',
  ],
  ee: [
    'Valitud organisatsioon', 'Vali organisatsioon', 'Vali organisatsioon, mille tunde ja rahaasju soovid vaadata.',
    'Vaheta', 'Praegune organisatsioon', 'Organisatsiooni vahetamine…',
    'Organisatsioone ei saanud laadida. Proovi uuesti.', 'Vali organisatsiooni kuuluv aktiivne juhendaja konto.',
    'Vali teise organisatsiooni konto.', 'Selle organisatsiooni ligipääs pole enam määratud. Võta ühendust Tutlio toega.',
    'Kaheastmelise kinnitusega kontodesse tuleb eraldi sisse logida.', 'Organisatsiooni valik pole veel saadaval. Võta ühendust toega.',
    'Ligipääs organisatsioonidele', 'Määra ainult kontod, mis kuuluvad kinnitatult samale inimesele. Organisatsioonid kuvatakse pärast sisselogimist automaatselt.',
    'Teine organisatsioon', 'Juhendaja konto', 'Määra organisatsioon', 'Eemalda ligipääs',
  ],
  fr: [
    'Organisation sélectionnée', 'Choisir une organisation', 'Choisissez l’organisation dont vous souhaitez voir les cours et les finances.',
    'Changer', 'Organisation actuelle', 'Changement d’organisation…',
    'Impossible de charger les organisations. Réessayez.', 'Choisissez un compte enseignant actif appartenant à une organisation.',
    'Choisissez un compte d’une autre organisation.', 'L’accès à cette organisation n’est plus attribué. Contactez l’assistance Tutlio.',
    'Les comptes avec vérification en deux étapes doivent se connecter séparément.', 'Le choix de l’organisation n’est pas encore disponible. Contactez l’assistance.',
    'Accès aux organisations', 'Attribuez uniquement des comptes confirmés comme appartenant à la même personne. Les organisations apparaissent automatiquement après la connexion.',
    'Autre organisation', 'Compte enseignant', 'Attribuer une organisation', 'Retirer l’accès',
  ],
  es: [
    'Organización seleccionada', 'Elegir organización', 'Elige la organización cuyas clases y finanzas quieres ver.',
    'Cambiar', 'Organización actual', 'Cambiando de organización…',
    'No se pudieron cargar las organizaciones. Inténtalo de nuevo.', 'Elige una cuenta de profesor activa que pertenezca a una organización.',
    'Elige una cuenta de otra organización.', 'Ya no tienes acceso asignado a esta organización. Contacta con el soporte de Tutlio.',
    'Las cuentas con verificación en dos pasos deben iniciar sesión por separado.', 'La selección de organización aún no está disponible. Contacta con soporte.',
    'Acceso a organizaciones', 'Asigna solo cuentas que se haya confirmado que pertenecen a la misma persona. Las organizaciones aparecen automáticamente al iniciar sesión.',
    'Otra organización', 'Cuenta de profesor', 'Asignar organización', 'Quitar acceso',
  ],
  de: [
    'Ausgewählte Organisation', 'Organisation auswählen', 'Wähle die Organisation, deren Unterricht und Finanzen du sehen möchtest.',
    'Wechseln', 'Aktuelle Organisation', 'Organisation wird gewechselt…',
    'Die Organisationen konnten nicht geladen werden. Versuche es erneut.', 'Wähle ein aktives Lehrkraftkonto, das zu einer Organisation gehört.',
    'Wähle ein Konto einer anderen Organisation.', 'Der Zugriff auf diese Organisation ist nicht mehr zugewiesen. Kontaktiere den Tutlio-Support.',
    'Konten mit zweistufiger Verifizierung müssen sich separat anmelden.', 'Die Organisationsauswahl ist noch nicht verfügbar. Kontaktiere den Support.',
    'Organisationszugriff', 'Weise nur Konten zu, die nachweislich derselben Person gehören. Die Organisationen erscheinen nach der Anmeldung automatisch.',
    'Andere Organisation', 'Lehrkraftkonto', 'Organisation zuweisen', 'Zugriff entfernen',
  ],
  se: [
    'Vald organisation', 'Välj organisation', 'Välj organisationen vars lektioner och ekonomi du vill se.',
    'Byt', 'Aktuell organisation', 'Byter organisation…',
    'Det gick inte att läsa in organisationerna. Försök igen.', 'Välj ett aktivt lärarkonto som tillhör en organisation.',
    'Välj ett konto från en annan organisation.', 'Åtkomst till den här organisationen är inte längre tilldelad. Kontakta Tutlios support.',
    'Konton med tvåstegsverifiering måste logga in separat.', 'Organisationsval är inte tillgängligt än. Kontakta supporten.',
    'Organisationsåtkomst', 'Tilldela bara konton som bekräftats tillhöra samma person. Organisationerna visas automatiskt efter inloggning.',
    'Annan organisation', 'Lärarkonto', 'Tilldela organisation', 'Ta bort åtkomst',
  ],
  dk: [
    'Valgt organisation', 'Vælg organisation', 'Vælg den organisation, hvis lektioner og økonomi du vil se.',
    'Skift', 'Aktuel organisation', 'Skifter organisation…',
    'Organisationerne kunne ikke indlæses. Prøv igen.', 'Vælg en aktiv underviserkonto, der tilhører en organisation.',
    'Vælg en konto fra en anden organisation.', 'Adgang til denne organisation er ikke længere tildelt. Kontakt Tutlios support.',
    'Konti med totrinsbekræftelse skal logge ind separat.', 'Organisationsvalg er endnu ikke tilgængeligt. Kontakt support.',
    'Adgang til organisationer', 'Tildel kun konti, der er bekræftet at tilhøre den samme person. Organisationerne vises automatisk efter login.',
    'Anden organisation', 'Underviserkonto', 'Tildel organisation', 'Fjern adgang',
  ],
  fi: [
    'Valittu organisaatio', 'Valitse organisaatio', 'Valitse organisaatio, jonka oppitunteja ja taloustietoja haluat katsella.',
    'Vaihda', 'Nykyinen organisaatio', 'Vaihdetaan organisaatiota…',
    'Organisaatioita ei voitu ladata. Yritä uudelleen.', 'Valitse aktiivinen organisaatioon kuuluva opettajatili.',
    'Valitse toisen organisaation tili.', 'Tämän organisaation käyttöoikeutta ei ole enää määritetty. Ota yhteyttä Tutlion tukeen.',
    'Kaksivaiheista vahvistusta käyttävillä tileillä on kirjauduttava erikseen.', 'Organisaation valinta ei ole vielä käytettävissä. Ota yhteyttä tukeen.',
    'Organisaatioiden käyttöoikeudet', 'Määritä vain tilit, joiden on vahvistettu kuuluvan samalle henkilölle. Organisaatiot näkyvät automaattisesti kirjautumisen jälkeen.',
    'Toinen organisaatio', 'Opettajatili', 'Määritä organisaatio', 'Poista käyttöoikeus',
  ],
  no: [
    'Valgt organisasjon', 'Velg organisasjon', 'Velg organisasjonen du vil se timer og økonomi for.',
    'Bytt', 'Gjeldende organisasjon', 'Bytter organisasjon…',
    'Kunne ikke laste organisasjonene. Prøv igjen.', 'Velg en aktiv lærerkonto som tilhører en organisasjon.',
    'Velg en konto fra en annen organisasjon.', 'Tilgang til denne organisasjonen er ikke lenger tildelt. Kontakt Tutlios brukerstøtte.',
    'Kontoer med totrinnsbekreftelse må logge inn separat.', 'Organisasjonsvalg er ikke tilgjengelig ennå. Kontakt brukerstøtte.',
    'Organisasjonstilgang', 'Tildel bare kontoer som er bekreftet å tilhøre samme person. Organisasjonene vises automatisk etter innlogging.',
    'Annen organisasjon', 'Lærerkonto', 'Tildel organisasjon', 'Fjern tilgang',
  ],
  nl: [
    'Geselecteerde organisatie', 'Organisatie kiezen', 'Kies de organisatie waarvan je de lessen en financiën wilt zien.',
    'Wisselen', 'Huidige organisatie', 'Organisatie wisselen…',
    'De organisaties konden niet worden geladen. Probeer het opnieuw.', 'Kies een actief docentaccount dat bij een organisatie hoort.',
    'Kies een account van een andere organisatie.', 'Toegang tot deze organisatie is niet meer toegewezen. Neem contact op met Tutlio-ondersteuning.',
    'Accounts met tweestapsverificatie moeten afzonderlijk inloggen.', 'Organisatiekeuze is nog niet beschikbaar. Neem contact op met ondersteuning.',
    'Organisatietoegang', 'Wijs alleen accounts toe waarvan is bevestigd dat ze van dezelfde persoon zijn. Organisaties verschijnen automatisch na het aanmelden.',
    'Andere organisatie', 'Docentaccount', 'Organisatie toewijzen', 'Toegang verwijderen',
  ],
};

const paySummaryNotes: Record<string, string> = {
  en: 'Pay follows this company’s rates and lesson records, including applicable adjustments. Payments are managed by the company.',
  lt: 'Atlygis skaičiuojamas pagal šios organizacijos įkainius ir pamokų įrašus, įskaitant taikomas korekcijas. Mokėjimus administruoja organizacija.',
  pl: 'Wynagrodzenie jest obliczane według stawek tej organizacji i zapisów lekcji, z uwzględnieniem obowiązujących korekt. Płatnościami zarządza organizacja.',
  lv: 'Atlīdzību aprēķina pēc šīs organizācijas likmēm un nodarbību ierakstiem, ieskaitot piemērojamās korekcijas. Maksājumus pārvalda organizācija.',
  ee: 'Tasu arvutatakse selle organisatsiooni määrade ja tunniandmete järgi, sealhulgas kohaldatavad parandused. Makseid haldab organisatsioon.',
  fr: 'La rémunération suit les tarifs de cette organisation et les cours enregistrés, avec les ajustements applicables. Les paiements sont gérés par l’organisation.',
  es: 'La remuneración se calcula según las tarifas de esta organización y los registros de clases, incluidos los ajustes aplicables. La organización gestiona los pagos.',
  de: 'Die Vergütung richtet sich nach den Sätzen dieser Organisation und den Unterrichtsdaten einschließlich geltender Anpassungen. Die Organisation verwaltet die Zahlungen.',
  fi: 'Palkkio lasketaan tämän organisaation hintojen ja tuntitietojen mukaan, mukaan lukien sovellettavat oikaisut. Organisaatio hallinnoi maksuja.',
  no: 'Godtgjørelsen beregnes etter denne organisasjonens satser og registrerte timer, inkludert aktuelle justeringer. Organisasjonen håndterer betalingene.',
  dk: 'Vederlaget beregnes efter denne organisations satser og registrerede lektioner, inklusive relevante justeringer. Organisationen administrerer betalingerne.',
  se: 'Ersättningen beräknas utifrån denna organisations priser och registrerade lektioner, inklusive tillämpliga justeringar. Organisationen hanterar betalningarna.',
  nl: 'De vergoeding volgt de tarieven van deze organisatie en de lesgegevens, inclusief toepasselijke correcties. De organisatie beheert de betalingen.',
};

export const tutorEnvironmentTranslations: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(copy).map(([locale, values]) => {
    if (values.length !== keys.length) throw new Error(`Incomplete tutor environment translations: ${locale}`);
    const dict = Object.fromEntries(keys.map((key, index) => [`tutorEnv.${key}`, values[index]]));
    dict['tutorEnv.error.unauthorized'] = dict['tutorEnv.error.failed'];
    dict['tutorEnv.error.sameAccount'] = dict['tutorEnv.error.sameCompany'];
    dict['orgFinance.companyPaySummaryNote'] = paySummaryNotes[locale];
    return [locale, dict];
  }),
);
