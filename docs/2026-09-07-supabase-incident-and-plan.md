# Tutlio produkcija — 2026-09-07 incidentas, rizikos ir planas

Dokumentas kolegai ir jo agentui. Prioritetas faktams iš Supabase MCP logų ir Dashboard, tada kodui.

**Projektas:** Supabase `Korepkėms` (`cuhciqwmqfuajeeqjjbm`), region `eu-west-1`, org plan Pro.  
**Po veiksmo (2026-09-07 ~09:24 LT):** compute pakeistas **Micro (1 GB, 60 conn) → Small `t4g.small` (2 GB, 90 conn)**. Būsena po resize: `ACTIVE_HEALTHY`.

Nedeployinti ir nestumti migracijų be atskiro leidimo.

---

## 1. Kas buvo

Šį rytą (~08:42–09:20 LT) Tutlio svetainė (`tutlio.lt`) atrodė užšalusi: login, sesijos refresh, REST.

Tai **ne** globalus Supabase outage ir **ne** userių stampede.

### Laiko juosta (LT, UTC+3)

| Laikas | Kas nutiko |
|--------|------------|
| ~08:42–08:56 | PostgREST timeout (`Thread killed by timeout manager`) |
| **08:57–08:59** | Auth **504**: `dial tcp [::1]:5432: i/o timeout`, `context deadline exceeded` (login + `/user` + refresh token) |
| Trivialūs SQL ėjo 12–30 s | `INSERT realtime.messages` ~30 s, `INSERT auth.sessions` ~12 s, `storage.search` (`session-files`) ~12–15 s |
| **09:07:45** | Postgres restart: `redo` → `database system is ready to accept connections` |
| 09:07–09:08 | PostgREST `Connection refused` į localhost:5432, tada 503 (schema cache) |
| 09:18–09:19 | Tas pats Auth 504 **vėl** — swap / memory commitment šuolis Dashboard’e (~2.28 GB ant 1 GB RAM) |
| ~09:24 | Compute keičiamas į Small (`RESIZING`) |
| ~09:27 | `ACTIVE_HEALTHY`, Auth timeoutų po resize **0**, CPU ~5%, RAM ~55%, diskas 4% |

Auth srautas prieš gedimą: **keliolika req/min** (kaip vakar tuo pačiu laiku). API pikas 291–305 req/min buvo **retry banga**, kai DB jau nebeatsakinėjo.

Loguose **nebuvo** `too many connections`, OOM eilutės ar PgBouncer queue wait. Buvo **RAM exhaustion → swap → Postgres stall → restart**.

Raudonas Dashboard **DATABASE ~30% errors** po atsigavimo = **to ryto gedimas + resize prastova**, ne dabartinis crashas.

---

## 2. Pagrindinė priežastis

Ant **vieno** Micro instance (~1 GB) gyvena Postgres + Auth + PostgREST + Storage + Realtime + cron.

Prieš gedimą ~47/60 ryšių, daugiausia **Storage API (~15)** ir **PostgREST (~11)**, plius Realtime. Duomenų diskas mažas (~54 MB DB) — problema **ne diskas**, o **RAM**.

4–5 verslo klientai su daugiau mokinių **tą patį pakartos**, jei compute vėl bus per mažas. Migracija į „pigesnę RAM“ DB **nėra** logiška: tektų keisti Auth, Storage, Realtime, RLS. Small ~$15/mėn, Medium ~$60/mėn — pigiau nei migracija.

---

## 3. Rizikos (kad nepasikartotų)

1. **Compute per mažas** — vienintelė kietoji apsauga nuo tokio luzimo. Jei RAM nuolat >70% arba vėl atsiranda **swap** → kelti į Medium **prieš** naują mokyklą, ne po incidento.
2. **Retry storm** — kai DB stringa, naršyklės kartoja Auth ir API; po restarto memory commitment šoka dar kartą.
3. **Realtime + Storage** — chat ir `session-files` laikė daug ryšių; po Micro jie pirmieji spaudė RAM.
4. **Chat inbox vis dar `postgres_changes` ant visos `chat_messages`** (`src/hooks/useChat.ts` → `attachInboxRealtime`). AGENTS.md mini private Broadcast topic’us; kode inbox vis dar klausosi lentelės INSERT. Tai skalės blogybė (CPU/RAM Realtime), **ne** šio ryto root cause, bet svarbu 4–5 mokykloms.
5. **Tėvų dashboard** krauna visų vaikų sesijas `limit 2000` (6 mėn. atgal + 3 į priekį) — `src/lib/preload.ts` / `ParentDashboard.tsx`.
6. **`SessionFiles`** kiekvienam session id daro `storage.list` lygiagrečiai — daug Storage conn.
7. **Nelaikyti** visą dieną atidaryto produkcijos Supabase Reports/Studio — dashboard patys leidžia sunkias užklausas (rytą `pg_stat_statements` ~18 s).

