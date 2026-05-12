const ENDPOINT = 'http://localhost:3000/api/send-email';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Recipient { name: string; email: string }

const TUTOR_RECIPIENTS: Recipient[] = [
  // Individual tutors
  { name: 'Justina Peško', email: 'peskojustina@gmail.com' },
  { name: 'Marija Šeibutienė', email: 'marijaseibutiene@gmail.com' },
  { name: 'Vilma Kuodytė', email: 'vilma.j.kuodyte@gmail.com' },
  // Org tutors (except alanas@soci.lt, regimantasracyla, tomas kapitonas)
  { name: 'Aiste Pleikyte', email: 'pleikyte.aiste@gmail.com' },
  { name: 'Akvilė Jaruševičiūtė', email: 'akvile.jaruseviciute1@gmail.com' },
  { name: 'Edvinas Žilėnas', email: 'edvinas.matematika@mokslovaisiai.lt' },
  { name: 'Hektoras Glumbakas', email: 'hektorglum722@gmail.com' },
  { name: 'Sandra Bačiliūnaitė', email: 'sandra12345ba@gmail.com' },
  { name: 'Silvija Sakalavičiūtė', email: 'ssakalaviciute@gmail.com' },
  { name: 'Sofija Ališauskaitė', email: 'sofija.alisauskaite@gmail.com' },
  { name: 'Tautvydas Brazauskas', email: 'brazauskas2007@gmail.com' },
  { name: 'Viltė Kišonaitė', email: 'vilte.kis@gmail.com' },
];

const STUDENT_SKIP = new Set([
  'info@soci.lt',
  'test@mail.lt',
  'ausra.krizinauskiene@gmail.com',
]);

