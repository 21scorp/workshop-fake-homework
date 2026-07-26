# Sprite atlassen

Deze map is leeg — en dat is de bedoeling. Het spel draait nu volledig op
**procedurele vector-art**, maar elke tekening gaat al door de
`AssetRegistry` heen. Zodra hier een atlas ligt, gebruikt het spel die
automatisch. Er hoeft geen enkele regel gameplay-code aangepast te worden.

## Zo zet je sprites erin

1. Exporteer een sprite sheet + JSON (TexturePacker "JSON hash" werkt direct).
2. Leg beide bestanden hier neer als `core.png` en `core.json`.
3. Klaar. `src/main.js` roept al `Assets.loadAtlas('./assets/sprites/core.json')`
   aan bij het opstarten en negeert het stilletjes als het bestand er niet is.

## Formaat

```jsonc
{
  "image": "core.png",
  "scale": 1,                       // sheet-pixels per virtuele unit (2 = @2x)
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

## Welke keys moeten er zijn

De registry valt per key terug op de procedurele tekening, dus je kunt
**incrementeel** overstappen: zet er eerst één Astra in, kijk of het klopt,
ga dan verder.

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
- **Tint**: procedurele art krijgt zijn kleur van de entity. Een atlas-sprite
  niet — teken de kleuren er dus in. Wil je één sprite voor meerdere elementen
  hergebruiken, teken hem dan in grijstinten en zet `tintMode: 'multiply'` aan
  in de draw-call.
- **Hit-flash** werkt automatisch: de registry maakt een wit silhouet van het
  frame en blend dat additief. Geen extra frames nodig.
- **Achtergrond transparant**, geen premultiplied alpha.
- Houd silhouetten leesbaar op **32px**. Dat is de echte maat op een telefoon.
