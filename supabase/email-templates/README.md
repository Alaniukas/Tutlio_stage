# Supabase Auth — el. laiškai (.lt / .pl / .com)

Vienas Supabase projektas, **3 kalbos** pagal domeną:

| Domenas | Kalba | `user_metadata.locale` |
|---------|-------|-------------------------|
| `tutlio.lt` | LT | `lt` (numatyta) |
| `tutlio.pl` | PL | `pl` |
| `tutlio.com` | EN | `en` |

## Kaip veikia

1. Registracijoje app į `signUp` perduoda `options.data.locale` pagal `window.location.hostname` (`src/lib/auth-locale.ts`).
2. Supabase šablonuose naudojama Go sintaksė: `{{ if eq .Data.locale "pl" }}` …
3. Slaptažodžio atkūrimas: app kreipiasi į `/api/request-password-reset`, kuris **prieš laišką** atnaujina `user_metadata.locale` pagal domeną (`.com` → `en`, `.pl` → `pl`, `.lt` → `lt`).

**Svarbu:** seni vartotojai be `locale` gauna **lietuvišką** šabloną tik jei reset eina tiesiogiai per Supabase (be API).

## URL Configuration

| Laukas | Rekomendacija |
|--------|----------------|
| **Site URL** | pagrindinis domenas, pvz. `https://www.tutlio.lt` arba `.pl` |
| **Redirect URLs** | [`redirect-urls.txt`](./redirect-urls.txt) — **visi** .lt, .pl, .com |

## Šablonai Dashboard'e (3 kalbos)

| Supabase šablonas | Subject | Body |
|-------------------|---------|------|
| **Confirm signup** | [`confirm-signup.multilocale.subject.txt`](./confirm-signup.multilocale.subject.txt) | [`confirm-signup.multilocale.html`](./confirm-signup.multilocale.html) |
| **Reset password** | [`reset-password.multilocale.subject.txt`](./reset-password.multilocale.subject.txt) | [`reset-password.multilocale.html`](./reset-password.multilocale.html) |

Vienkalbiai PL failai (`confirm-signup.html` ir kt.) — tik jei naudojate **tik** tutlio.pl.

## Deploy

Po pakeitimo `Register.tsx` — **deploy** į Vercel (visi 3 domenai į tą patį projektą).

## Google OAuth (jei naudojate)

**Google Cloud Console → Credentials → OAuth client** — Authorized redirect URIs turi atitikti domenus, kuriuose veikia app (žr. `redirect-urls.txt` + Google Calendar callback iš `.env.example`).
