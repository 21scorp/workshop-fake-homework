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

Eenendertig controles over de paden die je bij normaal doorklikken mist:

- layout op 360×640, 430×932, tablet en desktop, plus horizontale overflow
- `?s=CODE` deeplinks starten de juiste run en ruimen de adresbalk op
- dezelfde seed levert twee keer identieke golven op — de basis van de
  dagelijkse seed en van elke gedeelde uitdaging
- pauzeren, hervatten, run verlaten
- een nieuwe speler opent op een banner die hij kan trekken, met zijn gratis
  dagelijkse summon meteen in beeld
- sterren verhogen, mock-aankoop, export/import van een profiel
- migratie van een schema-v1 profiel zonder verlies
- de langste kaartregel van het hele dek blijft binnen twee regels op een
  telefoon van 360 breed, en de kaartkiezer blijft heel in beeld. De doos
  groeit mee, dus afkappen is niet de faalmodus — uitdijen is het
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
- elk getal in een ultimate-tekst staat ook echt in zijn recept: zes
  getallen deden dat niet, waaronder een ring die vier seconden beloofde en
  er zes draaide, en een salvo dat twee tellen claimde en in minder dan één
  landt. De uitzonderingen zijn expliciet en beperkt tot aantallen die het
  recept structureel uitdrukt in plaats van als argument
- alle vijandtypes spawnen en updaten, en alle schietende types vuren echt
- alle bossen in elke fase
- alle kaarten tot hun maximum, met een NaN-sweep over de modifiers, plus een
  aparte controle dat de nieuwste kaarten ook echt *effect* hebben — de
  NaN-sweep bewijst dat een kaart de modifier-tas niet sloopt, niet dat die
  tas ooit gelezen wordt
- elke kaarttekst klopt op elke stapel: geen `+0%` op de eerste aanbieding, en
  een kaart die stapelt moet ook iets anders zeggen zodra je er één hebt —
  tenzij zijn regel een optelling is die elke keer even waar is. Twee kaarten
  beloofden letterlijk niets bij de eerste aanbieding en twee logen zodra je
  ze stapelde; niets daarvan gooit een fout
- de zeven winkelupgrades leveren precies het getal dat op de knop staat —
  gemeten aan de modifier-tas na `applyMetaUpgrades`, niet afgelezen uit de
  bron. Cores zijn de enige valuta die je niet terugkrijgt
- alle Astra tekenen, en hun verwijzingen naar patronen, ultimates en
  elementen bestaan echt
- een veegcontrole over álle datavelden — vijanden, bazen, wapenconfig en de
  modifier-tas — op velden die niemand leest. Twee bugs in deze build hadden
  precies die vorm, en geen van beide gooide ooit een fout. De controle zoekt
  op property-toegang (`.veld`), nooit op de kale naam, zodat een definitie
  zichzelf niet als gelezen kan aanmerken
- elke elite-modifier wordt ergens gelezen, en de genezende aura geneest ook
  echt — met een patiënt die taai genoeg is om de puls te halen, want een
  controle die slaagt omdat het doelwit stierf bewijst niets
- elke passive wordt ook echt waargemaakt: door een tak in de code, of door
  een veld in het wapen — en dan wordt dat veld gecontroleerd. Een passive
  zonder implementatie is een personage waarvan het hele verkoopargument een
  leugen is, en niets gooit daarbij een fout
- 60 000 gesimuleerde pulls: de effectieve Stellar+-rate ligt boven de
  basisrate en geen enkele reeks overschrijdt de harde pity
- en 20 000 pulls per banner door de *echte* roller: het aandeel rate-up landt
  op 1/(2−boost) — het getal dat volgt uit de regel die op het scherm staat —
  nooit twee keer op rij naast de rate-up, en niets heet rate-up dat niet op de
  banner staat. De pity-curve die de UI beschrijft is dezelfde die de roller
  gebruikt: vlak tot de zachte grens, stijgend daarna, exact 100% op de harde
- alle tien anomalieën veranderen echt iets, stapelen door vermenigvuldiging,
  en worden gezaaid getrokken zonder zichzelf te herhalen
- loadout, skins en runbeloningen: de steunbonus stijgt met zeldzaamheid en
  sterren, de leider kan nooit in zijn eigen steunslot staan, een skin die je
  niet meer verdient wordt vanzelf weer vergrendeld, en geen enkele beloning
  wordt negatief of NaN
- alle 36 prestaties evalueren tot een geldig getal, op een leeg én een
  maximaal profiel — `list()` vangt een gooiende predicate af en meldt 0, dus
  een kapot doel ziet er eeuwig uit als een onverdiend doel
- elk getal in een prestatietekst staat ook in zijn voorwaarde, en elke
  prestatie beloont echt iets. Een doel dat "golf 15" zegt en op 12 test popt
  te vroeg; op 20 popt hij nooit — geen van beide gooit een fout
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
