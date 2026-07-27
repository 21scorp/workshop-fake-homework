# ASTRAFALL — Design Bible

> One-thumb bullet-heaven roguelite met gacha. Gebouwd voor verticale video.

---

## 1. Pitch

**Je valt door een stervende sterrenhemel. Eén duim. Zestig seconden. Alles op het spel.**

ASTRAFALL is een verticale arcade-roguelite van 60–120 seconden per run. Je sleept met één
duim, je Astra (verzamelbaar wezen) vecht automatisch, en elke level-up dwingt je tot een
keuze uit drie kaarten. Je sterft. Je krijgt Stardust. Je summont. Je wordt sterker.
Je doet het nog één keer.

## 2. Waarom dit viral gaat

| Hook | Mechanic | Clip-moment |
|---|---|---|
| **Rarity reveal** | 10-pull met beam-kleur die escaleert | De gouden beam. Mensen filmen hun pulls. |
| **Daily Seed** | Iedereen speelt wereldwijd dezelfde run | "Duet mijn seed" — directe vergelijking |
| **Share Seed** | `?s=CODE` link reproduceert exact dezelfde run | Stitch/duet challenge, geen server nodig |
| **Share Card** | 1080×1920 PNG render van je run | Instagram Story-formaat, 1 tap |
| **Rang** | D t/m S+, groot op de kaart | "Ik heb S" is een caption, "984.210" is een screenshot |
| **Verzamelkaart** | Je hele roster als 1080×1920, met de gaten erin | De ontbrekende vakjes zijn wat de kijker het plaatje doet willen |
| **Near-death** | Slowmo + chroma bij 1 HP | Automatisch dramatisch |
| **Ultimate** | Schermvullende nova, hitstop, shake | De payoff-frame |
| **Card choice** | 3 kaarten, 1 keuze, klok tikt | Comment-bait: "welke pak jij?" |

## 3. Core loop

```
RUN (60-120s)  →  DEATH/CLEAR  →  REWARDS  →  SUMMON  →  UPGRADE  →  RUN
   ↑                                                                    │
   └────────────────────────── "nog één keer" ──────────────────────────┘
```

### Anomalieën

Voorbij golf tien was de run niet meer een ander gevecht maar hetzelfde
gevecht met grotere getallen. Schaling verlengt een run; ze varieert er geen.
Elke vierde golf verandert daarom de lucht: acht modifiers, elk een handvol
vermenigvuldigers met een naam en een belofte, aangekondigd voordat ze landen
en achteraf op het resultatenscherm.

De helft staat aan jouw kant. Dat is het punt: een systeem waarin elke twist
een belasting is leest als moeilijkheidsgraad, en een waarin alles een cadeau
is leest als ruis. Een twist moet beide kanten op kunnen, anders is de
aankondiging niet de moeite van het lezen waard.

Ze worden uit de gezaaide stroom van de run getrokken, dus een gedeelde
`?s=CODE` reproduceert dezelfde anomalieën in dezelfde volgorde — anders zou
de dagelijkse seed ophouden een eerlijke vergelijking te zijn.

### Micro-loop (in-run, ~8s)
`dodge → kill → prisms oppakken → level up → 3 kaarten → sterker → hogere druk`

### Meso-loop (per run)
`wave 1-3 → elite → wave 4-6 → BOSS → escalatie → dood`

Vier bazen, elke vijf golven één, cyclisch. De vierde — HET WEEFGETOUW —
vraagt iets anders dan de andere drie: geen kogelregen om op te reageren maar
een draaiende spaak en mijnen op de vloer, dus je moet een tel vooruit lezen
in plaats van te ontwijken wat er al is.

### Macro-loop (per dag)
`daily seed → free summon → login streak → banner pity opbouwen → nieuwe Astra → build unlock`

## 4. Besturing

Eén duim. Sleep waar dan ook op het scherm — de Vessel volgt met een offset (geen
finger-occlusion). Loslaten = stoppen. Geen knoppen tijdens gameplay behalve de
Ultimate-orb rechtsonder (tap).

## 5. Astra (de gacha-units)

Elke Astra bepaalt: wapenpatroon, element, passieve stat, en ultimate.

| Rarity | Kleur | Rate | Naam in-game |
|---|---|---|---|
| C | slate | 54.7% | Common |
| R | cyan | 30% | Rare |
| SR | violet | 12% | Superior |
| SSR | amber | 2.8% | Stellar |
| UR | prism/rainbow | 0.5% | **Ultra** |

- **Soft pity** vanaf pull 65: SSR-rate schaalt lineair naar 100% op pull 80.
- **Hard pity** 80: gegarandeerde SSR+.
- **10-pull garantie**: minimaal 1 SR+.
- **50/50**: eerste SSR kan off-banner zijn; verlies → volgende SSR is gegarandeerd rate-up.
- **Dupes** → Echoes → sterren (S1..S5), elke ster +stat en op S3/S5 een ability-upgrade.

## 6. Economie

