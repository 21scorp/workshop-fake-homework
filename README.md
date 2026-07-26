# ASTRAFALL

**Eén duim. Zestig seconden. Alles op het spel.**

Een verticale one-thumb bullet-heaven roguelite met gacha, gebouwd voor
telefoons en voor verticale video. Geen build-stap, geen dependencies, geen
framework — open `index.html` en het draait.

---

## Direct spelen

```bash
# elke statische server werkt
npx http-server -p 8080 -c-1 .
# → http://localhost:8080
```

Of zet de repo op GitHub Pages; er valt niets te bouwen.

> ES-modules vereisen `http://`. Het bestand rechtstreeks openen met `file://`
> wordt door de browser geblokkeerd.

---

## De loop

```
RUN (60-120s)  →  DOOD  →  BELONING  →  SUMMON  →  STERKER  →  RUN
   ↑                                                             │
   └───────────────────── "nog één keer" ────────────────────────┘
```

Je sleept met één duim, je Astra vecht automatisch, en elke level-up dwingt je
tot een keuze uit drie kaarten. Je gaat dood. Je krijgt Stardust. Je summont.
Je doet het nog een keer.

## Wat het viraal moet maken

| Hook | Waarom het werkt |
|---|---|
| **Dagelijkse seed** | Iedereen ter wereld speelt dezelfde run. Direct vergelijkbaar, dus duet-baar. |
| **`?s=CODE` links** | Deel een code, je vriend krijgt exact jouw golven. Geen server nodig. |
| **Share card** | 1080×1920 PNG, klaar voor Stories en TikTok, met je seed groot in beeld. |
| **Rarity reveal** | De kleur van de straal verraadt de zeldzaamheid één tel voor de onthulling. Dat is precies waarom een pull kijkbaar is. |
| **Kaartkeuze** | Drie kaarten, één keuze. Comment-bait: "welke pak jij?" |

---

## Architectuur

```
src/
├── core/       engine: loop, renderer, input, audio, save, RNG, tweens
├── art/        procedurele vector-art, geregistreerd als sprite-keys
├── fx/         particles, screenshake, starfield
├── data/       roster, vijanden, kaarten, banners, winkel  (pure data)
├── game/       run-scene, wapens, ultimates, wave-director
├── systems/    gacha, economie, dailies, delen
└── ui/         DOM-overlay: router, schermen, HUD, gacha-cinematic
```

### Drie beslissingen die de rest verklaren

**1. Alles gaat door de sprite-registry.**
Geen enkele entity tekent zichzelf. Ze vragen een *key* op — `astra/wisp/idle`,
`enemy/tank`, `bullet/orb` — en `AssetRegistry` bepaalt hoe die key pixels
wordt: een frame uit een texture-atlas als die geladen is, en anders de
procedurele vector-tekening die er nu in zit. Beide paden respecteren dezelfde
afmetingen, pivots en animatietiming.

Sprites toevoegen is dus: een PNG en een JSON in `assets/sprites/` zetten. Nul
gameplay-code raakt aangetast. Zie `assets/sprites/README.md` voor het formaat
en de volledige lijst met keys.

**2. Runs zijn deterministisch.**
Eén seeded RNG (xoshiro128\*\*) voedt alles wat de uitkomst bepaalt: golven,
formaties, drops, kaarttrekkingen. Cosmetische willekeur draait op een aparte
stream. Twee spelers met dezelfde seed vechten letterlijk hetzelfde gevecht.
Dat is geen technisch detail maar het fundament van de dagelijkse seed en van
elke gedeelde uitdaging.

**3. Er zitten geen audiobestanden in.**
Elk geluid wordt op het moment zelf gesynthetiseerd uit oscillatoren, en de
muziek is een generatieve sequencer die reageert op wat er gebeurt: de
intensiteit loopt op met de golf, de baslijn valt weg als je sterft, de
gacha-build heeft zijn eigen toonsoort. Dat scheelt niet alleen laadtijd — het
laat de toonhoogte van een pickup meestijgen met je combo, wat met samples
gedoe zou zijn.

---

## Gacha

