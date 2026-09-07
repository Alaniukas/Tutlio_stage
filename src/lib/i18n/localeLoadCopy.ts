import type { Locale } from './locales';

// Small standalone copy keeps recovery usable when a dictionary cannot download.
// The locale-load-copy test enforces parity with dictionaries without importing
// those full dictionaries into the entry bundle.
export const LOCALE_LOAD_COPY: Record<Locale, { loading: string; error: string; retry: string; reload: string; reloadWarning: string }> = {
  "lt": {
    "loading": "Kraunama...",
    "error": "Nepavyko atsisiųsti failo",
    "retry": "Bandyti dar kartą",
    "reload": "Įkelti puslapį iš naujo",
    "reloadWarning": "Įkėlus puslapį iš naujo, neišsaugoti pakeitimai bus prarasti. Tęsti?"
  },
  "en": {
    "loading": "Loading...",
    "error": "Failed to download file",
    "retry": "Retry",
    "reload": "Reload page",
    "reloadWarning": "Reloading will discard unsaved changes. Continue?"
  },
  "pl": {
    "loading": "Ładowanie...",
    "error": "Nie udało się pobrać pliku",
    "retry": "Ponów",
    "reload": "Odśwież stronę",
    "reloadWarning": "Odświeżenie strony spowoduje utratę niezapisanych zmian. Kontynuować?"
  },
  "lv": {
    "loading": "Ielādē...",
    "error": "Neizdevās lejupielādēt failu",
    "retry": "Mēģināt vēlreiz",
    "reload": "Pārlādēt lapu",
    "reloadWarning": "Pārlādējot lapu, nesaglabātās izmaiņas tiks zaudētas. Vai turpināt?"
  },
  "ee": {
    "loading": "Laadimine...",
    "error": "Faili allalaadimine ebaõnnestus",
    "retry": "Proovi uuesti",
    "reload": "Laadi leht uuesti",
    "reloadWarning": "Lehe uuesti laadimisel lähevad salvestamata muudatused kaotsi. Kas jätkata?"
  },
  "fr": {
    "loading": "Chargement…",
    "error": "Échec du téléchargement du fichier",
    "retry": "Réessayer",
    "reload": "Recharger la page",
    "reloadWarning": "Le rechargement entraînera la perte des modifications non enregistrées. Continuer ?"
  },
  "es": {
    "loading": "Cargando…",
    "error": "Error al descargar el archivo",
    "retry": "Reintentar",
    "reload": "Recargar la página",
    "reloadWarning": "Al recargar se perderán los cambios sin guardar. ¿Continuar?"
  },
  "de": {
    "loading": "Wird geladen…",
    "error": "Datei konnte nicht heruntergeladen werden",
    "retry": "Erneut versuchen",
    "reload": "Seite neu laden",
    "reloadWarning": "Beim Neuladen gehen ungespeicherte Änderungen verloren. Fortfahren?"
  },
  "se": {
    "loading": "Laddar...",
    "error": "Kunde inte ladda ner filen",
    "retry": "Försök igen",
    "reload": "Ladda om sidan",
    "reloadWarning": "Om du laddar om sidan går osparade ändringar förlorade. Vill du fortsätta?"
  },
  "dk": {
    "loading": "Indlæser...",
    "error": "Kunne ikke downloade filen",
    "retry": "Prøv igen",
    "reload": "Genindlæs siden",
    "reloadWarning": "Hvis du genindlæser siden, går ændringer, der ikke er gemt, tabt. Vil du fortsætte?"
  },
  "fi": {
    "loading": "Ladataan...",
    "error": "Tiedoston lataaminen epäonnistui",
    "retry": "Yritä uudelleen",
    "reload": "Lataa sivu uudelleen",
    "reloadWarning": "Sivun lataaminen uudelleen poistaa tallentamattomat muutokset. Jatketaanko?"
  },
  "no": {
    "loading": "Laster...",
    "error": "Kunne ikke laste ned filen",
    "retry": "Prøv igjen",
    "reload": "Last siden på nytt",
    "reloadWarning": "Hvis du laster siden på nytt, går ulagrede endringer tapt. Vil du fortsette?"
  },
  "nl": {
    "loading": "Laden...",
    "error": "Kan bestand niet downloaden",
    "retry": "Opnieuw proberen",
    "reload": "Pagina opnieuw laden",
    "reloadWarning": "Als je de pagina opnieuw laadt, gaan niet-opgeslagen wijzigingen verloren. Doorgaan?"
  },
  "th": {
    "loading": "กำลังโหลด...",
    "error": "ดาวน์โหลดไฟล์ไม่สำเร็จ",
    "retry": "ลองอีกครั้ง",
    "reload": "โหลดหน้าใหม่",
    "reloadWarning": "การโหลดหน้าใหม่จะทำให้การเปลี่ยนแปลงที่ยังไม่ได้บันทึกสูญหาย ต้องการดำเนินการต่อหรือไม่?"
  },
  "tr": {
    "loading": "Yükleniyor...",
    "error": "Dosya indirilemedi",
    "retry": "Yeniden dene",
    "reload": "Sayfayı yeniden yükle",
    "reloadWarning": "Yeniden yükleme, kaydedilmemiş değişiklikleri silecektir. Devam edilsin mi?"
  },
  "zh-hk": {
    "loading": "載入中…",
    "error": "未能下載檔案",
    "retry": "重試",
    "reload": "重新載入頁面",
    "reloadWarning": "重新載入會遺失尚未儲存的變更。是否繼續？"
  },
  "it": {
    "loading": "Caricamento in corso...",
    "error": "Impossibile scaricare il file",
    "retry": "Riprova",
    "reload": "Ricarica la pagina",
    "reloadWarning": "Ricaricando la pagina perderai le modifiche non salvate. Continuare?"
  },
  "pt": {
    "loading": "A carregar...",
    "error": "Não foi possível descarregar o ficheiro",
    "retry": "Tentar novamente",
    "reload": "Recarregar a página",
    "reloadWarning": "Ao recarregar a página, perderá as alterações não guardadas. Continuar?"
  },
  "ro": {
    "loading": "Se încarcă...",
    "error": "Nu s-a putut descărca fișierul",
    "retry": "Reîncearcă",
    "reload": "Reîncarcă pagina",
    "reloadWarning": "Reîncărcarea paginii va pierde modificările nesalvate. Continui?"
  },
  "cs": {
    "loading": "Načítá se...",
    "error": "Soubor se nepodařilo stáhnout",
    "retry": "Zkusit znovu",
    "reload": "Znovu načíst stránku",
    "reloadWarning": "Opětovným načtením stránky ztratíte neuložené změny. Pokračovat?"
  },
  "el": {
    "loading": "Φόρτωση...",
    "error": "Δεν ήταν δυνατή η λήψη του αρχείου",
    "retry": "Επανάληψη",
    "reload": "Επαναφόρτωση σελίδας",
    "reloadWarning": "Η επαναφόρτωση θα διαγράψει τις μη αποθηκευμένες αλλαγές. Συνέχεια;"
  },
  "hu": {
    "loading": "Betöltés...",
    "error": "Nem sikerült letölteni a fájlt",
    "retry": "Újrapróbálkozás",
    "reload": "Oldal újratöltése",
    "reloadWarning": "Az újratöltéskor a nem mentett módosítások elvesznek. Folytatja?"
  },
  "bg": {
    "loading": "Зареждане...",
    "error": "Файлът не можа да бъде изтеглен",
    "retry": "Повторен опит",
    "reload": "Презареди страницата",
    "reloadWarning": "При презареждане незапазените промени ще бъдат загубени. Продължавате ли?"
  },
  "hr": {
    "loading": "Učitavanje...",
    "error": "Preuzimanje datoteke nije uspjelo",
    "retry": "Pokušaj ponovno",
    "reload": "Ponovno učitaj stranicu",
    "reloadWarning": "Ponovnim učitavanjem izgubit ćete nespremljene promjene. Nastaviti?"
  },
  "sk": {
    "loading": "Načítava sa...",
    "error": "Súbor sa nepodarilo stiahnuť",
    "retry": "Skúsiť znova",
    "reload": "Znova načítať stránku",
    "reloadWarning": "Opätovným načítaním stránky stratíte neuložené zmeny. Pokračovať?"
  },
  "sl": {
    "loading": "Nalaganje...",
    "error": "Datoteke ni bilo mogoče prenesti",
    "retry": "Ponovi",
    "reload": "Znova naloži stran",
    "reloadWarning": "S ponovnim nalaganjem boste izgubili neshranjene spremembe. Želite nadaljevati?"
  },
  "hi": {
    "loading": "लोड हो रहा है...",
    "error": "फ़ाइल डाउनलोड नहीं की जा सकी",
    "retry": "फिर कोशिश करें",
    "reload": "पेज फिर से लोड करें",
    "reloadWarning": "पेज फिर से लोड करने पर बिना सहेजे बदलाव मिट जाएँगे। जारी रखें?"
  },
  "ko": {
    "loading": "불러오는 중...",
    "error": "파일을 다운로드하지 못했습니다",
    "retry": "다시 시도",
    "reload": "페이지 새로고침",
    "reloadWarning": "새로고침하면 저장하지 않은 변경 사항이 사라집니다. 계속하시겠습니까?"
  },
  "ja": {
    "loading": "読み込み中…",
    "error": "ファイルをダウンロードできませんでした",
    "retry": "再試行",
    "reload": "ページを再読み込み",
    "reloadWarning": "再読み込みすると、保存していない変更は失われます。続行しますか？"
  },
  "id": {
    "loading": "Memuat...",
    "error": "Gagal mengunduh berkas",
    "retry": "Coba lagi",
    "reload": "Muat ulang halaman",
    "reloadWarning": "Memuat ulang akan menghapus perubahan yang belum disimpan. Lanjutkan?"
  },
  "ar": {
    "loading": "جارٍ التحميل...",
    "error": "تعذّر تنزيل الملف",
    "retry": "إعادة المحاولة",
    "reload": "إعادة تحميل الصفحة",
    "reloadWarning": "ستؤدي إعادة التحميل إلى فقدان التغييرات غير المحفوظة. هل تريد المتابعة؟"
  },
  "pt-br": {
    "loading": "Carregando...",
    "error": "Não foi possível baixar o arquivo",
    "retry": "Tentar novamente",
    "reload": "Recarregar a página",
    "reloadWarning": "Ao recarregar a página, você perderá as alterações não salvas. Continuar?"
  },
  "es-mx": {
    "loading": "Cargando…",
    "error": "Error al descargar el archivo",
    "retry": "Reintentar",
    "reload": "Recargar la página",
    "reloadWarning": "Al recargar se perderán los cambios sin guardar. ¿Continuar?"
  },
  "fil": {
    "loading": "Nilo-load...",
    "error": "Hindi ma-download ang file",
    "retry": "Subukang muli",
    "reload": "I-reload ang pahina",
    "reloadWarning": "Mawawala ang mga pagbabagong hindi pa nai-save kapag nag-reload. Magpatuloy?"
  },
  "he": {
    "loading": "בטעינה...",
    "error": "לא ניתן להוריד את הקובץ",
    "retry": "לנסות שוב",
    "reload": "טעינת העמוד מחדש",
    "reloadWarning": "טעינה מחדש תגרום לאובדן שינויים שלא נשמרו. להמשיך?"
  },
  "uk": {
    "loading": "Завантаження...",
    "error": "Не вдалося завантажити файл",
    "retry": "Повторити",
    "reload": "Перезавантажити сторінку",
    "reloadWarning": "Перезавантаження призведе до втрати незбережених змін. Продовжити?"
  }
};
