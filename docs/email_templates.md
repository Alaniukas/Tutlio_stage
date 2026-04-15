# Tutlio Email Templates - Supabase Auth

## 1. Confirm Sign Up (Email Verification)

**Subject:** Patvirtinkite savo el. paštą – Tutlio 🎓

**HTML Body:**
```html
<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 16px; color: #1f2937; margin: 0 0 16px; }
    .info-card { background: #f8f7ff; border: 1px solid #e5e3ff; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body style="margin:0; padding:20px 0; background-color:#f3f4f6;">
  <div class="container">
    <div style="background-color: #ffffff; padding: 20px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
      <span style="font-size: 26px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; display: inline-flex; items-center; gap: 8px;">Tutlio <span style="font-size: 24px;">🎓</span></span>
    </div>

    <div class="header">
      <h1>✉️ Patvirtinkite savo el. paštą</h1>
      <p>Dar vienas žingsnis iki prisijungimo!</p>
    </div>

    <div class="body">
      <p class="greeting">Sveiki! 👋</p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">
        Dėkojame, kad prisijungėte prie <strong>Tutlio</strong> platformos! Norint užbaigti registraciją, prašome patvirtinti savo el. pašto adresą.
      </p>

      <div class="info-card">
        <p style="color:#6b7280; font-size:13px; margin:0 0 8px; text-align:center;">
          📧 Spauskite mygtuką žemiau, kad patvirtintumėte savo el. paštą:
        </p>
      </div>

      <div style="text-align:center; margin: 28px 0;">
        <a href="{{ .ConfirmationURL }}" style="background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; text-decoration:none; padding:14px 36px; border-radius:12px; font-weight:600; font-size:16px; display:inline-block; box-shadow: 0 4px 14px rgba(99,102,241,0.3);">
          ✅ Patvirtinti el. paštą
        </a>
      </div>

      <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:12px; padding:16px; margin-top:24px;">
        <p style="color:#92400e; font-size:13px; margin:0; line-height:1.6;">
          ⏱️ <strong>Svarbu:</strong> Ši nuoroda galioja 24 valandas. Jei negavote šio laiško, patikrinkite "Spam" aplanką arba užsiregistruokite iš naujo.
        </p>
      </div>

      <p style="color:#9ca3af; font-size:12px; margin-top:24px; line-height:1.5;">
        Jei Jūs neregistravotės Tutlio platformoje, tiesiog ignoruokite šį laišką.
      </p>
    </div>

    <div class="footer">
      <p>Tutlio komanda</p>
      <p style="margin-top:8px;">📧 Klausimai? <a href="mailto:info@tutlio.lt" style="color:#6366f1; text-decoration:none;">info@tutlio.lt</a></p>
    </div>
  </div>
</body>
</html>
```

---

## 2. Reset Password (Slaptažodžio atkūrimas)

**Subject:** Slaptažodžio atkūrimas – Tutlio 🎓