const STUDENT_RECIPIENTS: Recipient[] = [
  { name: 'Adelė Pocej', email: 'pocej.adele@gmail.com' },
  { name: 'Adriana, 12 kl.', email: 'adrianamiskelovic@gmail.com' },
  { name: 'Agnė Paliukienė', email: 'agne.paliukiene@gmail.com' },
  { name: 'Agota Jasmontaitė', email: 'jurga.simaityte@gmail.com' },
  { name: 'Aida Budreikienė', email: 'a.budreikiene@gmail.com' },
  { name: 'Aidas Druskis', email: 'aidasdruskis@gmail.com' },
  { name: 'Aira', email: 'airaurm@gmail.com' },
  { name: 'Aistė Sav', email: 'aistute.sav@gmail.com' },
  { name: 'Akvilė Čeikutė', email: 'akvileceikute@gmail.com' },
  { name: 'Alicija', email: 'alicija.talalaite@gmail.com' },
  { name: 'Alina Ramanauskienė', email: 'info@arflowersandmoss.lt' },
  { name: 'Alisa Korsakaitė', email: 'natalja.borisevic@gmail.com' },
  { name: 'Amelija Aranauskaitė', email: 'amelija.aranauskaite@gmail.com' },
  { name: 'Andrius Petrauskas', email: '3m.andrius@gmail.com' },
  { name: 'Aneta Lialka', email: 'anetalialk@gmail.com' },
  { name: 'Asta Kortkuviene', email: 'akortkute@gmail.com' },
  { name: 'Augustas Graužas', email: 'dalia.grauziene@gmail.com' },
  { name: 'Augustė Komičiūtė', email: 'aug.komiciutea@gmail.com' },
  { name: 'Augustė Mamiūnaitė', email: 'mamiunaiteauguste@gmail.com' },
  { name: 'Aurelija Vieščiūnaitė', email: 'aurakika@gmail.com' },
  { name: 'Austėja Bačiulytė', email: 'baciulyteausteja@gmail.com' },
  { name: 'Danielė Briginaitė', email: 'briginaitedaniele@gmail.com' },
  { name: 'Deimantė Slavinskaitė', email: 'deimante.greenlakes@gmail.com' },
  { name: 'Dovilė Dailidytė', email: 'doviledail@gmail.com' },
  { name: 'Dovilė Pocienė', email: 'dovile.pociene@gmail.com' },
  { name: 'Dovydas Paplauskas', email: 'dovydas.paplauskas09@gmail.com' },
  { name: 'Dovydas Zimanas', email: 'zimanas.dovydas@gmail.com' },
  { name: 'Eglė Savarauskienė', email: 'blakstiena21@yahoo.com' },
  { name: 'Elzė', email: 'elzbieta.slivinskaite@gmail.com' },
  { name: 'Erika Mištautaitė', email: 'mykolas.mistautas@gmail.com' },
  { name: 'Evelina Jušinska', email: 'juszinska@gmail.com' },
  { name: 'Faustė Žmuidinaitė', email: 'fauste.zmuidinaite@gmail.com' },
  { name: 'Gabija, 11 kl.', email: 'gabija.danylaite@gmail.com' },
  { name: 'Gabrielė Cilind', email: 'cilindgabi@gmail.com' },
  { name: 'Gabrielė Dainiūtė', email: 'daingabgab@gmail.com' },
  { name: 'Gerda Tautvydaitė', email: 'aiste.simanaviciute@gmail.com' },
  { name: 'Gintarė', email: 'gruseckiene9@gmail.com' },
  { name: 'Goda Kulbytė', email: 'goda.kulbyte@gmail.com' },
  { name: 'Greta', email: 'gbutauskaite08@gmail.com' },
  { name: 'Greta Ingiliartaitė', email: 'greta20081@gmail.com' },
  { name: 'Greta, 10 kl.', email: 'greta.dulskyte@icloud.com' },
  { name: 'Indrė Treigienė', email: 'i.treigiene@gmail.com' },
  { name: 'Inga Valkūnienė', email: 'ingavalkuniene@gmail.com' },
  { name: 'Ingrida Jucienė', email: 'ingrida.juciene@gmail.com' },
  { name: 'Irina Šinkūnienė', email: 'irina.sinkuniene@gmail.com' },
  { name: 'Izabelė P', email: 'izabelepi2@gmail.com' },
  { name: 'Jonas Gudinas', email: 'vilmavgud@gmail.com' },
  { name: 'Judita Bernatavičienė', email: 'j.bernataviciene@gmail.com' },
  { name: 'Julita Vyšniauskienė', email: 'gabrielevys11@gmail.com' },
  { name: 'Justina Gasiūnaitė', email: 'lukosytejustina@gmail.com' },
  { name: 'Kamilė Kurjan', email: 'kurjankamile@gmail.com' },
  { name: 'Kestas', email: 'mc.cool.ltu@gmail.com' },
  { name: 'Kornelija Kurjan', email: 'korkornelija05@gmail.com' },
  { name: 'Kostas Elzbergas', email: 'kostas.elzbergas@gmail.com' },
  { name: 'Kotryna', email: 'kotryna.masaityte@inzinerijoslicejus.ktu.edu' },
  { name: 'Kristina Petkauskienė', email: 'gustaskopustas123@gmail.com' },
  { name: 'Kristina Puidienė', email: 'kristinapuidiene138@gmail.com' },
  { name: 'Laima Anulienė', email: 'iveta.anulyte@gmail.com' },
  { name: 'Laura Petraškevič', email: 'laura.petraskevic1@gmail.com' },
  { name: 'Lukas Kral', email: 'revuckaite@gmail.com' },
  { name: 'Mantas Balsys', email: 'balsysmantas55@gmail.com' },
  { name: 'Martin Cilind', email: 'martincilind@gmail.com' },
  { name: 'Matas Bankauskas', email: 'themattis2021@gmail.com' },
  { name: 'Matas Jakutis', email: 'ainakurklietyte@yahoo.com' },
  { name: 'Melana Veseckaitė', email: 'm.veseckaite@gmail.com' },
  { name: 'Monika Zorskienė', email: 'monikazorskiene@gmail.com' },
  { name: 'Natalija Vinevičienė', email: 'terioshina@mail.ru' },
  { name: 'Olivia Pažemeckaitė', email: 'oliviapazemeckaite@gmail.com' },
  { name: 'Orinta Čeikutė', email: 'orintaceikute@gmail.com' },
  { name: 'Otilija Var', email: 'otilija.var@gmail.com' },
  { name: 'Raminta, VBE', email: 'ramintejasenaite@gmail.com' },
  { name: 'Ramūnas Stonkus', email: 'ramunas.stonkus1@gmail.com' },
  { name: 'Rasa Stundžienė', email: 'stundziene.rasa@gmail.com' },
  { name: 'Renata', email: 'renatagladkovskaja@gmail.com' },
  { name: 'Rugilė, 11 kl.', email: 'zibolyte.rugile@gmail.com' },
  { name: 'Rūtenis Mikšys', email: 'miksys.rutenis@gmail.com' },
  { name: 'S', email: 'paulaviciute.sa@gmail.com' },
  { name: 'Saulė', email: 'saule.zitku@gmail.com' },
  { name: 'Saulė Karbonskytė', email: 'rutakupstiene70@gmail.com' },
  { name: 'Saulė Sabaitytė', email: 'erika.klimaviciute@gmail.com' },
  { name: 'Saulė Stankevičiūtė', email: 'sts32955@gmail.com' },
  { name: 'Simonas Mikšys', email: 'miksys.simonas@gmail.com' },
  { name: 'Simonas Pipiras', email: 'simonas.pipiras0@gmail.com' },
  { name: 'Sofija Čer', email: 'sofijamdvki@gmail.com' },
  { name: 'Teja', email: 'alanasop1@gmail.com' },
  { name: 'Tumas Kudinovas', email: 'tumas.kudinovas@gmail.com' },
  { name: 'Ugnė Verksnytė', email: 'verksnyteugne@gmail.com' },
  { name: 'Ūla Gamulytė', email: 'ula.gamulyte@gmail.com' },
  { name: 'Vakaris Klimantavičius', email: 'agne.vnc@gmail.com' },
  { name: 'Vida Staskoniene', email: 'staskoniene@gmail.com' },
  { name: 'Vilija Sinkevič', email: 'vilijasinkevic09@gmail.com' },
  { name: 'Vilmantė Varanavičiūtė', email: 'ligita.varanaviciene@gmail.com' },
  { name: 'Vincentas', email: 'vincentvask@gmail.com' },
  { name: 'Vitalija Danylienė', email: 'viltedumbliauskaite@gmail.com' },
];

