# Sprite atlassen

Het spel draait op **procedurele vector-art**, maar elke tekening gaat al door
de `AssetRegistry`. Zodra hier een atlas ligt die in `atlases.json` genoemd
wordt, gebruikt het spel die. Er hoeft geen regel gameplay-code aangepast te
worden.

Dat is geen belofte meer maar een gemeten feit: `tools/bake-atlas.mjs` bakt de
hele vector-art naar een echte atlas, en het spel draait daar volledig op —
identieke posities, identieke animatietiming, nul procedurele draws. Wat die
eerste bak óók aan het licht bracht, staat onder "Tint" hieronder.

## Zo zet je sprites erin

1. Exporteer een sprite sheet + JSON (TexturePacker "JSON hash" werkt direct).
2. Leg beide bestanden hier neer, bijvoorbeeld `core.png` + `core.json`.
3. Zet de JSON-naam in `atlases.json`. Meer dan één atlas mag; ze worden in
   volgorde geladen en een animatie mag over meerdere sheets verdeeld zijn.

Je kunt **incrementeel** overstappen: de registry valt per key terug op de
vectortekening, dus zet er eerst één Astra in, kijk of het klopt, ga dan door.

## De bak-tool

```bash
npx http-server -p 8080 -c-1 .          # in een tweede terminal
node tools/bake-atlas.mjs               # 2x, 2048px pagina's
node tools/bake-atlas.mjs --only enemy/ --name enemies --scale 1
```

De tool start het spel headless, tekent elke geregistreerde key door zijn
eigen procedurele tekenaar, snijdt elk frame terug tot waar echt inkt zit en
pakt ze in een atlas met precies het JSON dat `loadAtlas` verwacht.

Twee dingen die de output vormgeven:

- **Bleed.** Elke tekenaar zet glow ver buiten zijn nominale doos — dat is wat
  de art bioluminescent laat lezen. Bakken op exact `w×h` snijdt de halo eraf
  en levert een zichtbare rechthoek op. Elk frame krijgt daarom een doos van
  1,85× rond zijn anchor, en de atlas legt die maat vast.
- **Trim.** Die 1,85× is 3,4× zoveel oppervlak, grotendeels lege uitloop. Elk
  frame wordt teruggesneden tot zijn alfa-bounding-box, met de pivot mee. Zelfde
  pixels op het scherm, een derde minder download.

De volle bak is ~17 MB aan referentie-art en staat **niet** in de repo. Wat er
wel staat is `pickups.json` + `pickups.png` (300 KB): een echte, kleine atlas
die `tests/systems.mjs` laadt om de hele swap-route te controleren. Die staat
bewust niet in `atlases.json` — het uitgeleverde spel blijft procedureel,
want vector-art hérkleurt per element, per zeldzaamheid en per romp-palet en
gebakken frames kunnen dat niet.

## Formaat

```jsonc
{
  "image": "core.png",
  "scale": 1,                       // sheet-pixels per virtuele unit (2 = @2x)
  "tintMode": "multiply",           // optioneel; zie "Tint" onderaan
  "frames": {
    "astra/ember/idle/0": {
      "frame": { "x": 0, "y": 0, "w": 64, "h": 64 },
      "pivot": { "x": 0.5, "y": 0.5 }
    },
    "astra/ember/idle/1": { "frame": { "x": 64, "y": 0, "w": 64, "h": 64 } }
  },
  "animations": {
    "astra/ember/idle": {
      "frames": ["astra/ember/idle/0", "astra/ember/idle/1"],
      "fps": 12,
      "loop": true,
      "w": 64, "h": 64,
      "pivot": { "x": 0.5, "y": 0.5 }
    }
  }
}
```

Een key die maar één frame heeft mag direct in `frames` staan zonder
animatie-entry.

Een animatie mag frames noemen die op een **ander** sheet staan. De registry
parkeert zo'n animatie tot elk frame dat hij noemt bestaat; hij wordt pas een
key als de set compleet is. Zonder dat zou elk sheet een halve lijst
registreren en zou de laatst geladene winnen — een idle van zes frames die er
twee afspeelt. `Assets.report().unresolved` laat zien wat er nog ontbreekt.

## Welke keys moeten er zijn

### Astra
Voor elke vorm (`orb`, `blade`, `wisp`, `beast`, `construct`, `bloom`,
`serpent`, `prism`):

```
astra/<vorm>/idle       72×72   8 frames @ 10fps   loop
astra/<vorm>/cast       72×72   6 frames @ 14fps   loop
astra/<vorm>/hurt       72×72   2 frames @ 12fps   geen loop
astra/<vorm>/portrait  200×200  1 frame            (collectie/summon)
```

### Speler
```
vessel/idle   68×68   1 frame
vessel/hurt   68×68   1 frame
vessel/boost  68×68   1 frame
```

### Vijanden
```
enemy/drone     44×44   6 frames @ 12fps
enemy/swarm     26×26   6 frames @ 16fps
enemy/tank      74×74   6 frames @  8fps
enemy/shooter   52×52   6 frames @ 10fps
enemy/splitter  56×56   8 frames @ 12fps
enemy/weaver    50×50   8 frames @ 14fps
enemy/elite     80×80   8 frames @ 12fps   (aura-overlay, wordt ónder de vijand getekend)
```

### Bosses
```
boss/warden    200×200   8 frames @ 10fps
boss/devourer  210×210   8 frames @ 10fps
boss/nova      190×190   8 frames @ 12fps
```

### Projectielen & pickups
```
bullet/basic  12×12    bullet/shard  14×14    bullet/orb  20×20 (4f @18fps)
bullet/enemy  16×16    bullet/laser   8×8
pickup/prism  18×18 (6f)   pickup/heart  26×26 (6f)
pickup/magnet 26×26 (6f)   pickup/bomb   28×28 (6f)
pickup/coin   22×22 (8f)
```

## Belangrijk voor de artist

- **Pivot** = het draaipunt én de positie waar de entity "staat". Standaard
  midden (0.5, 0.5). De vessel en de bosses draaien om dat punt.
- **Afmetingen** zijn in virtuele units. Het spel rendert op een virtueel
  canvas van 720 breed, dus een vijand van 44 units is ongeveer 6% van de
  schermbreedte. Teken op @2x of @3x en zet `scale` navenant.
- **Tint** — lees dit voordat je begint te tekenen. Procedurele art krijgt zijn
  kleur van de entity: dezelfde drone is rood, cyaan of violet afhankelijk van
  wat er in de golf zit. Een atlas-frame is één plaatje. De eerste echte bak
  liep daar frontaal op: geometrie en timing klopten tot op de pixel, en het
  hele spel rende **wit**, omdat de atlas-route `tint` liet vallen.

  Nu kan een sheet zeggen dat hij herkleurbaar is:

  ```jsonc
  { "image": "core.png", "scale": 2, "tintMode": "multiply", ... }
  ```

  Teken dan een **wit master**: vorm en schaduw in wit/grijs, geen eigen kleur.
  De registry vermenigvuldigt de entity-kleur erin en houdt de shading intact.

  Wat multiply níét kan: wit blijven. Een witte glans op een groen kristal
  wordt groen, want multiply kan niet lichter maken dan de bron. Wil je die
  glans behouden, lever dan gewoon gekleurde frames per variant en laat
  `tintMode` weg — de registry blit ze dan onbewerkt.
- **Hit-flash** werkt automatisch: de registry maakt een wit silhouet van het
  frame en blend dat additief. Geen extra frames nodig.
- **Achtergrond transparant**, geen premultiplied alpha.
- Houd silhouetten leesbaar op **32px**. Dat is de echte maat op een telefoon.