**HTML Body:**
```html
<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 16px; color: #1f2937; margin: 0 0 16px; }
    .info-card { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f0f0f0; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body style="margin:0; padding:20px 0; background-color:#f3f4f6;">
  <div class="container">
    <div style="background-color: #ffffff; padding: 20px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
      <span style="font-size: 26px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; display: inline-flex; items-center; gap: 8px;">Tutlio <span style="font-size: 24px;">🎓</span></span>
    </div>

    <div class="header">
      <h1>🔑 Slaptažodžio atkūrimas</h1>
      <p>Gautas prašymas pakeisti slaptažodį</p>
    </div>

    <div class="body">
      <p class="greeting">Sveiki! 👋</p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">
        Gavome prašymą atkurti <strong>Tutlio</strong> paskyros slaptažodį. Spauskite mygtuką žemiau, kad nustatytumėte naują slaptažodį.
      </p>

      <div class="info-card">
        <p style="color:#92400e; font-size:13px; margin:0 0 8px; text-align:center; font-weight:600;">
          🔒 Saugus slaptažodžio atkūrimas
        </p>
        <p style="color:#78350f; font-size:12px; margin:0; text-align:center;">
          Ši nuoroda veikia tik vieną kartą ir galioja 1 valandą
        </p>
      </div>

      <div style="text-align:center; margin: 28px 0;">
        <a href="{{ .ConfirmationURL }}" style="background:linear-gradient(135deg, #f59e0b, #f97316); color:#fff; text-decoration:none; padding:14px 36px; border-radius:12px; font-weight:600; font-size:16px; display:inline-block; box-shadow: 0 4px 14px rgba(245,158,11,0.3);">
          🔑 Atkurti slaptažodį
        </a>
      </div>

      <div style="background:#fee2e2; border:1px solid #fecaca; border-radius:12px; padding:16px; margin-top:24px;">
        <p style="color:#991b1b; font-size:13px; margin:0 0 8px; font-weight:600;">
          ⚠️ Nesate prašę atkurti slaptažodžio?
        </p>
        <p style="color:#b91c1c; font-size:12px; margin:0; line-height:1.5;">
          Jei Jūs neprašėte atkurti slaptažodžio, tiesiog ignoruokite šį laišką. Jūsų paskyra yra saugi, ir niekas negali pakeisti slaptažodžio be šios nuorodos.
        </p>
      </div>

      <p style="color:#9ca3af; font-size:12px; margin-top:24px; line-height:1.5;">
        Dėl saugumo priežasčių, <strong>niekada nedalinatės šia nuoroda</strong> su kitais asmenimis.
      </p>
    </div>

    <div class="footer">
      <p>Tutlio komanda</p>
      <p style="margin-top:8px;">📧 Klausimai? <a href="mailto:info@tutlio.lt" style="color:#6366f1; text-decoration:none;">info@tutlio.lt</a></p>
    </div>
  </div>
</body>
</html>
```

---

## Kaip įkelti į Supabase:

### 1. **Confirm Sign Up Template:**
1. Eikite į Supabase Dashboard → **Authentication** → **Email Templates**
2. Pasirinkite **"Confirm signup"**
3. **Subject** lauke įrašykite: `Patvirtinkite savo el. paštą – Tutlio 🎓`
4. **Message (Body)** lauke įklijuokite visą HTML kodą iš "Confirm Sign Up" sekcijos aukščiau
5. Išsaugokite

### 2. **Reset Password Template:**
1. Tame pačiame Email Templates puslapyje pasirinkite **"Reset password"**
2. **Subject** lauke įrašykite: `Slaptažodžio atkūrimas – Tutlio 🎓`
3. **Message (Body)** lauke įklijuokite visą HTML kodą iš "Reset Password" sekcijos aukščiau
4. Išsaugokite

### 3. **Magic Link Template (papildomai):**
Jei naudojate "Magic Link" prisijungimą, galite sukurti panašų template su šiomis modifikacijomis:
- Subject: `Prisijungimo nuoroda – Tutlio 🎓`
- Header: `🔐 Prisijungimas be slaptažodžio`
- Button text: `🔓 Prisijungti dabar`
- Gradient: `#10b981` → `#059669` (žalia)

---

## Pastabos:

- **{{ .ConfirmationURL }}** - Supabase automatiškai pakeičia šią kintamąją į teisingą patvirtinimo nuorodą
- Visi emailai naudoja tą patį Tutlio stilių kaip ir kiti custom emailai
- Emailai optimizuoti mobile įrenginiams
- Pridėti saugumo įspėjimai ir nuorodų galiojimo laikai
- Naudojama lietuviška kalba su emoji 🎓

## Supabase Kintamieji (Template Variables):

Galite naudoti šiuos kintamuosius Supabase email template'uose:
- `{{ .ConfirmationURL }}` - Patvirtinimo/reset nuoroda
- `{{ .Token }}` - Patvirtinimo token'as
- `{{ .TokenHash }}` - Token hash
- `{{ .SiteURL }}` - Jūsų site URL (iš Supabase settings)
- `{{ .Email }}` - Vartotojo el. paštas