**Ko nedaryti:** restartuoti DB „profilaktikai“; trinti „nenaudojamus“ puslapius kaip RAM gelbėjimą; migruoti nuo Supabase dabar.

---

## 4. RAM / apkrovos auditas — ką daryti be UX nuostolių

Prioritetas: pirma **compute atsarga**, tada kodas, kuris mažina ryšius ir Realtime, **be** lėtesnio UI.

### Daryti (saugu UX)

| # | Kas | Kodėl | UX poveikis |
|---|-----|--------|-------------|
| A | Palikti **Small**; stebėti Memory 1–2 sav. Swap turi būti ~0 | Apsauga nuo pakartotinio stall | Nėra |
| B | Prieš naują B2B mokyklą: jei RAM >70% arba swap — **Medium** | Prevencija, ne gaisras | Trumpas resize downtime (planuoti vakarą) |
| C | Chat inbox: perjungti nuo table-wide `postgres_changes` prie jau turimo **Broadcast** `user:{id}:inbox` (kaip capacity darbas `394dbf7`) | Mažiau Realtime RAM visiems online | Žinutės turi ateiti taip pat greitai; testuoti unread badge |
| D | `SessionFiles`: `storage.list` **tik atidarius** pamokos modalą / failų sekciją, ne visoms kortelėms sąraše | Mažiau Storage conn | Failai vis tiek matosi, kai reikia |
| E | Parent/student preload: sesijų langas pvz. **30 d. atgal + 60 d. į priekį**, ne 6+3 mėn. × 2000 | Mažiau PostgREST/RAM | Sena istorija lieka per „Pamokos“ su pager / filtru |
| F | Naujuose puslapiuose **tik** `authSession` / `dedupeAuthGetUser` — jokių lygiagrečių `getUser()` | Mažiau Auth 504 spaudimo | Nėra |
| G | Nelaikyti produkcijos Studio atidaryto 24/7 | Mažiau dashboard SQL | Nėra |

### Nedaryti dabar (UX nukentėtų arba neduos RAM)

- Neliesti chat UI / whiteboard broadcast dabar (jau optimizuota atskirai).
- Nemesti Realtime visai — chat ir WB turi veikti gyvai.
- Neoptimizuoti indexų kaip „incident fix“ (linteris turi daug INFO unindexed FK — naudinga query latency, ne 1 GB OOM).
- Neperrašyti Auth/Storage į kitą vendorį.

### Stebėjimas

