/** Coverage locales for catalog vs assigned subjects, trial count, and sibling parent accounts. */
const keys = {
  lt: {
    'compTut.orgCatalogTitle': 'Organizacijos katalogas',
    'compTut.orgCatalogHint':
      'Tai mokyklos programų sąrašas, ne šio žmogaus dalykai. Chemija kataloge nereiškia, kad šis korepetitorius ją moko. Spauskite „Priskirti“, kad dalykas atsirastų tik pas jį.',
    'compTut.assignToTutor': 'Priskirti',
    'compTut.assignedSubjectsEmpty': 'Šiam žmogui dar nepriskirtas nė vienas dalykas. Priskirkite iš katalogo arba pridėkite ranka.',
    'compSet.trialLessonsPerStudent': 'Kiek bandomųjų pamokų mokiniui',
    'compSet.trialLessonsPerStudentDesc': 'Pvz. 2 — mokinys gali turėti dvi bandomąsias, kol pradedamos įprastos pamokos.',
    'compSet.trialCommentAfterNth': 'Komentarą prašyti po kelintos bandomosios',
    'compSet.trialCommentAfterNthDesc': '1 = po pirmos, 2 = tik po antros (pirmoji be priminimo).',
    'parent.childrenTwoAccountsHint':
      'Kiekvienas vaikas yra atskira mokinio kortelė. Tėvų paskyroje matote visus vaikus (galite pridėti 3–4 ir daugiau). Jei vaikas pats jungsis į mokinio portalą, įrašykite jo el. paštą ir išsiųskite kvietimą – tai bus atskiras prisijungimas, ne tas pats kaip jūsų.',
    'parent.dashboardAddSecondChild': 'Turite daugiau vaikų? Kiekvieną vaiką pridėkite atskirai nustatymuose.',
    'parent.noChildrenAddCta': 'Pridėti vaiką nustatymuose',
    'parent.viewingChild': 'Kurio vaiko sąsają matote',
    'parent.hideAddChildPrompt': 'Neberodyti',
    'parent.addChildNameOnlyHint':
      'Užtenka vardo. Mokinio prisijungimą galėsite suteikti vėliau, prie vaiko.',
    'parent.childrenListIntro':
      'Kiekvienas vaikas – atskira kortelė. Pamokas ir sąskaitas valdote jūs. Mokinio prisijungimas reikalingas tik jei vaikas pats nori jungtis.',
    'parent.unnamedChild': 'Vaikas be vardo',
    'parent.childManagedByYou': 'Vaikas neturi savo prisijungimo',
    'parent.childHasLogin': 'Turi savo prisijungimą',
    'parent.inviteChildOpen': 'Išsiųsti kvietimą į mokinio portalą',
    'parent.inviteChildOpenHint':
      'Tik jei vaikas pats nori jungtis prie pamokų. Sąskaitos vis tiek ateis jums.',
    'parent.inviteChildEmail': 'Vaiko el. paštas',
    'parent.inviteChildEmailPlaceholder': 'vaikas@pavyzdys.lt',
    'parent.inviteChildHint': 'Kvietimas atidaro mokinio portalą. Sąskaitos vis tiek ateis jums.',
    'parent.removeChildLink': 'Pašalinti vaiką',
    'compSch.autoTrialHint':
      'Automatiškai pažymėta kaip bandomoji, nes mokinys dar neišnaudojo visų bandomųjų. Pavadinimą, trukmę ir kainą galite pakeisti.',
    'cal.trialCommentOptionalHint': 'Šios bandomosios komentaras neprivalomas. Organizacija prašo parašyti po paskutinės bandomosios.',
    'cal.trialCommentRequiredHint': 'Po šios bandomosios reikia parašyti komentarą.',
    'cal.tutorTrialToggleHint': 'Pažymėkite patys, jei tai bandomoji. Galite sukurti dvi bandomąsias; komentarą prašome po antros.',
    'compSet.subjectCatalogNote':
      'Šablonai be korepetitoriaus yra tik katalogas. Jie nepriklauso visiems mokytojams, kol nepriskiriate žmogui.',
    'compSet.trialCommentRequiredHelp': 'Priminti korepetitoriui parašyti komentarą nuo nurodytos bandomosios (žemiau).',
  },
  en: {
    'compTut.orgCatalogTitle': 'Organization catalog',
    'compTut.orgCatalogHint':
      'This is the school’s subject list, not this person’s subjects. Chemistry in the catalog does not mean this tutor teaches it. Tap Assign to add it only to them.',
    'compTut.assignToTutor': 'Assign',
    'compTut.assignedSubjectsEmpty': 'No subjects assigned to this person yet. Assign from the catalog or add one manually.',
    'compSet.trialLessonsPerStudent': 'Trial lessons per student',
    'compSet.trialLessonsPerStudentDesc': 'Example: 2 means the student can have two trials before regular lessons begin.',
    'compSet.trialCommentAfterNth': 'Ask for a comment after which trial',
    'compSet.trialCommentAfterNthDesc': '1 = after the first, 2 = only after the second (no reminder on the first).',
    'parent.childrenTwoAccountsHint':
      'Each child is a separate student profile. You see all of them in the parent account (you can add 3–4 or more). If a child should log in to the student portal, enter their email and send an invite — that login is separate from yours.',
    'parent.dashboardAddSecondChild': 'Have more children? Add each child separately in settings.',
    'parent.noChildrenAddCta': 'Add a child in settings',
    'parent.viewingChild': 'Whose view you are seeing',
    'parent.hideAddChildPrompt': "Don't show again",
    'parent.addChildNameOnlyHint':
      'A name is enough. You can give the child a student login later on their card.',
    'parent.childrenListIntro':
      'Each child is a separate card. You manage lessons and invoices. A student login is only needed if the child will sign in themselves.',
    'parent.unnamedChild': 'Child without a name',
    'parent.childManagedByYou': 'This child has no student login',
    'parent.childHasLogin': 'Has their own login',
    'parent.inviteChildOpen': 'Send an invite to the student portal',
    'parent.inviteChildOpenHint':
      'Only if the child should log in themselves. Invoices still come to you.',
    'parent.inviteChildEmail': 'Child email',
    'parent.inviteChildEmailPlaceholder': 'child@example.com',
    'parent.inviteChildHint': 'The invite opens the student portal. Invoices still come to you.',
    'parent.removeChildLink': 'Remove child',
    'compSch.autoTrialHint':
      'Automatically marked as a trial because this student still has trial lessons remaining. You can change the topic, duration and price.',
    'cal.trialCommentOptionalHint': 'A comment is optional on this trial. The organization asks for one after the last trial.',
    'cal.trialCommentRequiredHint': 'Please write a comment after this trial.',
    'cal.tutorTrialToggleHint': 'Mark this yourself if it is a trial. You can create two trials; a comment is asked after the second.',
    'compSet.subjectCatalogNote':
      'Templates with no tutor are a catalog only. They are not everyone’s subjects until you assign them to a person.',
    'compSet.trialCommentRequiredHelp': 'Remind the tutor to write a comment from the trial number chosen below.',
  },
  pl: {
    'compTut.orgCatalogTitle': 'Katalog organizacji',
    'compTut.orgCatalogHint':
      'To lista przedmiotów szkoły, a nie przedmioty tej osoby. Chemia w katalogu nie oznacza, że ten korepetytor ją prowadzi. Kliknij „Przypisz”, aby dodać przedmiot tylko tej osobie.',
    'compTut.assignToTutor': 'Przypisz',
    'compTut.assignedSubjectsEmpty': 'Ta osoba nie ma jeszcze przedmiotów. Przypisz z katalogu albo dodaj ręcznie.',
    'compSet.trialLessonsPerStudent': 'Ile lekcji próbnych na ucznia',
    'compSet.trialLessonsPerStudentDesc': 'Np. 2 — uczeń może mieć dwie lekcje próbne, zanim zaczną się zwykłe.',
    'compSet.trialCommentAfterNth': 'Komentarz po której lekcji próbnej',
    'compSet.trialCommentAfterNthDesc': '1 = po pierwszej, 2 = dopiero po drugiej (pierwsza bez przypomnienia).',
    'parent.childrenTwoAccountsHint':
      'Każde dziecko to osobna karta ucznia. Na koncie rodzica widzisz oboje. Jeśli dziecko ma logować się do portalu ucznia, wpisz jego e-mail i wyślij zaproszenie — to osobne logowanie, nie Twoje.',
    'parent.dashboardAddSecondChild': 'Masz więcej dzieci? Dodaj każde dziecko osobno w ustawieniach.',
    'parent.noChildrenAddCta': 'Dodaj dziecko w ustawieniach',
    'parent.viewingChild': 'Którego dziecka widok oglądasz',
    'parent.hideAddChildPrompt': 'Nie pokazuj więcej',
    'parent.addChildNameOnlyHint':
      'Wystarczy imię. Logowanie ucznia dodasz później na karcie dziecka.',
    'parent.childrenListIntro':
      'Każde dziecko to osobna karta. Ty zarządzasz lekcjami i fakturami. Logowanie ucznia jest potrzebne tylko gdy dziecko samo się loguje.',
    'parent.unnamedChild': 'Dziecko bez imienia',
    'parent.childManagedByYou': 'Zarządzasz ty',
    'parent.childHasLogin': 'Ma własne logowanie',
    'parent.inviteChildOpen': 'Wyślij zaproszenie do portalu ucznia',
    'parent.inviteChildOpenHint':
      'Tylko jeśli dziecko samo ma się logować. Faktury nadal przychodzą do ciebie.',
    'parent.inviteChildEmail': 'E-mail dziecka',
    'parent.inviteChildEmailPlaceholder': 'dziecko@przyklad.pl',
    'parent.inviteChildHint': 'Zaproszenie otwiera portal ucznia. Faktury nadal przychodzą do ciebie.',
    'parent.removeChildLink': 'Usuń dziecko',
    'compSch.autoTrialHint':
      'Oznaczono automatycznie jako lekcję próbną, bo uczeń ma jeszcze niewykorzystane lekcje próbne. Temat, czas i cenę możesz zmienić.',
    'cal.trialCommentOptionalHint': 'Komentarz do tej lekcji próbnej jest opcjonalny. Organizacja prosi o niego po ostatniej próbnej.',
    'cal.trialCommentRequiredHint': 'Po tej lekcji próbnej trzeba napisać komentarz.',
    'cal.tutorTrialToggleHint': 'Zaznacz samodzielnie, jeśli to lekcja próbna. Możesz utworzyć dwie; komentarz po drugiej.',
    'compSet.subjectCatalogNote':
      'Szablony bez korepetytora to tylko katalog. Nie należą do wszystkich, dopóki nie przypiszesz ich konkretnej osobie.',
    'compSet.trialCommentRequiredHelp': 'Przypomnij korepetytorowi o komentarzu od wybranej poniżej lekcji próbnej.',
  },
  lv: {
    'compTut.orgCatalogTitle': 'Organizācijas katalogs',
    'compTut.orgCatalogHint':
      'Šis ir skolas priekšmetu saraksts, nevis šīs personas priekšmeti. Ķīmija katalogā nenozīmē, ka šis pasniedzējs to māca. Nospiediet „Piešķirt”, lai priekšmets parādītos tikai viņam.',
    'compTut.assignToTutor': 'Piešķirt',
    'compTut.assignedSubjectsEmpty': 'Šai personai vēl nav piešķirts neviens priekšmets. Piešķiriet no kataloga vai pievienojiet paši.',
    'compSet.trialLessonsPerStudent': 'Izmēģinājuma nodarbības vienam skolēnam',
    'compSet.trialLessonsPerStudentDesc': 'Piemēram, 2 — skolēns var saņemt divas izmēģinājuma nodarbības, pirms sākas parastās.',
    'compSet.trialCommentAfterNth': 'Komentāru prasīt pēc kuras izmēģinājuma nodarbības',
    'compSet.trialCommentAfterNthDesc': '1 = pēc pirmās, 2 = tikai pēc otrās (pēc pirmās atgādinājuma nav).',
    'parent.childrenTwoAccountsHint':
      'Katrs bērns ir atsevišķa skolēna karte. Vecāku kontā redzat abus. Ja bērns pats pieslēgsies skolēna portālam, ievadiet viņa e-pastu un nosūtiet uzaicinājumu — tas ir atsevišķs pieslēgums, nevis jūsējais.',
    'parent.dashboardAddSecondChild': 'Vairāk bērnu? Katru bērnu pievienojiet atsevišķi iestatījumos.',
    'parent.noChildrenAddCta': 'Pievienot bērnu iestatījumos',
    'parent.viewingChild': 'Kura bērna skatu redzat',
    'parent.hideAddChildPrompt': 'Vairs nerādīt',
    'parent.addChildNameOnlyHint':
      'Pietiek ar vārdu. Skolēna pieslēgumu varēsiet piešķirt vēlāk pie bērna kartītes.',
    'parent.childrenListIntro':
      'Katrs bērns ir atsevišķa kartīte. Nodarbības un rēķinus pārvaldāt jūs. Skolēna pieslēgums vajadzīgs tikai tad, ja bērns pats pieslēgsies.',
    'parent.unnamedChild': 'Bērns bez vārda',
    'parent.childManagedByYou': 'Pārvaldāt jūs',
    'parent.childHasLogin': 'Ir savs pieslēgums',
    'parent.inviteChildOpen': 'Nosūtīt uzaicinājumu uz skolēna portālu',
    'parent.inviteChildOpenHint':
      'Tikai tad, ja bērns pats pieslēgsies. Rēķini joprojām nāks jums.',
    'parent.inviteChildEmail': 'Bērna e-pasts',
    'parent.inviteChildEmailPlaceholder': 'berns@piemers.lv',
    'parent.inviteChildHint': 'Uzaicinājums atver skolēna portālu. Rēķini joprojām nāks jums.',
    'parent.removeChildLink': 'Noņemt bērnu',
    'compSch.autoTrialHint':
      'Automātiski atzīmēta kā izmēģinājuma nodarbība, jo skolēnam vēl ir neizmantotas izmēģinājuma nodarbības. Tēmu, ilgumu un cenu var mainīt.',
    'cal.trialCommentOptionalHint': 'Šīs izmēģinājuma nodarbības komentārs nav obligāts. Organizācija to lūdz pēc pēdējās izmēģinājuma nodarbības.',
    'cal.trialCommentRequiredHint': 'Pēc šīs izmēģinājuma nodarbības jāuzraksta komentārs.',
    'cal.tutorTrialToggleHint': 'Atzīmējiet paši, ja tā ir izmēģinājuma nodarbība. Varat izveidot divas; komentāru lūdzam pēc otrās.',
    'compSet.subjectCatalogNote':
      'Veidnes bez pasniedzēja ir tikai katalogs. Tās nepieder visiem, kamēr nav piešķirtas konkrētai personai.',
    'compSet.trialCommentRequiredHelp': 'Atgādināt pasniedzējam uzrakstīt komentāru no zemāk izvēlētās izmēģinājuma nodarbības.',
  },
  ee: {
    'compTut.orgCatalogTitle': 'Organisatsiooni kataloog',
    'compTut.orgCatalogHint':
      'See on kooli ainete nimekiri, mitte selle inimese ained. Keemia kataloogis ei tähenda, et see õpetaja seda annab. Vajuta „Määra“, et aine ilmuks ainult temale.',
    'compTut.assignToTutor': 'Määra',
    'compTut.assignedSubjectsEmpty': 'Sellele inimesele pole veel aineid määratud. Määra kataloogist või lisa käsitsi.',
    'compSet.trialLessonsPerStudent': 'Proovitundide arv õpilase kohta',
    'compSet.trialLessonsPerStudentDesc': 'Nt 2 — õpilasel võib olla kaks proovitundi enne tavalisi tunde.',
    'compSet.trialCommentAfterNth': 'Kommentaari küsida mitmenda proovitunni järel',
    'compSet.trialCommentAfterNthDesc': '1 = pärast esimest, 2 = alles pärast teist (esimesel meeldetuletust pole).',
    'parent.childrenTwoAccountsHint':
      'Iga laps on eraldi õpilase kaart. Lapsevanema kontol näete mõlemat. Kui laps logib ise õpilase portaali, sisestage tema e-post ja saatke kutse — see on eraldi sisselogimine, mitte teie oma.',
    'parent.dashboardAddSecondChild': 'Veel lapsi? Lisage iga laps eraldi seadetes.',
    'parent.noChildrenAddCta': 'Lisa laps seadetes',
    'parent.viewingChild': 'Kelle lapse vaadet näete',
    'parent.hideAddChildPrompt': 'Ära enam näita',
    'parent.addChildNameOnlyHint':
      'Piisab nimest. Õpilase sisselogimise saate anda hiljem lapse kaardil.',
    'parent.childrenListIntro':
      'Iga laps on eraldi kaart. Tunde ja arveid haldad sina. Õpilase sisselogimist vaja ainult siis, kui laps ise sisse logib.',
    'parent.unnamedChild': 'Nimeta laps',
    'parent.childManagedByYou': 'Sina haldad',
    'parent.childHasLogin': 'Tal on oma sisselogimine',
    'parent.inviteChildOpen': 'Saada kutse õpilase portaali',
    'parent.inviteChildOpenHint':
      'Ainult siis, kui laps logib ise sisse. Arved tulevad endiselt teile.',
    'parent.inviteChildEmail': 'Lapse e-post',
    'parent.inviteChildEmailPlaceholder': 'laps@naide.ee',
    'parent.inviteChildHint': 'Kutse avab õpilase portaali. Arved tulevad endiselt sulle.',
    'parent.removeChildLink': 'Eemalda laps',
    'compSch.autoTrialHint':
      'Märgitud automaatselt proovitunniks, sest õpilasel on proovitunde veel jäänud. Teemat, kestust ja hinda saab muuta.',
    'cal.trialCommentOptionalHint': 'Selle proovitunni kommentaar on vabatahtlik. Organisatsioon palub seda pärast viimast proovitundi.',
    'cal.trialCommentRequiredHint': 'Pärast seda proovitundi tuleb kirjutada kommentaar.',
    'cal.tutorTrialToggleHint': 'Märkige ise, kui see on proovitund. Saate luua kaks; kommentaar palutakse teise järel.',
    'compSet.subjectCatalogNote':
      'Mallid ilma õpetajata on ainult kataloog. Need ei kuulu kõigile, kuni määrate need konkreetsele inimesele.',
    'compSet.trialCommentRequiredHelp': 'Tuleta õpetajale kommentaar meelde alates all valitud proovitunnist.',
  },
  fr: {
    'compTut.orgCatalogTitle': 'Catalogue de l’organisation',
    'compTut.orgCatalogHint':
      'Ceci est la liste des matières de l’école, pas celles de cette personne. La chimie dans le catalogue ne signifie pas que ce tuteur l’enseigne. Cliquez sur Attribuer pour l’ajouter uniquement à lui.',
    'compTut.assignToTutor': 'Attribuer',
    'compTut.assignedSubjectsEmpty': 'Aucune matière attribuée à cette personne. Attribuez-en depuis le catalogue ou ajoutez-en une manuellement.',
    'compSet.trialLessonsPerStudent': 'Cours d’essai par élève',
    'compSet.trialLessonsPerStudentDesc': 'Ex. 2 : l’élève peut avoir deux cours d’essai avant les cours habituels.',
    'compSet.trialCommentAfterNth': 'Demander un commentaire après quel essai',
    'compSet.trialCommentAfterNthDesc': '1 = après le premier, 2 = seulement après le deuxième (pas de rappel au premier).',
    'parent.childrenTwoAccountsHint':
      'Chaque enfant a une fiche élève distincte. Vous les voyez tous les deux dans le compte parent. S’il doit se connecter au portail élève, saisissez son e-mail et envoyez une invitation — ce n’est pas votre identifiant.',
    'parent.dashboardAddSecondChild': 'D’autres enfants ? Ajoutez chaque enfant séparément dans les paramètres.',
    'parent.noChildrenAddCta': 'Ajouter un enfant dans les paramètres',
    'parent.viewingChild': 'L’espace de quel enfant vous voyez',
    'parent.hideAddChildPrompt': 'Ne plus afficher',
    'parent.addChildNameOnlyHint':
      'Le prénom suffit. Vous pourrez donner un accès élève plus tard sur sa fiche.',
    'parent.childrenListIntro':
      'Chaque enfant a sa fiche. Vous gérez les cours et les factures. Un accès élève n’est utile que si l’enfant se connecte lui-même.',
    'parent.unnamedChild': 'Enfant sans nom',
    'parent.childManagedByYou': 'Géré par vous',
    'parent.childHasLogin': 'A son propre accès',
    'parent.inviteChildOpen': 'Envoyer une invitation au portail élève',
    'parent.inviteChildOpenHint':
      'Uniquement si l’enfant se connecte lui-même. Les factures vous arrivent toujours.',
    'parent.inviteChildEmail': 'E-mail de l’enfant',
    'parent.inviteChildEmailPlaceholder': 'enfant@exemple.fr',
    'parent.inviteChildHint': 'L’invitation ouvre le portail élève. Les factures vous arrivent toujours.',
    'parent.removeChildLink': 'Retirer l’enfant',
    'compSch.autoTrialHint':
      'Marqué automatiquement comme essai car l’élève a encore des cours d’essai. Vous pouvez modifier le thème, la durée et le prix.',
    'cal.trialCommentOptionalHint': 'Le commentaire est facultatif pour cet essai. L’organisation le demande après le dernier essai.',
    'cal.trialCommentRequiredHint': 'Veuillez rédiger un commentaire après cet essai.',
    'cal.tutorTrialToggleHint': 'Cochez vous-même s’il s’agit d’un essai. Vous pouvez en créer deux ; le commentaire est demandé après le second.',
    'compSet.subjectCatalogNote':
      'Les modèles sans tuteur sont un catalogue. Ils n’appartiennent à personne tant que vous ne les attribuez pas.',
    'compSet.trialCommentRequiredHelp': 'Rappeler au tuteur d’écrire un commentaire à partir de l’essai choisi ci-dessous.',
  },
  es: {
    'compTut.orgCatalogTitle': 'Catálogo de la organización',
    'compTut.orgCatalogHint':
      'Esta es la lista de asignaturas del centro, no las de esta persona. Química en el catálogo no significa que este tutor la imparta. Pulsa Asignar para añadirla solo a él o ella.',
    'compTut.assignToTutor': 'Asignar',
    'compTut.assignedSubjectsEmpty': 'Esta persona aún no tiene asignaturas. Asígnelas del catálogo o añada una a mano.',
    'compSet.trialLessonsPerStudent': 'Clases de prueba por alumno',
    'compSet.trialLessonsPerStudentDesc': 'Ej.: 2 — el alumno puede tener dos pruebas antes de las clases normales.',
    'compSet.trialCommentAfterNth': 'Pedir comentario tras qué clase de prueba',
    'compSet.trialCommentAfterNthDesc': '1 = tras la primera, 2 = solo tras la segunda (sin aviso en la primera).',
    'parent.childrenTwoAccountsHint':
      'Cada hijo es una ficha de alumno distinta. En la cuenta de padres ves a ambos. Si el niño entra al portal de alumno, escribe su correo y envía la invitación: ese acceso no es el vuestro.',
    'parent.dashboardAddSecondChild': '¿Más hijos? Añade cada hijo por separado en ajustes.',
    'parent.noChildrenAddCta': 'Añadir un hijo/a en ajustes',
    'parent.viewingChild': 'La vista de qué hijo estás viendo',
    'parent.hideAddChildPrompt': 'No volver a mostrar',
    'parent.addChildNameOnlyHint':
      'Basta el nombre. El acceso de alumno lo puedes dar después en su ficha.',
    'parent.childrenListIntro':
      'Cada hijo es una ficha aparte. Tú gestionas clases y facturas. El acceso de alumno solo hace falta si el hijo entra por su cuenta.',
    'parent.unnamedChild': 'Hijo sin nombre',
    'parent.childManagedByYou': 'Lo gestionas tú',
    'parent.childHasLogin': 'Tiene su propio acceso',
    'parent.inviteChildOpen': 'Enviar invitación al portal del alumno',
    'parent.inviteChildOpenHint':
      'Solo si el hijo entra por su cuenta. Las facturas siguen llegándote a ti.',
    'parent.inviteChildEmail': 'Correo del hijo',
    'parent.inviteChildEmailPlaceholder': 'hijo@ejemplo.es',
    'parent.inviteChildHint': 'La invitación abre el portal del alumno. Las facturas siguen llegándote a ti.',
    'parent.removeChildLink': 'Quitar hijo',
    'compSch.autoTrialHint':
      'Marcada automáticamente como clase de prueba porque al alumno aún le quedan pruebas. Puede cambiar tema, duración y precio.',
    'cal.trialCommentOptionalHint': 'El comentario es opcional en esta prueba. El centro lo pide después de la última.',
    'cal.trialCommentRequiredHint': 'Escriba un comentario después de esta clase de prueba.',
    'cal.tutorTrialToggleHint': 'Márcalo tú si es una clase de prueba. Puedes crear dos; el comentario se pide tras la segunda.',
    'compSet.subjectCatalogNote':
      'Las plantillas sin tutor son solo un catálogo. No son de todos hasta que las asigne a una persona.',
    'compSet.trialCommentRequiredHelp': 'Recordar al tutor el comentario a partir de la prueba indicada abajo.',
  },
  de: {
    'compTut.orgCatalogTitle': 'Organisationskatalog',
    'compTut.orgCatalogHint':
      'Das ist die Fächerliste der Schule, nicht die dieser Person. Chemie im Katalog heißt nicht, dass dieser Lehrer sie unterrichtet. Tippen Sie auf Zuweisen, damit das Fach nur bei ihm erscheint.',
    'compTut.assignToTutor': 'Zuweisen',
    'compTut.assignedSubjectsEmpty': 'Dieser Person sind noch keine Fächer zugewiesen. Weisen Sie welche aus dem Katalog zu oder fügen Sie eines manuell hinzu.',
    'compSet.trialLessonsPerStudent': 'Probestunden pro Schüler',
    'compSet.trialLessonsPerStudentDesc': 'z. B. 2 — der Schüler kann zwei Probestunden haben, bevor normale Stunden beginnen.',
    'compSet.trialCommentAfterNth': 'Kommentar nach welcher Probestunde',
    'compSet.trialCommentAfterNthDesc': '1 = nach der ersten, 2 = erst nach der zweiten (keine Erinnerung nach der ersten).',
    'parent.childrenTwoAccountsHint':
      'Jedes Kind ist eine eigene Schülerkarte. Im Elternkonto sehen Sie beide. Soll das Kind sich im Schülerportal anmelden, E-Mail eintragen und Einladung senden — das ist ein separates Login, nicht Ihres.',
    'parent.dashboardAddSecondChild': 'Weitere Kinder? Jedes Kind einzeln in den Einstellungen hinzufügen.',
    'parent.noChildrenAddCta': 'Kind in den Einstellungen hinzufügen',
    'parent.viewingChild': 'Wessen Kindersicht Sie sehen',
    'parent.hideAddChildPrompt': 'Nicht mehr anzeigen',
    'parent.addChildNameOnlyHint':
      'Der Name reicht. Den Schüler-Login können Sie später auf der Kinderkarte vergeben.',
    'parent.childrenListIntro':
      'Jedes Kind hat eine eigene Karte. Sie verwalten Stunden und Rechnungen. Ein Schüler-Login braucht es nur, wenn das Kind selbst einsteigt.',
    'parent.unnamedChild': 'Kind ohne Namen',
    'parent.childManagedByYou': 'Sie verwalten es',
    'parent.childHasLogin': 'Hat eigenen Login',
    'parent.inviteChildOpen': 'Einladung ins Schülerportal senden',
    'parent.inviteChildOpenHint':
      'Nur wenn das Kind selbst einsteigt. Rechnungen kommen weiter an Sie.',
    'parent.inviteChildEmail': 'E-Mail des Kindes',
    'parent.inviteChildEmailPlaceholder': 'kind@beispiel.de',
    'parent.inviteChildHint': 'Die Einladung öffnet das Schülerportal. Rechnungen kommen weiter an Sie.',
    'parent.removeChildLink': 'Kind entfernen',
    'compSch.autoTrialHint':
      'Automatisch als Probestunde markiert, weil der Schüler noch Probestunden übrig hat. Thema, Dauer und Preis können Sie anpassen.',
    'cal.trialCommentOptionalHint': 'Ein Kommentar ist bei dieser Probestunde optional. Die Organisation bittet danach nach der letzten.',
    'cal.trialCommentRequiredHint': 'Bitte nach dieser Probestunde einen Kommentar schreiben.',
    'cal.tutorTrialToggleHint': 'Markieren Sie selbst, wenn es eine Probestunde ist. Sie können zwei anlegen; der Kommentar folgt nach der zweiten.',
    'compSet.subjectCatalogNote':
      'Vorlagen ohne Lehrkraft sind nur ein Katalog. Sie gehören niemandem, bis Sie sie einer Person zuweisen.',
    'compSet.trialCommentRequiredHelp': 'Den Lehrer ab der unten gewählten Probestunde an den Kommentar erinnern.',
  },
  se: {
    'compTut.orgCatalogTitle': 'Organisationens katalog',
    'compTut.orgCatalogHint':
      'Detta är skolans ämneslista, inte den här personens ämnen. Kemi i katalogen betyder inte att den här läraren undervisar det. Tryck Tilldela för att lägga till det bara hos hen.',
    'compTut.assignToTutor': 'Tilldela',
    'compTut.assignedSubjectsEmpty': 'Inga ämnen tilldelade ännu. Tilldela från katalogen eller lägg till manuellt.',
    'compSet.trialLessonsPerStudent': 'Provlektioner per elev',
    'compSet.trialLessonsPerStudentDesc': 'T.ex. 2 — eleven kan ha två provlektioner innan vanliga lektioner börjar.',
    'compSet.trialCommentAfterNth': 'Be om kommentar efter vilken provlektion',
    'compSet.trialCommentAfterNthDesc': '1 = efter den första, 2 = först efter den andra (ingen påminnelse efter den första).',
    'parent.childrenTwoAccountsHint':
      'Varje barn är en egen elevprofil. I föräldrakontot ser ni båda. Ska barnet logga in i elevportalen, ange hens e-post och skicka inbjudan — det är en separat inloggning, inte er.',
    'parent.dashboardAddSecondChild': 'Fler barn? Lägg till varje barn separat i inställningarna.',
    'parent.noChildrenAddCta': 'Lägg till ett barn i inställningarna',
    'parent.viewingChild': 'Vilket barns vy du ser',
    'parent.hideAddChildPrompt': 'Visa inte igen',
    'parent.addChildNameOnlyHint':
      'Namnet räcker. Elevinloggning kan ni ge senare på barnets kort.',
    'parent.childrenListIntro':
      'Varje barn är ett eget kort. Ni sköter lektioner och fakturor. Elevinloggning behövs bara om barnet loggar in själv.',
    'parent.unnamedChild': 'Barn utan namn',
    'parent.childManagedByYou': 'Ni sköter det',
    'parent.childHasLogin': 'Har egen inloggning',
    'parent.inviteChildOpen': 'Skicka inbjudan till elevportalen',
    'parent.inviteChildOpenHint':
      'Bara om barnet loggar in själv. Fakturor kommer fortfarande till er.',
    'parent.inviteChildEmail': 'Barnets e-post',
    'parent.inviteChildEmailPlaceholder': 'barn@exempel.se',
    'parent.inviteChildHint': 'Inbjudan öppnar elevportalen. Fakturor kommer fortfarande till er.',
    'parent.removeChildLink': 'Ta bort barnet',
    'compSch.autoTrialHint':
      'Markerad automatiskt som provlektion eftersom eleven fortfarande har provlektioner kvar. Ämne, längd och pris kan ändras.',
    'cal.trialCommentOptionalHint': 'Kommentar är valfri på denna provlektion. Organisationen ber om den efter den sista.',
    'cal.trialCommentRequiredHint': 'Skriv en kommentar efter denna provlektion.',
    'cal.tutorTrialToggleHint': 'Markera själv om det är en provlektion. Ni kan skapa två; kommentaren efter den andra.',
    'compSet.subjectCatalogNote':
      'Mallar utan lärare är bara en katalog. De tillhör ingen förrän ni tilldelar dem en person.',
    'compSet.trialCommentRequiredHelp': 'Påminn läraren om kommentaren från den provlektion som anges nedan.',
  },
  dk: {
    'compTut.orgCatalogTitle': 'Organisationens katalog',
    'compTut.orgCatalogHint':
      'Dette er skolens fagliste, ikke denne persons fag. Kemi i kataloget betyder ikke, at denne tutor underviser i det. Tryk Tildel for kun at tilføje det til vedkommende.',
    'compTut.assignToTutor': 'Tildel',
    'compTut.assignedSubjectsEmpty': 'Ingen fag tildelt endnu. Tildel fra kataloget, eller tilføj manuelt.',
    'compSet.trialLessonsPerStudent': 'Prøvelektioner pr. elev',
    'compSet.trialLessonsPerStudentDesc': 'F.eks. 2 — eleven kan have to prøvelektioner, før de almindelige begynder.',
    'compSet.trialCommentAfterNth': 'Bed om kommentar efter hvilken prøvelektion',
    'compSet.trialCommentAfterNthDesc': '1 = efter den første, 2 = først efter den anden (ingen påmindelse efter den første).',
    'parent.childrenTwoAccountsHint':
      'Hvert barn er et separat elevkort. På forældrekontoen ser I begge. Skal barnet logge ind på elevportalen, indtast barnets e-mail og send invitation — det er et andet login end jeres.',
    'parent.dashboardAddSecondChild': 'Flere børn? Tilføj hvert barn separat under indstillinger.',
    'parent.noChildrenAddCta': 'Tilføj et barn under indstillinger',
    'parent.viewingChild': 'Hvilket barns visning du ser',
    'parent.hideAddChildPrompt': 'Vis ikke igen',
    'parent.addChildNameOnlyHint':
      'Navnet er nok. Elevlogin kan I give senere på barnets kort.',
    'parent.childrenListIntro':
      'Hvert barn er et separat kort. I styrer lektioner og fakturaer. Elevlogin er kun nødvendigt, hvis barnet logger ind selv.',
    'parent.unnamedChild': 'Barn uden navn',
    'parent.childManagedByYou': 'I styrer det',
    'parent.childHasLogin': 'Har eget login',
    'parent.inviteChildOpen': 'Send invitation til elevportalen',
    'parent.inviteChildOpenHint':
      'Kun hvis barnet logger ind selv. Fakturaer kommer stadig til jer.',
    'parent.inviteChildEmail': 'Barnets e-mail',
    'parent.inviteChildEmailPlaceholder': 'barn@eksempel.dk',
    'parent.inviteChildHint': 'Invitationen åbner elevportalen. Fakturaer kommer stadig til jer.',
    'parent.removeChildLink': 'Fjern barnet',
    'compSch.autoTrialHint':
      'Markeret automatisk som prøvelektion, fordi eleven stadig har prøvelektioner tilbage. Emne, varighed og pris kan ændres.',
    'cal.trialCommentOptionalHint': 'Kommentar er valgfri til denne prøvelektion. Organisationen beder om den efter den sidste.',
    'cal.trialCommentRequiredHint': 'Skriv en kommentar efter denne prøvelektion.',
    'cal.tutorTrialToggleHint': 'Markér selv, hvis det er en prøvelektion. I kan oprette to; kommentaren efter den anden.',
    'compSet.subjectCatalogNote':
      'Skabeloner uden tutor er kun et katalog. De tilhører ingen, før I tildeler dem til en person.',
    'compSet.trialCommentRequiredHelp': 'Mind tutoren om kommentaren fra den prøvelektion, der er valgt nedenfor.',
  },
  fi: {
    'compTut.orgCatalogTitle': 'Organisaation luettelo',
    'compTut.orgCatalogHint':
      'Tämä on koulun oppiaineluettelo, ei tämän henkilön aineet. Kemia luettelossa ei tarkoita, että tämä tuutori opettaa sitä. Paina Määritä, niin aine tulee vain hänelle.',
    'compTut.assignToTutor': 'Määritä',
    'compTut.assignedSubjectsEmpty': 'Tälle henkilölle ei ole vielä aineita. Määritä luettelosta tai lisää käsin.',
    'compSet.trialLessonsPerStudent': 'Kokeilutunteja oppilasta kohden',
    'compSet.trialLessonsPerStudentDesc': 'Esim. 2 — oppilaalla voi olla kaksi kokeilutuntia ennen tavallisia tunteja.',
    'compSet.trialCommentAfterNth': 'Pyydä kommentti monennen kokeilutunnin jälkeen',
    'compSet.trialCommentAfterNthDesc': '1 = ensimmäisen jälkeen, 2 = vasta toisen jälkeen (ensimmäisestä ei muistutusta).',
    'parent.childrenTwoAccountsHint':
      'Jokainen lapsi on oma oppilaskorttinsa. Vanhemman tilillä näette molemmat. Jos lapsi kirjautuu oppilasportaaliin, syöttäkää hänen sähköpostinsa ja lähettäkää kutsu — se on eri tunnus kuin teidän.',
    'parent.dashboardAddSecondChild': 'Lisää lapsia? Lisää jokainen lapsi erikseen asetuksissa.',
    'parent.noChildrenAddCta': 'Lisää lapsi asetuksissa',
    'parent.viewingChild': 'Kenen lapsen näkymää katsot',
    'parent.hideAddChildPrompt': 'Älä näytä enää',
    'parent.addChildNameOnlyHint':
      'Nimi riittää. Oppilaan kirjautumisen voitte antaa myöhemmin lapsen kortilla.',
    'parent.childrenListIntro':
      'Jokainen lapsi on oma korttinsa. Te hallitsette tunnit ja laskut. Oppilaan kirjautuminen tarvitaan vain, jos lapsi kirjautuu itse.',
    'parent.unnamedChild': 'Nimetön lapsi',
    'parent.childManagedByYou': 'Te hallitsette',
    'parent.childHasLogin': 'Oma kirjautuminen',
    'parent.inviteChildOpen': 'Lähetä kutsu oppilasportaaliin',
    'parent.inviteChildOpenHint':
      'Vain jos lapsi kirjautuu itse. Laskut tulevat silti teille.',
    'parent.inviteChildEmail': 'Lapsen sähköposti',
    'parent.inviteChildEmailPlaceholder': 'lapsi@esimerkki.fi',
    'parent.inviteChildHint': 'Kutsu avaa oppilasportaalin. Laskut tulevat silti teille.',
    'parent.removeChildLink': 'Poista lapsi',
    'compSch.autoTrialHint':
      'Merkitty automaattisesti kokeilutunniksi, koska oppilaalla on kokeilutunteja jäljellä. Aihetta, kestoa ja hintaa voi muuttaa.',
    'cal.trialCommentOptionalHint': 'Kommentti on vapaaehtoinen tällä kokeilutunnilla. Organisaatio pyytää sen viimeisen jälkeen.',
    'cal.trialCommentRequiredHint': 'Kirjoita kommentti tämän kokeilutunnin jälkeen.',
    'cal.tutorTrialToggleHint': 'Merkitse itse, jos tämä on kokeilutunti. Voitte luoda kaksi; kommentti pyydetään toisen jälkeen.',
    'compSet.subjectCatalogNote':
      'Mallit ilman tuutoria ovat vain luettelo. Ne eivät kuulu kaikille, ennen kuin määritätte ne henkilölle.',
    'compSet.trialCommentRequiredHelp': 'Muistuta tuutoria kommentista alla valitusta kokeilutunnista alkaen.',
  },
  no: {
    'compTut.orgCatalogTitle': 'Organisasjonens katalog',
    'compTut.orgCatalogHint':
      'Dette er skolens fagliste, ikke denne personens fag. Kjemi i katalogen betyr ikke at denne privatlæreren underviser i det. Trykk Tildel for å legge det kun til hen.',
    'compTut.assignToTutor': 'Tildel',
    'compTut.assignedSubjectsEmpty': 'Ingen fag tildelt ennå. Tildel fra katalogen eller legg til manuelt.',
    'compSet.trialLessonsPerStudent': 'Prøvetimer per elev',
    'compSet.trialLessonsPerStudentDesc': 'F.eks. 2 — eleven kan ha to prøvetimer før vanlige timer starter.',
    'compSet.trialCommentAfterNth': 'Be om kommentar etter hvilken prøvetime',
    'compSet.trialCommentAfterNthDesc': '1 = etter den første, 2 = først etter den andre (ingen påminnelse etter den første).',
    'parent.childrenTwoAccountsHint':
      'Hvert barn er et eget elevkort. På foreldrekontoen ser dere begge. Skal barnet logge inn i elevportalen, skriv inn e-posten og send invitasjon — det er en annen innlogging enn deres.',
    'parent.dashboardAddSecondChild': 'Flere barn? Legg til hvert barn separat i innstillingene.',
    'parent.noChildrenAddCta': 'Legg til et barn i innstillingene',
    'parent.viewingChild': 'Hvilket barns visning du ser',
    'parent.hideAddChildPrompt': 'Ikke vis igjen',
    'parent.addChildNameOnlyHint':
      'Navnet holder. Elevinnlogging kan dere gi senere på barnets kort.',
    'parent.childrenListIntro':
      'Hvert barn er et eget kort. Dere styrer timer og fakturaer. Elevinnlogging trengs bare hvis barnet logger inn selv.',
    'parent.unnamedChild': 'Barn uten navn',
    'parent.childManagedByYou': 'Dere styrer det',
    'parent.childHasLogin': 'Har egen innlogging',
    'parent.inviteChildOpen': 'Send invitasjon til elevportalen',
    'parent.inviteChildOpenHint':
      'Bare hvis barnet logger inn selv. Fakturaer kommer fortsatt til dere.',
    'parent.inviteChildEmail': 'Barnets e-post',
    'parent.inviteChildEmailPlaceholder': 'barn@eksempel.no',
    'parent.inviteChildHint': 'Invitasjonen åpner elevportalen. Fakturaer kommer fortsatt til dere.',
    'parent.removeChildLink': 'Fjern barnet',
    'compSch.autoTrialHint':
      'Merket automatisk som prøvetime fordi eleven fortsatt har prøvetimer igjen. Emne, varighet og pris kan endres.',
    'cal.trialCommentOptionalHint': 'Kommentar er valgfri på denne prøvetimen. Organisasjonen ber om den etter den siste.',
    'cal.trialCommentRequiredHint': 'Skriv en kommentar etter denne prøvetimen.',
    'cal.tutorTrialToggleHint': 'Merk selv om dette er en prøvetime. Dere kan opprette to; kommentaren etter den andre.',
    'compSet.subjectCatalogNote':
      'Maler uten privatlærer er bare et katalog. De tilhører ingen før dere tildeler dem en person.',
    'compSet.trialCommentRequiredHelp': 'Minn privatlæreren på kommentaren fra prøvetimen valgt nedenfor.',
  },
  nl: {
    'compTut.orgCatalogTitle': 'Catalogus van de organisatie',
    'compTut.orgCatalogHint':
      'Dit is de vakkenlijst van de school, niet van deze persoon. Scheikunde in de catalogus betekent niet dat deze docent dat geeft. Tik op Toewijzen om het alleen bij hen toe te voegen.',
    'compTut.assignToTutor': 'Toewijzen',
    'compTut.assignedSubjectsEmpty': 'Deze persoon heeft nog geen vakken. Wijs toe uit de catalogus of voeg handmatig toe.',
    'compSet.trialLessonsPerStudent': 'Proeflessen per leerling',
    'compSet.trialLessonsPerStudentDesc': 'Bijv. 2 — de leerling kan twee proeflessen hebben voordat gewone lessen beginnen.',
    'compSet.trialCommentAfterNth': 'Om een opmerking vragen na welke proefles',
    'compSet.trialCommentAfterNthDesc': '1 = na de eerste, 2 = pas na de tweede (geen herinnering na de eerste).',
    'parent.childrenTwoAccountsHint':
      'Elk kind is een apart leerlingkaart. In het ouderaccount ziet u beide. Moet het kind inloggen op het leerlingportaal, vul het e-mailadres in en stuur een uitnodiging — dat is een andere login dan die van u.',
    'parent.dashboardAddSecondChild': 'Meer kinderen? Voeg elk kind apart toe in de instellingen.',
    'parent.noChildrenAddCta': 'Voeg een kind toe in de instellingen',
    'parent.viewingChild': 'Van welk kind u de weergave ziet',
    'parent.hideAddChildPrompt': 'Niet meer tonen',
    'parent.addChildNameOnlyHint':
      'De naam is genoeg. Leerling-inlog kunt u later op de kindkaart geven.',
    'parent.childrenListIntro':
      'Elk kind is een aparte kaart. U beheert lessen en facturen. Leerling-inlog is alleen nodig als het kind zelf inlogt.',
    'parent.unnamedChild': 'Kind zonder naam',
    'parent.childManagedByYou': 'U beheert dit',
    'parent.childHasLogin': 'Heeft eigen inlog',
    'parent.inviteChildOpen': 'Stuur een uitnodiging naar het leerlingportaal',
    'parent.inviteChildOpenHint':
      'Alleen als het kind zelf inlogt. Facturen komen nog steeds bij u.',
    'parent.inviteChildEmail': 'E-mail van het kind',
    'parent.inviteChildEmailPlaceholder': 'kind@voorbeeld.nl',
    'parent.inviteChildHint': 'De uitnodiging opent het leerlingportaal. Facturen komen nog steeds bij u.',
    'parent.removeChildLink': 'Kind verwijderen',
    'compSch.autoTrialHint':
      'Automatisch gemarkeerd als proefles omdat de leerling nog proeflessen over heeft. Onderwerp, duur en prijs kunt u aanpassen.',
    'cal.trialCommentOptionalHint': 'Een opmerking is optioneel bij deze proefles. De organisatie vraagt die na de laatste.',
    'cal.trialCommentRequiredHint': 'Schrijf een opmerking na deze proefles.',
    'cal.tutorTrialToggleHint': 'Vink zelf aan als dit een proefles is. U kunt er twee aanmaken; de opmerking na de tweede.',
    'compSet.subjectCatalogNote':
      'Sjablonen zonder docent zijn alleen een catalogus. Ze horen bij niemand tot u ze aan iemand toewijst.',
    'compSet.trialCommentRequiredHelp': 'Herinner de docent aan een opmerking vanaf de hieronder gekozen proefles.',
  },
} as const;

export const familyCatalogTrialCopy = keys;