| Currency | Bron | Sink |
|---|---|---|
| **Stardust** ✦ | runs, dailies | summons (soft) |
| **Nova Shards** ◈ | IAP, quests, eerste-clear | summons (premium), skips |
| **Echoes** ◉ | dupes, boss drops | Astra sterren |
| **Cores** ⬢ | runs | permanente meta-upgrades |

Zachte valuta wordt vrijgevig uitgedeeld; de premium valuta koopt **tijd**, nooit power die
niet ook verdienbaar is. Geen paywall op de daily seed — dat is de virale laag.

## 7. IAP (voorbereid, niet actief)

Alles loopt via `PaymentProvider` (interface). Nu: `MockProvider`. Later: Stripe / RevenueCat /
App Store. SKUs staan in `src/data/shop.js`:

- `starter_bundle` — eenmalig, hoge waarde, 72u venster
- `shards_S/M/L/XL` — valutapakketten met first-purchase bonus
- `starpass_season` — battle pass, 30 tiers, free + premium track
- `remove_ads` — cosmetic + QoL (geen power)

## 8. Art direction

**"Bioluminescent void"** — diepzwart met diepblauw/paars verloop, neon accenten, veel bloom,
alles glow. Geen platte kleuren: elke vorm heeft een gradient en een glow-halo.

- Palet: `#05060f` void, `#0b1030` deep, `#22d3ee` cyan, `#a855f7` violet, `#fbbf24` amber,
  `#f43f5e` danger, prism-gradient voor UR.
- UI: glassmorphism (blur + 1px lichte rand + inner glow), geen harde vlakken.
- Typografie: variabel grotesk, zware weights voor cijfers, tabular-nums overal.
- **Alles beweegt.** Idle-animatie op elke knop, parallax-sterrenveld, ademende glows.

### Sprite-readiness (belangrijk)

Er wordt **nu al** gerenderd via `AssetRegistry`. Elke entity vraagt een *sprite key* op
(`astra/ember/idle`), niet een teken-functie. De registry lost die key op naar:

1. **Atlas-frame** als er een texture-atlas geladen is (`assets/sprites/*.json` + `.png`)
2. **Procedural vector-drawer** als fallback (wat er nu draait)

Sprites toevoegen = atlas droppen in `assets/sprites/`, naam in `atlases.json`. Nul
gameplay-code raakt aangetast. Anchors, pivots, hitboxen en animatie-timelines zitten al
in de data.

Dat is uitgevoerd, niet aangenomen: `tools/bake-atlas.mjs` bakt elke geregistreerde key
naar een echte atlas en het spel rendert daar volledig uit — nul procedurele draws. Twee
dingen kwamen daarbij boven die alleen een échte bak laat zien: de atlas-route liet
`tint` vallen (het hele spel rende wit), en een animatie die over twee sheets viel
verloor frames. Beide zijn opgelost; zie `assets/sprites/README.md`.

**Keys staan per personage**, niet per vorm (`astra/pip/idle`, `enemy/lancer`). Een
artist tekent toch per personage, en twee Astra van dezelfde vorm moeten er verschillend
uitzien.

## 9. Juice-checklist (elke actie)

- [ ] Squash & stretch
- [ ] Particles bij impact
- [ ] Hitstop (2–6 frames)
- [ ] Screenshake (directioneel, decay)
- [ ] Flash (wit 1 frame op de getroffen entity)
- [ ] Geluid met pitch-variatie
- [ ] Nummer dat omhoog drijft
- [ ] Trail achter alles wat beweegt

## 10. Loadout

Eén hoofd-Astra plus twee steunslots. Steun vecht niet mee maar geeft stats en
leent zijn element aan je treffers, op een kans die meeschaalt met zeldzaamheid
en sterren. Zo bouw je een combinatie in plaats van een stapel getallen, en
heeft elke Astra in je verzameling een rol.

De steunbonus is een formule (`systems/Loadout.js`), geen tabel: elke nieuwe
Astra is gebalanceerd zodra hij bestaat.

## 11. Roadmap

- [x] v0.1 Engine + render-abstractie + save
- [x] v0.2 Run-gameplay: vessel, enemies, waves, upgrade-kaarten, bosses
- [x] v0.3 Gacha + collectie + economie
- [x] v0.4 Meta: dailies, seeds, share card
- [x] v0.5 Audio, polish, PWA
- [x] v0.6 Onboarding, omgeving met biomes, elementen en passives
- [x] v0.7 Prestaties, proefvlucht, Starpass
- [x] v0.9 Loadout met steun-Astra
- [x] v0.10 Eigen silhouet per Astra en per vijand, bestiarium, bak-tool voor
      atlassen — de sprite-swap is end-to-end aangetoond
- [x] v0.11 Roster naar 26 met vier nieuwe wapenpatronen, vierde baas, rangen
      op de sharekaart, debuutbanner, verzamelkaart, anomalieën
- [ ] v1.0 Echte sprite-art in dat formaat
- [ ] later Vessel-skins uit de Starpass, echte betaalprovider, server-leaderboard