Alle percentages staan in het spel, op de banner, in gewone taal. Niet omdat
een store dat eist, maar omdat iemand die de kansen begrijpt vaker pullt en
iemand die zich bekocht voelt vertrekt.

| Rarity | Rate | Kleur |
|---|---|---|
| Ultra | 0.5 – 1.0% | prisma |
| Stellar | 2.8 – 4.5% | amber |
| Superior | 12 – 14.5% | violet |
| Rare | 30% | cyaan |
| Common | 50 – 54.7% | slate |

- **Soft pity** vanaf pull 60/65: de Stellar+ kans klimt lineair naar 100%.
- **Hard pity** op 75/80.
- **×10** garandeert minimaal één Superior.
- **50/50** (75/25 op limited): een off-banner Stellar+ maakt de volgende
  gegarandeerd rate-up. Twee keer achter elkaar verliezen kan niet.
- **Dubbels** worden Echoes en Stardust. Niets is verspild.

De roller (`src/systems/Gacha.js`) is puur: geef hem een profiel, een banner en
een RNG en hij geeft resultaten terug. Uitdelen is een aparte stap, zodat de
onthullingsanimatie eerst kan spelen.

## Monetisatie

Er wordt op dit moment **niets** afgerekend. Elke SKU loopt via
`PaymentProvider` in `src/data/shop.js`, en de enige aangesloten provider is
een mock die het aankoopproces lokaal simuleert. Stripe, RevenueCat of App
Store IAP aansluiten is één interface met drie methodes implementeren; de UI,
de entitlements en de uitgifte blijven zoals ze zijn.

Uitgangspunten die in de catalogus zitten ingebakken:

- Geen SKU verkoopt kracht die je niet ook kunt verdienen. Geld koopt tijd.
- Prijzen tonen hun eigen waarde per euro, zodat de "beste deal"-claim
  controleerbaar is.
- De battle pass heeft een gratis spoor dat op zichzelf de moeite waard is.
- Geen timers die je kunt afkopen — dat is een belasting op ongeduld, geen
  product.

---

## Ontwikkelen

Er is geen buildstap en er zijn geen dependencies. Bewerken, verversen, klaar.

```
index.html            de enige pagina
styles/               base.css (tokens) · ui.css (chrome) · screens.css
src/main.js           bootstrap; verder zit hier geen spellogica
sw.js                 offline shell
manifest.webmanifest  PWA
```

Handig tijdens het spelen: `window.ASTRAFALL` geeft toegang tot `save`,
`Assets`, `bus`, de huidige `scene` en de audio-engines.

```js
ASTRAFALL.save.profile.currency.shards = 5000   // valuta
ASTRAFALL.Assets.report()                       // atlas of procedureel?
ASTRAFALL.scene.director.wave = 4               // golf overslaan
ASTRAFALL.Assets.useAtlas = false               // atlas tijdelijk negeren
```

Zet **FPS tonen** aan onder Instellingen voor een frametijd-meter.

### Toevoegen van een Astra

1. Een entry in `src/data/astra.js`. `form` bepaalt welke silhouet-familie hij
   gebruikt en dus welke sprite-keys.
2. Als het wapenpatroon nieuw is: een functie in `PATTERNS` in
   `src/game/Weapons.js`.
3. Als de ultimate nieuw is: een recept in `RECIPES` in `src/game/Ults.js`,
   het liefst samengesteld uit bestaande primitieven.

Meer is er niet. Banners pikken hem automatisch op via de rarity-pool.

---

## Compatibiliteit

Getest in Chromium op mobiele viewports. Vereist ES-modules, canvas2d en
WebAudio. `localStorage` is optioneel — zonder werkt het spel gewoon, alleen
zonder voortgang te bewaren, en dat wordt eerlijk gemeld.

Respecteert `prefers-reduced-motion`, en er is een aparte instelling om
schermflitsen en camera-shake te dempen.

## Status

v0.9 — speelbaar van begin tot eind: run, gacha, collectie, winkel, dailies,
delen. De volgende stap is de sprite-atlas; het spel staat er al klaar voor.

Zie `DESIGN.md` voor de volledige designbijbel.
