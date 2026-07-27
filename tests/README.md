# Tests

**Het spel zelf heeft geen dependencies.** Deze map wel: de tests draaien een
echte browser, want dat is de enige manier om te controleren wat een speler
werkelijk ziet. Canvas-rendering, layout op vier schermformaten, en of een
profiel van een oude versie nog migreert — daar helpt een unit test niet bij.

```bash
npm install                 # alleen playwright-core, alleen voor tests
npx http-server -p 8080 -c-1 .   # in een tweede terminal
npm test                    # QA-sweep
npm run balance             # pacing-meting met een auto-player
```

Configuratie via omgevingsvariabelen:

| Variabele | Standaard | Betekenis |
|---|---|---|
| `AF_URL` | `http://127.0.0.1:8080/index.html` | waar het spel draait |
| `AF_CHROME` | auto | pad naar een Chromium-binary |
| `AF_SECONDS` | `150` | speelduur voor de balanstest |

## qa.mjs

Zesentwintig controles over de paden die je bij normaal doorklikken mist:

- layout op 360×640, 430×932, tablet en desktop, plus horizontale overflow
- `?s=CODE` deeplinks starten de juiste run en ruimen de adresbalk op
- dezelfde seed levert twee keer identieke golven op — de basis van de
  dagelijkse seed en van elke gedeelde uitdaging
- pauzeren, hervatten, run verlaten
- sterren verhogen, mock-aankoop, export/import van een profiel
- migratie van een schema-v1 profiel zonder verlies
- `prefers-reduced-motion`
- opstarten met een `localStorage` die gooit (privémodus)

Elke controle faalt ook op een console-fout, dus een stille exception in een
scherm haalt de suite neer.

## balance.mjs

Geen test maar een meetinstrument. Een bot speelt het echte spel in de echte
engine en rapporteert de tijdlijn: golf, level, kills, score, HP, aantal
vijanden, schade en framerate per vijf seconden.

Dat is hoe drie problemen gevonden zijn die je niet uit de code kunt lezen:
golven die veertig seconden stilstonden, vijanden die buiten bereik bleven
rondcirkelen, en een kill-rate die te laag was voor het genre.

Draai hem opnieuw na elke balanswijziging.