Dashboard: [Infrastructure](https://supabase.com/dashboard/project/cuhciqwmqfuajeeqjjbm/settings/infrastructure) ir **Reports → Database → Memory**.  
Po Small: CPU ~5–7%, RAM ~55–62%, conn ~40/90 — **sveika**. Alert mintyse: **swap > 0** arba Auth 504.

---

## 5. Feature: Mokslo vaikai — tėvas registruoja du vaikus

**Klientas:** Mokslo vaikai (mokykla).  
**Poreikis:** tėvai iš **savo** tėvų paskyros užregistruoja **du vaikus atskiromis mokinio paskyromis**. Tėvas turi aiškiai žinoti, **kuriam vaikui** daro pataisymus.

### Kaip yra dabar

- `parent_profiles` + `parent_students` jau leidžia **N vaikų prie vieno tėvo**.
- `/parent` dashboard jau rodo **visus** vaikus viename sraute (nėra header switcherio pataisymams).
- Mokinio login: `students.linked_user_id` + RPC `get_student_profiles`.
- Mokinio portale jau yra analogas **„kurią paskyrą valdai“**: `StudentLayout` select, kai vienas Auth useris turi kelis `students` įrašus — perjungia `localStorage.tutlio_active_student_profile_id` ir perkrauna. Ten labelis dabar **korepetitoriaus vardas**, ne vaiko (solo/multi-tutor atvejis).

**Nerekomenduojama** tėvui logintis kaip vaikui ar kurti antrą tėvų Auth. Taip pat nereikia dubliuoti viso `/student` tėvo sesijoje.

### Rekomenduojamas UX (geriau nei „kaip korep select“)

Vienas tėvų login visam šeimos valdymui + atskiros **mokinio** paskyros vaikams (pamokoms / Join).

1. **Tėvų header (`ParentLayout`)** — jei vaikų ≥ 2: select **vaiko vardas** (ne mokytojas). Persist `tutlio_active_child_student_id`. Kalendorius, pamokos, sąskaitos, nustatymai, pataisymai — **aktyviam vaikui**. Dashboard gali palikti trumpą visų vaikų suvestinę, bet redagavimas visada ant pasirinkto.
2. **Tėvų nustatymai: „Pridėti vaiką“**  
   - Vardas, klasė, el. paštas mokinio prisijungimui (gali būti vaiko el. paštas).  
   - Sukurti `students` eilutę + `parent_students` linką (org = Mokslo vaikai).  
   - Išsiųsti kvietimą mokinio paskyrai (`linked_user_id`), kaip esamas parent-invite / student connect srautas.  
   - Antras vaikas = antras `students` + atskiras Auth user, **ne** tas pats el. paštas kaip tėvo, jei įmanoma.
3. Jei mokykla jau turi abu vaikus admin UI — tėvui tik **susieti** esamus `students` (invite kodas / mokinio nr.), ne kurti dublikatus.
4. Mokinio portalo select palikti kaip yra multi-tutor atvejui; Mokslo vaikams tėvas dirba **`/parent`**, vaikai — **`/student`**.

### Kodėl ne tik „kaip korep dropdown“ mokinio portale

Ten perjungiama **ta pati mokinio Auth sesija** tarp kelių `students` eilučių. Šeimai su dviem vaikais reikia: (a) tėvo perjungimo redagavimui, (b) **dviejų mokinio loginų**, kad vaikai galėtų atskirai jungtis į pamoką. Vienas shared student login abiem vaikams — blogas UX ir chat/failų painiava.

### Techniniai taškai agentui

- Lentelės: `parent_profiles`, `parent_students`, `students.linked_user_id`, esami invite tokenai (`ParentRegister`, parent invite RPC).
- RLS: tėvas mato tik savo `parent_students`; kūrimas per API su service role arba RPC, ne atviras insert iš anon.
- El. paštas: Demo/QA mokėtojas dažnai `alaniukasa@gmail.com` — Mokslo vaikams naudoti tikrus tėvų/vaikų el. paštus, ne demo override.
- i18n: nauji stringai visose UI kalbose (ne tik lt/en), jei ne `quiz.*`.
- QA: tėvas su 2 vaikais — perjungia headerį, pataiso tik B vaiko duomenis; abu vaikai prisijungia atskirai į `/student`.

---

## 6. Planas (eilė)

1. **Dabar (ops):** palikti Small; 24–48 val. žiūrėti Memory/swap. Svetainė veikia — neliesti compute dar kartą be reikalo.
2. **Šią savaitę (Mokslo vaikai):** tėvų child switcher + „Pridėti / susieti vaiką“ su atskiru mokinio Auth. Neplėsti į visą parent UX perrašymą.
3. **Po to (capacity, kai bus laiko):** chat inbox Broadcast vietoj table `postgres_changes`; lazy `SessionFiles`; siauresnis tėvų sesijų langas.
4. **Prieš 4–5 naujas mokyklas:** Memory peržiūra; jei reikia — Medium iš anksto.
5. **Ne plane:** DB migracija nuo Supabase; didelis „išvalom nenaudojamą kodą“ sprintas RAM dėl šio incidento.

---

## 7. Nuorodos

- Projektas: https://supabase.com/dashboard/project/cuhciqwmqfuajeeqjjbm  
- Infrastructure: https://supabase.com/dashboard/project/cuhciqwmqfuajeeqjjbm/settings/infrastructure  
- Reports: https://supabase.com/dashboard/project/cuhciqwmqfuajeeqjjbm/reports  
- Chat: `src/hooks/useChat.ts` (`attachInboxRealtime`)  
- Tėvų vaikai: `src/lib/preload.ts` (`parentStudentLinksDeduped`), `src/pages/ParentDashboard.tsx`, `src/components/ParentLayout.tsx`  
- Mokinio profilio perjungimas: `src/components/StudentLayout.tsx` (`tutlio_active_student_profile_id`)  
- Failai: `src/components/SessionFiles.tsx`
