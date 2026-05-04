# Vaiko atvaizdo sutikimas (DOCX šablonui)

Tikslas: kad po tėvų pasirinkimo (sutinku / nesutinku) automatiškai sugeneruotame PDF būtų:

- paryškintas pasirinktas variantas („Sutinku“ arba „Nesutinku“),
- varnelė prie pasirinkto bullet point'o,
- o nepasirinktas variantas liktų be varnelės ir be paryškinimo.

## Kokias žymes supranta sistema

DOCX šablone naudojamas Docxtemplater, todėl galite naudoti sąlygines sekcijas:

- `{#consent_pending} ... {/consent_pending}`
- `{#consent_agree_selected} ... {/consent_agree_selected}`
- `{#consent_disagree_selected} ... {/consent_disagree_selected}`

Sistemoje šie flag'ai nustatomi pagal lauką `media_publicity_consent`:

- `null` → `consent_pending = true`
- `'agree'` → `consent_agree_selected = true`
- `'disagree'` → `consent_disagree_selected = true`

## Ką konkrečiai padaryti Word'e

1) Suraskite vietą sutartyje su dviem bullet point'ais („Sutinku...“ ir „Nesutinku...“).

2) Vietoje vienos poros bullet point'ų įdėkite **3 blokus** (galite kopijuoti tą patį tekstą 3 kartus) ir apgaubkite žymėmis:

### 1) Kai dar nepasirinkta

- Atskira eilutė: `{#consent_pending}`
- Bullet 1: `☐ Sutinku, kad ...`
- Bullet 2: `☐ Nesutinku, kad ...`
- Atskira eilutė: `{/consent_pending}`

### 2) Kai pasirinkta „sutinku“

- Atskira eilutė: `{#consent_agree_selected}`
- Bullet 1: `☑ Sutinku, kad ...` (ši eilutė arba bent žodis „Sutinku“ **Bold**)
- Bullet 2: `☐ Nesutinku, kad ...`
- Atskira eilutė: `{/consent_agree_selected}`

### 3) Kai pasirinkta „nesutinku“

- Atskira eilutė: `{#consent_disagree_selected}`
- Bullet 1: `☐ Sutinku, kad ...`
- Bullet 2: `☑ Nesutinku, kad ...` (ši eilutė arba bent žodis „Nesutinku“ **Bold**)
- Atskira eilutė: `{/consent_disagree_selected}`

## Svarbios pastabos

- Žymes (`{#...}` ir `{/...}`) įrašykite **atskirose pastraipose / eilutėse** (ne toje pačioje eilutėje su bullet tekstu), kad Word nesuskaidytų jų per kelis teksto fragmentus (Docxtemplater jautrus).
- Žymių pavadinimai turi sutapti **tiksliai** (raidė į raidę) kaip aukščiau.
- Varnelėms galite naudoti `☐` ir `☑` (arba kitą jums patinkančią simboliką). Svarbiausia, kad jie būtų tekste.

