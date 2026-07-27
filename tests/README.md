# Tests

**Het spel zelf heeft geen dependencies.** Deze map wel: de tests draaien een
echte browser, want dat is de enige manier om te controleren wat een speler
werkelijk ziet. Canvas-rendering, layout op vier schermformaten, en of een
profiel van een oude versie nog migreert — daar helpt een unit test niet bij.

```bash
npm install                 # alleen playwright-core, alleen voor tests
npx http-server -p 8080 -c-1 .   # in een tweede terminal
npm test                    # qa.mjs + systems.mjs
npm run test:qa             # alleen de QA-sweep
npm run test:systems        # alleen de systeemsweep
npm run balance             # pacing-meting met een auto-player
```

Configuratie via omgevingsvariabelen:

| Variabele | Standaard | Betekenis |
|---|---|---|
| `AF_URL` | `http://127.0.0.1:8080/index.html` | waar het spel draait |
| `AF_CHROME` | auto | pad naar een Chromium-binary |
| `AF_SECONDS` | `150` | speelduur voor de balanstest |

## qa.mjs

Negenentwintig controles over de paden die je bij normaal doorklikken mist:

- layout op 360×640, 430×932, tablet en desktop, plus horizontale overflow
- `?s=CODE` deeplinks starten de juiste run en ruimen de adresbalk op
- dezelfde seed levert twee keer identieke golven op — de basis van de
  dagelijkse seed en van elke gedeelde uitdaging
- pauzeren, hervatten, run verlaten
- een nieuwe speler opent op een banner die hij kan trekken, met zijn gratis
  dagelijkse summon meteen in beeld
- sterren verhogen, mock-aankoop, export/import van een profiel
- migratie van een schema-v1 profiel zonder verlies
- `prefers-reduced-motion`
- opstarten met een `localStorage` die gooit (privémodus)

Elke controle faalt ook op een console-fout, dus een stille exception in een
scherm haalt de suite neer.

## systems.mjs

`qa.mjs` klikt door schermen; deze sweep vuurt de systemen af die één
speelsessie nooit raakt. Eén run gebruikt één wapenpatroon en één ultimate —
de andere veertien patronen en twintig ultimates hebben dan nog nooit
gedraaid. En juist die drie subsystemen falen *stil*: `Sfx` slikt fouten,
een ultimate die gooit wordt opgevangen, en een AI-tak die niets doet ziet er
precies zo uit als een AI-tak die klaar is.

Daarom draait dit bestand alles één keer, en faalt het ook op een
`console.warn` uit `[audio]`, `[ult]` of `[assets] no sprite`:

- de AudioContext wordt met een echte muisklik ontgrendeld — zonder dat
  gebaar bewijzen twintig geluiden niets
- alle geluiden, plus het reveal-geluid per zeldzaamheid
- alle wapenpatronen en alle ultimates op ster 5, dus inclusief de echo-tak
- alle vijandtypes spawnen en updaten, en alle schietende types vuren echt
- alle bossen in elke fase
- alle kaarten tot hun maximum, met een NaN-sweep over de modifiers
- alle Astra tekenen, en hun verwijzingen naar patronen, ultimates en
  elementen bestaan echt
- 60 000 gesimuleerde pulls: de effectieve Stellar+-rate ligt boven de
  basisrate en geen enkele reeks overschrijdt de harde pity
- loadout, skins en runbeloningen: de steunbonus stijgt met zeldzaamheid en
  sterren, de leider kan nooit in zijn eigen steunslot staan, een skin die je
  niet meer verdient wordt vanzelf weer vergrendeld, en geen enkele beloning
  wordt negatief of NaN
- alle 34 prestaties evalueren tot een geldig getal, op een leeg én een
  maximaal profiel — `list()` vangt een gooiende predicate af en meldt 0, dus
  een kapot doel ziet er eeuwig uit als een onverdiend doel
- de dagelijkse laag: streak-claim, drie unieke opdrachten die door runs heen
  optellen, de gratis pull, beide takken van de proef-Astra, en een stabiele
  seed
- de drie beloftes van de Starpass: het gratis spoor keert uit tot waar je
  staat, later kopen keert met terugwerkende kracht uit, en twee keer ophalen
  betaalt niet twee keer
- de muziek volgt het scherm en geeft de bazentrack terug
- de rangen lopen op, en de sharekaart rendert voor een lege én een
  maximale run

De sweep lost tussendoor level-ups op. Twintig ultimates achter elkaar veegt
het scherm leeg, en dat is XP: de run parkeert dan in `levelup` en simuleert
niet meer. Zonder die stap meet een latere controle een bevroren wereld en
geeft ze het verkeerde subsysteem de schuld — precies hoe "vijanden schieten
niet" hier als eerste vals alarm boven kwam.

## balance.mjs

Geen test maar een meetinstrument. Een bot speelt het echte spel in de echte
engine en rapporteert de tijdlijn: golf, level, kills, score, HP, aantal
vijanden, schade en framerate per vijf seconden.

Dat is hoe drie problemen gevonden zijn die je niet uit de code kunt lezen:
golven die veertig seconden stilstonden, vijanden die buiten bereik bleven
rondcirkelen, en een kill-rate die te laag was voor het genre.

Draai hem opnieuw na elke balanswijziging.