const PARENT_RECIPIENTS: Recipient[] = [
  { name: 'Agnė Griciuvienė', email: 'pupeliukas@gmail.com' },
  { name: 'Alina Slavinskienė', email: 'alinasla@yahoo.com' },
  { name: 'Arūnas Karbonskis', email: 'arunas444@gmail.com' },
  { name: 'Asta Kortkuvienė', email: 'atejusikatyte@gmail.com' },
  { name: 'Aušra Pipirienė', email: 'ekamileichy@gmail.com' },
  { name: 'Daiva Zibolienė', email: 'daivazibole@gmail.com' },
  { name: 'Dana Lialka', email: 'dlialka@gmail.com' },
  { name: 'Diana Zimanienė', email: 'diana.zimaniene@gmail.com' },
  { name: 'Greta Bernotienė', email: 'gretute2008@gmail.com' },
  { name: 'Ingrida Aranauskienė', email: 'ingrida.aranauskiene@gmail.com' },
  { name: 'Jolita Kudinovienė', email: 'jolita.kudinoviene@gmail.com' },
  { name: 'Jolita Talalė', email: 'jolitamaliskaite@gmail.com' },
  { name: 'Jovita Paplauskienė', email: 'jovita.paplauskiene@gmail.com' },
  { name: 'Julita Vyšniauskienė', email: 'julitukasv@gmail.com' },
  { name: 'Jūratė Gamulienė', email: 'jurate.gamuliene@gmail.com' },
  { name: 'Karina Cilind', email: 'carinnac@gmail.com' },
  { name: 'Kristina Ingiliartienė', email: 'k.ingiliartine@gmail.com' },
  { name: 'Marek Kurjan', email: 'mariusktns@gmail.com' },
  { name: 'Natalija Čop', email: 'natalija.cop@gmail.com' },
  { name: 'Nerijus Elzbergas', email: 'transpo.nerijus@gmail.com' },
  { name: 'Regina Druskienė', email: 'rdruskiene@gmail.com' },
  { name: 'Sandra Čeriaukaite', email: 'sceriauke@gmail.com' },
  { name: 'Šarūnas Mikšys', email: 'sarunas.miksys@gmail.com' },
  { name: 'vaiva veseckiene', email: 'v.veseckiene@gmail.com' },
  { name: 'Vilma Briginienė', email: 'vilma.bri@gmail.com' },
];

async function sendOne(type: string, to: string, recipientName: string, subtitle: string) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': SERVICE_KEY },
    body: JSON.stringify({ type, to, data: { recipientName: recipientName || undefined, subtitle } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`  FAIL ${to}: ${res.status} ${text}`);
    return false;
  }
  return true;
}

function dedup(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return list.filter(r => {
    const key = r.email.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function sendBatch(label: string, type: string, recipients: Recipient[], subtitle: string) {
  const unique = dedup(recipients);
  console.log(`\n=== ${label} === (${unique.length} recipients)`);
  let ok = 0;
  let fail = 0;
  for (const r of unique) {
    const success = await sendOne(type, r.email, r.name, subtitle);
    if (success) ok++; else fail++;
  }
  console.log(`  Done: ${ok} sent, ${fail} failed`);
}

async function main() {
  if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    const tutors = dedup(TUTOR_RECIPIENTS);
    const students = dedup(STUDENT_RECIPIENTS.filter(s => !STUDENT_SKIP.has(s.email.toLowerCase().trim())));
    const parents = dedup(PARENT_RECIPIENTS);
    console.log(`DRY RUN — would send:`);
    console.log(`  Tutors: ${tutors.length} (tutor email)`);
    tutors.forEach(r => console.log(`    ${r.email} — ${r.name}`));
    console.log(`  Students: ${students.length} (student email)`);
    students.forEach(r => console.log(`    ${r.email} — ${r.name}`));
    console.log(`  Parents: ${parents.length} (parent email)`);
    parents.forEach(r => console.log(`    ${r.email} — ${r.name}`));
    console.log(`\n  TOTAL: ${tutors.length + students.length + parents.length} emails`);
    return;
  }

  await sendBatch('TUTORS', 'product_update_whiteboard_tutor', TUTOR_RECIPIENTS, 'Interaktyvi lenta jūsų pamokoms');
  await sendBatch('STUDENTS', 'product_update_whiteboard_student',
    STUDENT_RECIPIENTS.filter(s => !STUDENT_SKIP.has(s.email.toLowerCase().trim())),
    'Lenta + failų atsisiuntimas');
  await sendBatch('PARENTS', 'product_update_whiteboard_parent', PARENT_RECIPIENTS, 'Pamokų informacija + pranešimų valdymas');

  console.log('\n=== ALL DONE ===');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
