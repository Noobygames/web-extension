# Refactoring-Plan

Stand: 2026-08-27, Branch `master` (`33c1485`).

Plan sagt: **welche Reihenfolge** Codebasis entzerrt, **woran erkennbar** dass Phase fertig. Ersetzt keine Feature-Roadmap (`docs/roadmap.md`), keine Performance-Analyse (`docs/performance.md`) — sagt, wie Code dahin kommt dass beides wartbar bleibt.

---

## 0. Ausgangslage in Zahlen

Zahlen aus aktuellem `master` gemessen, nicht geschätzt.

| Messung                                | Wert                                                               |
| :------------------------------------- | :----------------------------------------------------------------- |
| `src/**` ohne `libs/`                  | ~~33.859~~ **33.580** Zeilen (Phase 1)                             |
| davon `src/ogCore.js`                  | ~~19.024~~ → **1.846 Zeilen**, **40 Methoden** (Phase 3)           |
| Testabdeckung                          | 391 → **516 Tests**; `ogCore.js` erstmals dabei (Rechenkerne)      |
| Dateien ohne jede Abdeckung            | vor Phase 2: 34, darunter `ogCore.js` und `background.js`          |
| `npm run check`                        | ~~404 Fehler~~ **0** — Phase 0 erledigt, gatet in CI               |
| `document.querySelector*` in ogCore.js | 424                                                                |
| `this.json.*` vs. `OGBIData.*`         | ~~755 vs. 120~~ **0 vs. alles** — ein Zugriffsweg (Phase 4)        |
| `this.saveData()`                      | ~~82 Aufrufe~~ **0** — Methode gelöscht (Phase 4)                  |
| jQuery `$(…)`                          | 87 Stellen                                                         |
| `setInterval`                          | 15 Stellen, drei davon reine Polling-Schleifen auf ein Promise     |
| Tote Methoden in ogCore.js             | ~~13~~ 0 (Phase 1); plus `autoHarvest()`, in Phase 3 nachgereicht  |
| `TODO`/`FIXME`/`WIP`/`@deprecated`     | 41 Marker in 7 Dateien — vollständige Liste in Abschnitt 3         |
| Toter Zweitbaum im Repo                | `local-extension-backup/`, 123 Dateien, 33.535 JS-Zeilen, getrackt |

Vier größte Methoden allein: `betterFleetDispatcher()` 1.545 Zeilen, `minesStats()` 1.264, `settings()` 899, `technoDetail()` 886. Zusammen 4.594 Zeilen in vier Funktionen.

---

## 1. Leitplanken — gelten in jeder Phase

**Nicht verhandelbar.** Begrenzen, was Refactoring überhaupt darf:

1. **AGENTS.md schlägt jede Architektur-Präferenz.** Kein Refactoring erhöht Zahl der Hintergrund-Requests pro Seitenaufruf, bündelt Aktionen, verzögert etwas zeitlich oder macht Code unlesbar. Wer Datei aufteilt, teilt Compliance-Kommentare mit auf.
2. **Kein Minifizieren, kein Obfuskieren** — Review der Origin-Toolentwickler liest Quelltext (`AGENTS.md` §0). Rollup-Build bleibt `treeshake: false`, ohne Terser.
3. **`test/bundle.test.js` muss grün bleiben.** Bündeln bricht Modul-Auswertungsreihenfolge lautlos; dieser Test merkt es als einziger. Jede Verschiebung von Top-Level-Code dagegen prüfen.
4. **`OGBIData`-Write-Through-Contract bleibt.** `OGBIData.options = {...}` persistiert, `OGBIData.options.foo = 1` nicht. Dokumentiert und mit `TRAP:`-Tests festgenagelt (`docs/performance.md`, „Coalescing the store writes — reverted"). Wer daran arbeitet, reduziert **Zahl** der Schreibvorgänge, verzögert sie nicht.
5. **Nichts im Page-Context liest DOM zur Modul-Auswertungszeit.** `ogCore.js` wird bei `document_start` injiziert, `<head>` dann leer. Neue Module folgen Lazy-Muster von `OgamePageData` und `translate.js`.
6. **`src/manifest.json` und `src/manifest-firefox.json` immer im Paar ändern.**
7. **Jede Phase einzeln releasbar.** Kein „Big Bang"-Branch, drei Wochen offen.

---

## 2. Reihenfolge und Begründung

Reihenfolge nicht beliebig. Regel: **erst Sicherheitsnetz, dann Schnitte.**

```
Phase 0  Werkzeug reparieren        [ERLEDIGT]  -> Lint ist grün und gatet in CI
Phase 1  Toter Code + Delegaten     [ERLEDIGT]  -> 370 Zeilen weg, 123 Dateien untracked
Phase 2  Charakterisierungstests    [ERLEDIGT]  -> 485 Tests, 7 neue Fehler gefunden
Phase 3  ogCore.js aufteilen        [ERLEDIGT]  -> 19.024 -> 1.846 Zeilen
Phase 4  Store-Zugriff vereinheitl. [ERLEDIGT]  -> this.json weg, ein Weg zum Store
Phase 5  Seitenweises Code-Splitting[ERLEDIGT]  -> Page-Bundle 1.132 -> 472 KB
Phase 6  Altlasten & Doku-Drift     (laufend)
```

Phase 3 **ohne** Phase 2: klassischer Fehler bei 19k-Zeilen-Datei ohne Tests. Regression merkt man erst im Live-Universum.

**Quer dazu, jederzeit machbar** (hängt an keiner Phase, blockiert keine):

- Drei `universe.*`-Helfer an `universe.expirations.js` anschließen — Abschnitt 3.1.
- Neun der elf `KNOWN BUG:`-Tests einzeln fixen — Abschnitt 3.7. Andere zwei laufen in Phase 2 mit.

Abschnitt 3 = vollständige Marker-Inventur; jeder Marker dort einer Phase oder einem Quer-PR zugeordnet.

---

## 3. Bestandsaufnahme: `TODO`, `FIXME`, `WIP`, `@deprecated`

Vollständige Liste aus `src/`, `test/`, `scripts/`, `packaging.sh`, `Makefile` — ohne `src/libs/` (Fremdcode), ohne `local-extension*` (Phase 1, Problem E). **41 Marker in 7 Dateien**, 27 davon in `ogCore.js`.

Keiner wiederauffindbar notiert: kein Ticketbezug, kein Datum, kein Autor. Teil davon älter als Spielrelease, auf das er wartet.

Gruppiert nach **Ursache**, nicht nach Datei — sonst sieht man nicht, dass sechs davon dieselbe fehlende Verdrahtung beschreiben.

### 3.1 Cache-Ablauf im Content-Context — 6× derselbe TODO, Modul existiert bereits

| Datei                                      | Zeilen  | Text                                                |
| :----------------------------------------- | :------ | :-------------------------------------------------- |
| `ctxcontent/helpers/universe.alliances.js` | 9, 39   | „need validation / save cache expiration timestamp" |
| `ctxcontent/helpers/universe.highscore.js` | 55, 100 | dito (`filter {typesToUpdate}` / speichern)         |
| `ctxcontent/helpers/universe.players.js`   | 16, 37  | dito                                                |

**Kein Entwurfsproblem.** `src/ctxcontent/services/universe.expirations.js` existiert, hat `isUniverseExpired()` und `setUniverseExpiration()` — benutzt von genau **einem** Helfer, `universe.data.js`. Drei andere Helfer bekamen stattdessen Kommentar.

Folge im Betrieb: Allianz-, Highscore- und Spielerdaten in `chrome.storage.local` haben kein Ablaufdatum. Werden öfter geholt als nötig — jeder Hintergrund-Request erzeugt Aktivität (`AGENTS.md` §4) — oder veralten unbemerkt. Beides relevant, nicht kosmetisch.

→ **Einordnung: eigener kleiner PR, unabhängig von Phasen.** Drei Helfer auf `universe.expirations.js` umstellen, `universe.expirations.js` (heute 0 % Abdeckung) mittesten.

**Update (`refactoring-new.md` Phase A.3):** `universe.data.js`, der eine Nutzer von `universe.expirations.js`, war zum Zeitpunkt der Analyse oben selbst **unerreichbar** — kein Aufrufer im ganzen Repo, per Erreichbarkeitsanalyse bestätigt. Statt ihn zu löschen wurde er umgebaut: liefert jetzt rohen `serverData.xml`-Text, gecacht über `universe.expirations.js`/`universe.storage.js` mit fixer 24-h-TTL, erreicht über eine neue Bridge-Command `serverData.get` (`docs/context.content.commands.md`), einzige Aufrufstelle ist `OGBeyondInfinity.updateServerSettings()`. `universe.expirations.js` hat jetzt echte Testabdeckung (`test/ctxcontent/universe.data.test.js`) — der oben vorgeschlagene Anschluss der drei Helfer hat damit ein lebendes Vorbild, nicht mehr nur einen toten.

### 3.2 OGame-Versions-Altlasten — **ERLEDIGT (Phase 2)**

v12-Support gefallen. Alle vier Marker weg, zusammen mit 34 `isAtLeast_13_0_0`-Verzweigungen und den drei Codeblöcken dazu. Einzelheiten im Phase-2-Abschnitt; `isAtLeast_13_0_0` selbst bleibt als Startpfad-Warnung.

### 3.3 Produktionsberechnung — 8 TODOs, getesteter Zweitmotor existiert bereits

`updateEmpireProduction()` (`ogCore.js:12539`–`12818`, 279 Zeilen, mit `// WIP` überschrieben) trägt:

| Zeile       | Lücke                                                                                                                      |
| :---------- | :------------------------------------------------------------------------------------------------------------------------- |
| ~~`12542`~~ | `productionFactor = 1` — in Phase 2 als bewusste Konstante kenntlich gemacht, Begründung im Code. Die Lücke selbst bleibt. |
| `12598`     | Solarsatelliten-Energie wird nicht berechnet (`3: 0`)                                                                      |
| `12626`     | Ingenieur-Energie wird nicht berechnet (`3: 0`)                                                                            |
| `12686`     | „compute energy detailed production if used"                                                                               |
| `12718`     | Fusionsreaktor-Faktor fehlt                                                                                                |
| `12738`     | Crawler-Prozentsatz geraten statt berechnet                                                                                |
| `14123`     | Lifeform-Verbrauchsreduktion fehlt                                                                                         |
| `14373`     | „check if own population factor is needed"                                                                                 |

Gleichzeitig liegt in `src/util/productionEngine.js` Produktionsmodell mit **100 % Abdeckung** (`plasmaBonus`, `effectiveCrawlers`, `crawlerBonus`, `realProduction`, `productionBreakdown`) — benutzt an **einer** Stelle, `realProductionTooltip()`. Dritte Kopie der Crawler-Mathematik in `roiMine()` (`ogCore.js:16599`–`16688`).

Drei Modelle, eines getestet, Löcher stecken in den zwei ungetesteten.

→ **Einordnung: Phase 3, Modul 1 (`util/gameFormulas.js`) und Modul 8.** Beim Herausziehen wird `productionEngine.js` einzige Quelle; acht TODOs werden acht Tests, die zunächst heutiges (unvollständiges) Verhalten festschreiben. Erst danach Physik ergänzen, ohne zu raten was kaputtgeht.

### 3.4 `@deprecated`, aber überall benutzt

| Ort                        | Alias                                | Ersatz                        |
| :------------------------- | :----------------------------------- | :---------------------------- |
| `ogCore.js:140`            | `createDOM`                          | `DOM.createDOM`               |
| `ogCore.js:145`            | `createSVG`                          | `DOM.createSVG`               |
| `ogCore.js:151`            | `toFormatedNumber`                   | `Numbers.toFormattedNumber`   |
| `ogCore.js:156`            | `fromFormatedNumber`                 | `Numbers.fromFormattedNumber` |
| `ogCore.js:14081`          | `Element.prototype.html` / DOMPurify | globale Funktion              |
| `SpyReport.js:158`, `:171` | zwei Getter                          | — nicht benannt               |

Vier Modul-Aliase = Hauptgrund, warum `ogCore.js` sich nicht sauber schneiden lässt: datei-globale Kurznamen, die jede herausgezogene Datei mitnehmen müsste.

→ **Einordnung: Phase 3, mechanischer erster Schritt jedes Schnitts.** Wer Modul herauszieht, ersetzt darin Aliase durch Importe. Aliase in `ogCore.js` fallen weg, sobald letzte Nutzung weg. Für `SpyReport.js:158/171` fehlt Angabe, wodurch ersetzen — Autor muss klären, sonst Markierung wertlos.

### 3.5 Abgeschaltete Features, die noch im Startpfad hängen

- **Tooltip-Kette** (`ogCore.js:106`, `:1763`, `:14935`) — siehe Phase 1, Problem D. ~120 tote Zeilen, ein wirkungsloser Aufruf in `start()`.
- **`showTabTimer()`** — Aufruf in `start()` (`ogCore.js:1782`) auskommentiert, Methode (`:18704`, ~22 Zeilen) enthält siebenzeiligen TODO-Block: in Uhrbereich verschieben, OGame-Zeitstempel nutzen, Zeitzonen-Indikator und Ping-Anzeige integrieren, Performance-API statt eigener Messung, umbenennen, wieder aktivieren. Das ist **Feature-Entwurf im Kommentar**, kein TODO. Gehört nach `docs/roadmap.md` oder in Issue; Methode wird gelöscht.

→ **Einordnung: Phase 1 (löschen), Entwurf nach `docs/roadmap.md` umziehen.**

### 3.6 Einzelne, kleine, echte Aufgaben

| Ort                                      | Aufgabe                                                                                                                                                                    | Wohin                                            |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| `ogCore.js:12228`–`12232`                | `updateLifeform()`: `// WIP` + „temporary hack until code reworked to work with unique needLifeformUpdate" — setzt das Flag für **alle** Planeten zurück, statt pro Planet | Phase 3, Modul 8                                 |
| `ogCore.js:13699`                        | `checkDebris()`: „reuse code?, hide debris image with css?, align style"                                                                                                   | Phase 3, Modul 5                                 |
| `ogCore.js:14634`                        | „make throttle class for reuse it?" — Drosselung ist ad hoc eingebaut                                                                                                      | Phase 3, dann `util/`                            |
| `ogCore.js:16075`                        | PTRE-Team-Key: ungültiges Format wird **stillschweigend** geschluckt, Fehlertext fehlt                                                                                     | Phase 6, kleiner UX-Fix                          |
| `ogCore.js:19008`                        | „workaround for 'DOMPurify not defined' issue" — der `waitForDefinition`-Block im Boot                                                                                     | bleibt, aber Kommentar erklärt das _Warum_ nicht |
| `messages-analyzer/index.js:513`         | auskommentierter Deuterium-Parser                                                                                                                                          | Phase 1, Punkt 5                                 |
| `ctxcontent/helpers/universe.data.js:75` | „Need mapping implementation to lifeforms" — der einzige `universe.*`-TODO, der **nicht** zu 3.1 gehört                                                                    | eigener PR, zusammen mit 3.1                     |
| `scripts/install-local.mjs:61`           | erklärender Kommentar zu Firefox-Temporär-Add-ons                                                                                                                          | kein Handlungsbedarf                             |

### 3.7 Die andere Sorte Marker: `KNOWN BUG:` und `TRAP:` in den Tests

**Kein** Wildwuchs, sondern Repo-Konvention aus `docs/testing.md`: Tests, die absichtlich falsches Verhalten festschreiben, damit Fix als bewusste Änderung sichtbar wird. Aktuell **11 `KNOWN BUG:`** und **3 `TRAP:`**.

Drei `TRAP:`-Tests (`test/util/OGBIData.test.js:127`, `:187`, `:206`) beschreiben Write-Through-Contract und bleiben — Leitplanke 4 in Testform.

Elf `KNOWN BUG:`-Tests = echte Fehler mit bekanntem Ort:

| Datei                                      | Zeilen        | Kurz                                                                                                                             |
| :----------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------- |
| `test/util/service.callbackEvent.test.js`  | 46, 349, 366  | Bridge: `ReferenceError` ohne `chrome`; Token wird mit `"1"` überschrieben; Anfrage auf unbekanntes Token wird **nie** aufgelöst |
| `test/util/ogame.coordinate.test.js`       | 125, 138, 148 | Falscher Fehlertyp; `toNumber` ignoriert Instanztyp; `toString` liefert `undefined` statt zu werfen                              |
| `test/ctxcontent/universe.helpers.test.js` | 219, 235      | Formatiertes XML lässt die Parser abstürzen; Fehlerantwort kommt als `TypeError`                                                 |
| `test/util/OGBIData.construction.test.js`  | 56            | Beschädigter `localStorage`-Inhalt lässt den Import abstürzen                                                                    |
| `test/util/runContext.test.js`             | 103           | Unbekannter Browser wirft, statt einen Kontext zu melden                                                                         |
| `test/util/numbers.test.js`                | 64            | Präzision `0` wird ignoriert                                                                                                     |

Zwei davon mehr als Schönheitsfehler: **nie auflösende Promise** in Bridge (`service.callbackEvent.test.js:366`) hängt aufrufende Stelle dauerhaft, und **Absturz bei beschädigtem `localStorage`** (`OGBIData.construction.test.js:56`) heißt: eine kaputte Speicherung macht Extension unbenutzbar, ohne Selbstheilung.

→ **Einordnung: die zwei oben in Phase 2 mitnehmen** (Bridge und `OGBIData` werden dort ohnehin angefasst), restliche neun als eigene kleine PRs, jeweils „Fix + Präfix am Test entfernen", wie `docs/testing.md` vorschreibt. Kein stilles Löschen eines Tests.

### 3.8 Regel für neue Marker

Ab sofort: **`TODO` ohne Ticketbezug ist kein `TODO`, sondern Notiz an niemanden.** Neues Format, eine Zeile, prüfbar per Lint:

```js
// TODO(#123): kurze Beschreibung — Bedingung, unter der es fällig wird
```

Ohne Nummer: sofort machen oder gar nicht schreiben. ESLint-Regelsatz aus Phase 0 kann das über `no-warning-comments` erzwingen, sobald Altbestand abgearbeitet — vorher nicht, sonst ist Lint wieder rot und niemand schaut hin.

---

## Phase 0 — Werkzeug reparieren — **ERLEDIGT**

**Problem (Ausgangslage).** `npm run check` meldete 404 Fehler:

| Regel                   | Fehler |
| :---------------------- | -----: |
| `indent`                |    233 |
| `prettier/prettier`     |    158 |
| `quotes`                |      6 |
| `semi`                  |      1 |
| `no-redeclare`          |      2 |
| `no-extra-boolean-cast` |      2 |
| `no-useless-escape`     |      2 |

240 Fehler davon **selbst verursacht**: `.eslintrc.cjs` erweiterte `"prettier"` (schaltet genau diese Stilregeln ab) und schaltete danach im `rules`-Block `indent`, `quotes`, `semi` und `linebreak-style` wieder ein. Stritten mit Prettier, der dieselben Dinge über `prettier/prettier` durchsetzt. Ergebnis: Lint rot auf korrekt formatiertem Code, also schaute niemand hin, also fielen **6 echte Funde** nicht auf. CI-Test-Workflow übersprang Lint.

**Was gemacht wurde.**

1. **Vier redundante Stilregeln aus `.eslintrc.cjs` gelöscht.** `prettier/prettier` bleibt einzige Instanz für Stil. Kommentar an `extends`-Zeile hält fest, warum dort nichts wieder eingeschaltet werden darf. 404 → 164 Fehler, exakt die vorhergesagten 240. Mitgelöscht: wirkungsloser `overrides`-Block (`files`/`excludedFiles` ohne `rules` = No-op; `src/libs/` wird von `.eslintignore` ausgeschlossen).
2. **Fünf tatsächlich unformatierte Dateien formatiert** — nur diese fünf: `ctxcontent/services/analyzer/ExpeditionMessagesAnalyzer.js`, `ctxcontent/services/analyzer/SpyMessagesAnalyzer.js`, `ctxpage/messages/index.js`, `ctxpage/traderOverview/TraderImportExportPage.js`, `util/enum/itemImageID.js`. `ogCore.js` war bereits Prettier-konform, nicht angefasst.
3. **6 echte Funde behoben**, alle in `ogCore.js`, alle semantisch neutral:

   | Ort              | Fund                    | Änderung                                                                            |
   | :--------------- | :---------------------- | :---------------------------------------------------------------------------------- |
   | `4606`, `4630`   | `no-redeclare`          | `var data = $.parseJSON(data)` → `data = …`; `var` erzeugte hier keine neue Bindung |
   | `12005`, `12006` | `no-extra-boolean-cast` | `if (!!template.fleetSpeed)` → `if (template.fleetSpeed)`                           |
   | `18620` (2×)     | `no-useless-escape`     | `\"` in einem Template-Literal → `"`; identische Zeichenkette                       |

   Kein Fund war echter Bug — genau das ist der Punkt: vorher nicht sagbar, weil sie in 398 Phantomfehlern lagen.

4. **Lint scharf geschaltet** in `.github/workflows/test.yml`, eigener Schritt **nach** den Tests (Formatierungsverstoß soll kein echtes Testergebnis verdecken).

**Zwei Dinge zusätzlich, beide risikofrei.**

- `npm run check` deckt jetzt auch `scripts/*.mjs` ab, wie `npm run format` schon tat. `bundle.mjs` und `build-unpacked.mjs` sind buildkritisch und waren ungelintet. Waren bereits sauber — Lücke schließt sich ohne eine einzige Änderung an ihnen.
- `.prettierrc` bekommt `"endOfLine": "lf"` explizit. Prettiers Vorgabewert, ändert also nichts, hält aber Absicht fest, die vorher in der gelöschten `linebreak-style`-Regel steckte. Durchgesetzt ohnehin schon von `.gitattributes` (`* text=auto eol=lf`).

**Bewusst nicht geändert: `printWidth: 120` und `trailingComma: "es5"`.** Beide weichen von Prettiers Vorgabe (80 / `"all"`) ab, beide dürften laut Auftrag angefasst werden. Änderung würde aber kompletten Baum umformatieren, `ogCore.js` eingeschlossen — genau der Diff, den `CLAUDE.md` und Phase 0 („Risiko praktisch keins") vermeiden wollen. 120 Spalten = bewusste, dokumentierte Projektentscheidung. Falls doch gewünscht: eigener Commit, nichts anderes darin, und `.git-blame-ignore-revs` anlegen.

**Exit-Kriterium — erfüllt.** `npm run check` = 0 Fehler, `prettier --check` grün über `src`, `test`, `scripts`, Tests 391/391, Lint gatet in CI.

**Folge für Rest des Plans.** `no-warning-comments` (Abschnitt 3.8) jetzt technisch einschaltbar — aber erst, wenn Marker-Altbestand aus Abschnitt 3 abgearbeitet. Sonst Lint sofort wieder rot, ganzer Zweck dieser Phase weg.

---

## Phase 1 — Toter Code und Schein-Delegaten — **ERLEDIGT**

`src/ogCore.js`: 19.024 → **18.654 Zeilen** (−370). Getrackte Dateien: 315 → **192** (−123). Tests 391 → **395**, alle grün. Lint 0. Build läuft (`ogCore.js`-Bundle 1128 KB).

### Problem A — Methoden ohne Aufrufer

Neun der zehn geplanten wirklich tot und weg: `calcAvailableFret`, `cleanValue`, `convertDuration`, `generateGalaxyLink`, `getJSON`, `hasActivityChanged`, `recordActivityChange`, `recordLostConnectivity`, `resetStalk` (148 Zeilen).

**Der zehnte war nicht tot.** `fetchAndConvertRC` (96 Zeilen) wird aus `ctxpage/messages-analyzer/index.js:385` gerufen, Datei ist live — genau der Punkt, den Schritt 5 offen hält. Ursprünglicher Plan übersah den Aufruf, weil er über `this` aus einem `.call(this)` läuft und in keiner Suche nach `ogCore.fetchAndConvertRC` auftaucht. Bleibt, bis Entscheidung über Alt-Analyzer gefallen. Erklärt zugleich das knapp verfehlte Zeilenziel: diese eine Methode ist mehr als Hälfte der Lücke.

### Problem D — die abgeschaltete Tooltip-Kette

Gelöscht: `goodbyeTipped`-Kommentarblock (33 Zeilen), `betterTooltip()` samt Aufruf in `start()`, `showTooltip()`, `betterAPITooltip()` — und im Nachlauf `trashsimTooltip()`, `this.eventAction` und der dadurch unbenutzte `json.js`-Import. Zusammen 174 Zeilen.

Frage „Übergang tipped → tippy passiert oder aufgegeben?" entschieden: **passiert.** Beleg im Code selbst — `ogCore.js` ruft an anderer Stelle `ship._tippy.disable()`. Spiel benutzt tippy, Workaround wartete auf Ereignis, das längst eingetreten war.

**Eine Löschung entfernt echtes Feature:** `trashsimTooltip()` baute Trashsim-Prefill-Button in Flotten-Tooltips. Seit Abschaltung nicht erreichbar, hing aber nur an `showTooltip()`. Halb löschen wäre dritter Zustand, den Plan verbietet — also ganz weg. Historie hat ihn; wer ihn zurückwill, hängt ihn an tippy-Pfad, nicht an `Tipped.show`.

Ebenfalls weg: **`showTabTimer()`** (22 Zeilen), dessen Aufruf in `start()` auskommentiert war. Entwurfsnotizen aus Methodenkopf nicht verloren, sondern nach Phase 6 gewandert.

### Problem B — Schein-Delegaten

`tooltip()` (3 Aufrufe), `popup()` (15), `formatToUnits()` (1) aufgelöst, Aufrufstellen auf `utilTooltip.tooltip` / `popupUtil.popup` / `Numbers.formatToUnits` umgestellt.

**Dabei echter Bug aufgefallen.** `SpyMessagesAnalyzer.js:660` rief `this.popup(…)` — aber `SpyMessagesAnalyzer` hat keine `popup`-Methode, erbt von nichts und ist nicht die `OGBInfinity`-Klasse. Aufruf warf also `TypeError: this.popup is not a function`, genau in dem Zweig, der dem Benutzer sagen soll, dass kein externer Simulator konfiguriert ist. Jetzt direkter Import aus `util/popup.js`. Ohne Auflösung der Delegaten nicht aufgefallen: gleichnamige Klassenmethode in `ogCore.js` ließ Aufruf im ganzen Repo plausibel aussehen.

### Problem C — `createDOM` doppelt

`createDOMSanitized()` liegt jetzt in `util/dom.js`, die 52 Aufrufstellen (51 in `ogCore.js`, 1 in `messages-analyzer`) zeigen darauf, Klassenmethode weg. **Nicht** durch `DOM.createDOM` ersetzt — Unterschied ist real und bleibt:

|                | `createDOM`                   | `createDOMSanitized`                 |
| :------------- | :---------------------------- | :----------------------------------- |
| Inhalt         | `textContent`                 | `innerHTML` via `DOMPurify.sanitize` |
| `0` als Inhalt | übersprungen (falsy)          | wird gerendert                       |
| `<select>`     | bekommt `dropdownInitialized` | bekommt es nicht                     |

Vier neue Tests in `test/util/dom-and-wait.test.js` schreiben genau diese drei Unterschiede fest, inklusive der Falle, dass `"" == 0` in JS **wahr** ist — leerer String läuft also trotz „übersprungen" durch den Sanitizer. Erst mit diesem Netz später Stelle für Stelle entscheidbar, welche eigentlich `textContent` will.

### Problem E — der Zweitbaum

`local-extension-backup/` untracked (`git rm -r --cached`) und in `.gitignore`; Dateien bleiben auf Platte, verschwinden aber aus jedem `git grep` und aus ripgrep. 315 → 192 getrackte Dateien.

Vorher geprüft: alle 123 Dateien haben Gegenstück in `src/`, keine Schlüssel oder Zugangsdaten darin, und es ist **gestempelter Build**, kein Quellstand — `version.js` steht auf `"1.0.0"` statt `"__VERSION__"`, und `fetching.js` enthält noch das `window.onbeforeunload`-Muster, das `test/util/abort.test.js` heute verbietet. Nicht nur redundant, sondern zeigte auf Stand, den Projekt bewusst verlassen hat.

### Schritt 5 — `messages-analyzer/index.js`: Entscheidung getroffen, Ausführung wartet auf Phase 2

**Entscheidung: neuerer Pfad gewinnt, Datei wird gelöscht.** Noch da, weil Phase 2 erst die fünf Analyzer-Klassen abdecken muss. Begründung steht als Kopfkommentar in der Datei, damit sie nicht nur hier steht. Was der Vergleich ergab:

- **Genau ein Feature hat kein Gegenstück** im neuen Pfad: Zeitzonen-Umschreibung von `.msg_date` (`updateTimeZone()`). `msg_date` und `timezoneDiff` kommen in keiner Analyzer-Klasse vor. Einziges, was vor dem Löschen umziehen muss. Alles andere — `ogk-expedition`, `ogk-harvest`, `ogk-combat`, `expeditionSums`, `combats` — existiert doppelt.
- **Beide Pfade schreiben in dieselben Store-Schlüssel und sind sich über die Form uneinig.** `HarvestMessagesAnalyzer` legt `harvest: [0, 0, 0]` an (Metall, Kristall, Deuterium), Alt-Pfad `harvest: [0, 0]` und addiert nur auf Slot 0 und 1. Wer ein Datum zuerst sieht, bestimmt die Form. Kein Stilproblem, Datenfehler mit Laufzeit-Rennen.
- Auskommentierter Deuterium-Parser (`:513`) damit erledigt: beschreibt Lücke, die nur die sterbende Kopie hat. Nackter `@TODO` raus, Tatsache steht als Kommentar an der Stelle und im Dateikopf.

### Exit-Kriterien

| Kriterium                | Ziel            | Ist                                                     |
| :----------------------- | :-------------- | :------------------------------------------------------ |
| `ogCore.js`              | < 18.500 Zeilen | **18.654** — verfehlt, siehe `fetchAndConvertRC` oben   |
| Methode ohne Aufrufer    | 0               | **0** von 151                                           |
| Funktion doppelt im Repo | 0               | **0** (`createDOM`, `cleanValue`, `generateGalaxyLink`) |
| `git ls-files`           | −123            | **−123** (315 → 192)                                    |
| Tests                    | grün            | **395/395**                                             |

Zeilenziel war Schätzung in diesem Plan, keine Anforderung, beruhte auf „10 tote Methoden, rund 250 Zeilen". Es waren neun mit 148 Zeilen. Substanzielle Kriterien erfüllt; restliche ~150 Zeilen fallen in Phase 3, wenn `@deprecated`-Aliase mitgehen.

---

## Phase 2 — Charakterisierungstests — **ERLEDIGT**

Tests **395 → 485**, alle grün. Lint 0. Bundle 1122 KB. `ogCore.js` **18.435 Zeilen**.

### Vorbedingung: v12-Support ist gefallen

Entscheidung getroffen (Auftrag: „V12 support kann weg") und **vor** dem ersten Fixture umgesetzt. Damit teuerste Einzelposition dieser Phase weg: nur ein Fixture-Satz.

- **34 `isAtLeast_13_0_0`-Verzweigungen aufgelöst** — 27 Ternäre, 6 `if`/`else`, ein zusammengesetztes `if (… && techId == -200)`. Nicht per Regex, sondern über AST (`acorn`), weil die meisten Ternäre mehrzeilig und teils geschachtelt sind.
- **Drei Blöcke aus Abschnitt 3.2 weg**: `#bar ul`-Kopfzeilenpfad in `topBarUtilities()` (51 Zeilen), Piraten-/Alien-Stichwortabgleich in `ExpeditionMessagesAnalyzer` (v13 liefert `combatPirates` und `combatAliens` als eigene Typen, 30 Zeilen), und Regex-Rückfallpfade in `SpyReport` für Flotten- und Verteidigungswerte (`data-raw-fleetvalue` gibt es seit 11.16). Letztere schreiben jetzt `"No data"` statt aus Tooltip zu kratzen; Attributprüfung bleibt als Wächter, weil `cleanValue(null)` wirft.
- **`prodFactor` jetzt sichtbar konstant.** Faktor wurde berechnet und eine Zeile später bedingungslos mit `1` überschrieben — Bedingung war `isAtLeast_13_0_0`. Mit v12 fällt Berechnung; Begründung (v13 liefert keine belastbare Stundenproduktion) steht jetzt als Kommentar an der Konstanten. Lücke 1 der acht aus Abschnitt 3.3, ab jetzt als solche lesbar statt als toter Rechenweg getarnt.
- **`isAtLeast_13_0_0` bleibt** — mit genau einem Aufrufer: Meldung im Startpfad, falls Spiel Version unter 13.0.0 meldet. Ohne v12-Zweige findet Extension dort schlicht nichts; eine Zeile im Log ist Unterschied zwischen „diagnostizierbar" und „kaputt ohne Hinweis". Tests zu `OgamePageData` bleiben damit ebenfalls sinnvoll.

### Schritt 2 — der Konstruktor hat eine Naht

`src/util/pageContext.js` (neu, **100 % Abdeckung**) enthält `readPageContext(doc, loc)` — alles, was Konstruktor aus DOM las — und `stripCoordinateBrackets(doc)`, den einen DOM-**Schreib**vorgang, der zwischen den Lesevorgängen stand. Konstruktor jetzt sechs Zeilen.

Lesevorgänge **wörtlich** übernommen, einschließlich der drei Stellen, die auf unvollständiger Seite werfen (fehlendes `ogame-player-id`-Meta, leere Planetenliste, fehlendes Universum-Meta). Absicht: Naht, keine Reparatur. Alle drei als `KNOWN BUG:` festgeschrieben, damit spätere Nachsicht als bewusste Änderung erscheint.

Nebenbei festgehalten: `stripCoordinateBrackets()` ist **nicht idempotent** — zweimal aufgerufen frisst es die Koordinaten an. Als `TRAP:` markiert.

**`new OGBInfinity()` läuft jetzt im Test.** Dafür exportiert `ogCore.js` die Klasse — ausschließlich zu diesem Zweck, dokumentiert an der Export-Zeile, und `test/bundle.test.js` prüft, dass es der **einzige** Export des Page-Bundles bleibt. Zur Laufzeit importiert die Datei niemand; sie wird als `<script type="module">` injiziert, wo ungenutzter Export wirkungslos ist.

Alternativweg — Methoden erst herausziehen, dann herausgezogenen Stand testen — prüft nicht die Verschiebung, nur ihr Ergebnis. Genau davor warnt diese Phase.

### Schritt 3 — die zwölf Rechenkerne

Alle zwölf abgedeckt, 35 Tests in `test/ogCore.calculations.test.js`. Aufruf über `OGBInfinity.prototype` mit selbstgebautem `this`; erwartete Werte stammen aus laufendem Code, nicht aus Nachrechnung — Punkt einer Charakterisierung.

**Zwei echte Fehler dabei gefunden**, beide als `KNOWN BUG:` festgeschrieben:

1. **`roiMine()` verrechnet sich um ein Vielfaches.** Kostenschleife zählt `lvl` hoch, übergibt aber `tolvl` an `building()`. Ausbau von 20 auf 25 wird als **fünfmal die Kosten von Stufe 25** bepreist statt als Summe der Stufen 21–25. Amortisationszeit systematisch zu hoch, umso mehr je mehr Stufen der Vorschlag überspringt — also genau bei den großen Sprüngen, für die man das Werkzeug benutzt. `roiLfBuilding()`, zwei Methoden weiter oben, macht dieselbe Schleife richtig.
2. **`getBestRoi()` mittelt über zwei verschiedene Listen.** Summiert Minenstufen über `OGBIData.empire`, teilt aber durch `this.json.empire.length`. In Produktion dasselbe Array, Fehler also latent. Driften beide auseinander, wird `averageMines` bei leerer `json.empire` **Infinity** — und `roiAstrophysics()` zählt dann `for (lvl = 1; lvl <= Infinity;
lvl++)` und hängt die Seite auf. Beim Schreiben dieses Tests genau das passiert: erster Anlauf lief 120 Sekunden ins Timeout.

### Schritt 4 — `background.js`

18 Tests, **81 % Zeilen / 71 % Zweige** (Ziel war > 70 %). Keine Exporte, also werden die drei registrierten Listener so aufgerufen wie Chrome es tut, Ergebnis über `chrome`-Stub beobachtet. Abgedeckt: Persistenz über Worker-Neustart (bereits gemeldete und über fünf Minuten überfällige Benachrichtigungen werden beim Wiedereinlesen verworfen), Alarm-Planung und -Ersetzung, Sofortbenachrichtigung, Klickbehandlung mit und ohne passenden Tab, domänenweise Synchronisation.

`chrome`-Stub in `test/helpers/globals.js` kann dafür jetzt `alarms`, `tabs`, `notifications.onClicked` und `runtime.onMessage` — aufzeichnend, nicht als Leerlauf, weil „hat der Service Worker einen Alarm gestellt" die einzige beobachtbare Größe ist, die er hat.

### Schritt 5 — die fünf Analyzer

19 Tests. Tab-Zuständigkeit für alle fünf abgedeckt, samt Prüfung, dass **kein Tab von zwei Analyzern beansprucht** wird. Parsing-Pfade: Harvest (98 % Abdeckung), Trade (97 %), Expeditionskämpfe (Fight, 70 %). `SpyMessagesAnalyzer` (1.039 Zeilen) und `ExpeditionMessagesAnalyzer` haben `support()` bzw. `clean()`, aber noch keine Parsing-Fixtures — offen und in `docs/testing.md` als solches benannt.

**Zwei weitere echte Fehler:**

3. **`TradeMessagesAnalyzer` wirft weg, was es berechnet.** Beide Rückschreibungen in den Store auskommentiert (`/*OGBIData.trades = trades;*/`), und **niemand sonst** schreibt `trades` — Alt-Analyzer behandelt Transporte gar nicht. `OGBIData.trades` bleibt also für immer leer, `msgId`-Cache eine Zeile darüber kann nie greifen, Handelsstatistik hat keine Datenquelle.
4. **Eine unpassende Nachricht leert den ganzen Kampfbericht-Tab.** Weder `#getExpeditionFight()` noch `#getFight()` prüft `data-raw-messagetype`; sie sehen nur auf Koordinaten und Hashcode. Alles andere landet im Parser, wo `JSON.parse(null).owner` wirft — und der Fehler verlässt `analyze()`, sodass jede Nachricht danach übersprungen wird. Harvest und Trade filtern beide zuerst auf den Typ.

**Korrektur zur Phase-1-Notiz:** dort stand, dem neuen Pfad fehle gegenüber `messages-analyzer/index.js` nur die `.msg_date`-Zeitzonenumschreibung. Befund 3 zeigt, dass auch Handelsdaten in keinem der beiden Pfade ankommen. Entscheidung („neuer Pfad gewinnt") bleibt, aber Liste dessen, was vor dem Löschen entstehen muss, ist länger als gedacht.

### Schritt 6 — die zwei ernsten `KNOWN BUG:`-Tests behoben

- **`pageContextRequest()` hängt nicht mehr.** Ohne Antwort blieb Promise für immer offen, und jeder Wartende ebenso — ohne Fehler, ohne Log, ohne Ende. Jetzt Verklemmungswächter von 30 Sekunden, der mit regulärer `ResponseCallbackEvent`-Ablehnung auflöst und seinen Listener abräumt. Bewusst kein `AbortController`: dessen `signal` stammt aus anderer Realm und wird von `addEventListener` im Page-Context nicht angenommen — schlichtes `removeEventListener` tut es.
- **Beschädigter `localStorage` legt Extension nicht mehr lahm.** `JSON.parse` im Konstruktor ohne `try/catch` bedeutete: abgeschnittener Schreibvorgang, und ganzer Page-Context stirbt bei Modulauswertung — vor jedem Feature, das sich hätte erholen können. Jetzt startet Store leer, unlesbarer Wert wird nach `ogk-data-corrupt` **beiseitegelegt statt überschrieben**: `ogk-data` ist gesamte Historie des Spielers, nächster Setter hätte `{}` darüber geschrieben. Leer starten kostet Sitzung; leer starten und wegwerfen kostet Account.

### Exit-Kriterien

| Kriterium                   | Ziel      | Ist                                                        |
| :-------------------------- | :-------- | :--------------------------------------------------------- |
| Die 12 Rechenkerne          | abgedeckt | **12/12**, 35 Tests                                        |
| `background.js`             | > 70 %    | **81 % Zeilen / 71 % Zweige**                              |
| Analyzer                    | ≥ 1 Test  | **alle 5**, 19 Tests                                       |
| `OGBInfinity` konstruierbar | ja        | **ja** (`pageContext.js`, 100 %)                           |
| `KNOWN BUG:`-Tests          | 11 → 9    | **9 alte, 2 behoben** — plus **7 neu gefundene**, jetzt 16 |
| Tests gesamt                | —         | 395 → **485**                                              |

Letzte Zeile ist eigentlicher Ertrag dieser Phase, nicht die Zahl: **sieben Fehler, die vorher niemand sehen konnte**, davon vier mit echter Wirkung im Spiel (`roiMine`-Kosten, Handelsstatistik ohne Daten, Kampfbericht-Tab, aufgehängte Seite bei Infinity). Genau der Zweck von Charakterisierungstests: sie finden nichts, indem sie klug sind, sondern indem sie Code zum ersten Mal ausführen.

**Risiko für Phase 3.** Netz deckt Rechenkerne, Konstruktor, Service Worker und Tab-Verteilung ab. Deckt **nicht** die ~150 DOM-schreibenden Methoden in `ogCore.js` ab. Wer dort schneidet, hat weiterhin kein Netz — Phase 3 muss das Modul für Modul mitziehen, nicht darauf vertrauen, dass Phase 2 es erledigt hat.

---

## Phase 3 — `ogCore.js` aufteilen — **ERLEDIGT**

`src/ogCore.js`: 18.442 → **1.846 Zeilen**, 149 → **40 Methoden**. Tests 485 → **502**, alle grün.
Lint 0. Bundle 1128 KB (vorher 1122). 36 neue Dateien, `src/ctxpage/` von 12 auf 40.

Gemessen an der Ausgangslage des Plans: **19.024 → 1.846**, also 90 % der Datei verschoben.

### Was wo gelandet ist

| Modul aus dem Plan          | Ziel                                                                 |      Zeilen |
| :-------------------------- | :------------------------------------------------------------------- | ----------: |
| 1 `util/gameFormulas.js`    | + `enum/buildingInfo.js`, `enum/researchInfo.js`, `gameConstants.js` | 666 + 1.147 |
| 2 `ctxpage/stats/`          | in 10 Dateien geteilt (Einstieg, State, 6 Tabs, Graphen, Boxen)      |       4.180 |
| 3 `ctxpage/empireOverview/` | 3 Dateien                                                            |       1.306 |
| 4 `ctxpage/fleetdispatch/`  | 6 Dateien                                                            |       3.894 |
| 5 `ctxpage/galaxy/`         | 2 Dateien                                                            |         906 |
| 6 `ctxpage/planetbar/`      | 1 Datei                                                              |         668 |
| 7 `ctxpage/settings/`       | 1 Datei                                                              |       1.064 |
| 8 `ctxpage/empire/`         | 3 Dateien                                                            |       1.433 |

**Nicht im Plan, aber nötig, um sein eigenes Exit-Kriterium zu erreichen.** Die acht Module der
Tabelle decken rund 12.000 Zeilen ab; darunter lagen weitere 4.500, die nirgends zugeordnet waren:

| Zusätzlich                                                                                                     | Ziel                    |
| :------------------------------------------------------------------------------------------------------------- | :---------------------- |
| `technoDetail` (879 Zeilen, die größte Einzelmethode nach den acht Modulen)                                    | `ctxpage/technoDetail/` |
| `keyboardActions`, `listenKeyboard`                                                                            | `ctxpage/keyboard/`     |
| `eventBox`                                                                                                     | `ctxpage/eventbox/`     |
| `playerSearch`, `sideStalk`, `betterHighscore` und fünf Helfer                                                 | `ctxpage/stalk/`        |
| `pantrySync`, `checkPantrySync`, `showToast`                                                                   | `ctxpage/pantry/`       |
| `utilities`, `uvlinks`, `topBarUtilities` und fünf weitere Kleinigkeiten                                       | `ctxpage/pageTweaks/`   |
| `dataHelper`, `tabs`, `debounce`, `isOwnPlanet`, `ensureLZString`, `generateMMORPGLink`, `getLocalStorageSize` | je ein `util/`-Modul    |

### Wie der Zustand übergeben wird

Die Plan-Regel „extrahierte Module bekommen **keine** Referenz auf die `OGBInfinity`-Instanz" ist
eingehalten. Jedes Modul bekommt ein einfaches Objekt; `OGBInfinity` hat dafür acht Bauer:
`playerBonuses()`, `dialogContext()`, `overviewContext()`, `settingsContext()`, `empireContext()`,
`fleetContext()`, `galaxyContext()`, `planetBarContext()`, `technoContext()`, `pageContext()`.

Drei Fälle brauchten mehr als Werte, und in allen dreien steht ein Callback statt einer
Methodenreferenz: der Ladewächter um `updateInfo()` (`isLoading` / `setLoading`), der Rückruf
`flyingFleet()` / `updateSpaceShipsPresence()`, und der Setter `keyboardActionSkip`.

`test/ogCore.construction.test.js` prüft für jeden Kontext, **welche Felder** er trägt, und dass
keiner die Instanz selbst durchreicht.

### Sechs echte Fehler, gefunden beim Schneiden

1. **`fleetDispatcher` als Funktionsname verdeckte das gleichnamige Seitenglobal.** Die extrahierte
   Methode hieß `fleetDispatcher`; eine Funktionsdeklaration dieses Namens beschattet im ganzen
   Modul OGames eigenes `fleetDispatcher`-Objekt. Als Klassenmethode konnten beide nebeneinander
   existieren, als Modulfunktion nicht — **die gesamte Flottenversand-Seite wäre tot gewesen.**
   Jetzt `initFleetDispatcher`. Gefunden von den migrierten Cargo-Tests.
2. **`this` in `technologyDetails.show` gehört OGame, nicht OGBI.** Die Funktion wird auf OGames
   eigenes Objekt gelegt; `this.technologyDetailsEndpoint` ist dessen Eigenschaft. Die pauschale
   Ersetzung nach `context.` hätte den Detailabruf auf `undefined` gestellt.
3. **`that.createDOM(` war seit Phase 1 tot.** Damals wurde nur `this.createDOM(` umgeschrieben. Ein
   Aufruf im Lifeform-Bonus-Tooltip warf seitdem `TypeError`.
4. **Zwölf Konstanten blieben in `ogCore.js` zurück**, während ihre Nutzer auszogen —
   `PLAYER_CLASS_*`, die drei Expeditions-Stufentabellen, `CARGO_SHIP_IDS`, `CLAIM_FREE`,
   `isOwnPlanet`, `debounce`, `ensureLZString`, `logger`. Jede davon ein `ReferenceError` beim
   ersten Aufruf, und jede hat gebaut, gelintet und gebündelt.
5. **`statistics()` hat den übergebenen Kontext nie gespeichert.** Beim Modul-2-Schnitt bekam der
   Aufruf in `ogCore.js` ein Kontextobjekt, die Signatur blieb aber parameterlos — das Statistik-
   Popup wäre auf `context.hasLifeforms` von `null` gelaufen.
6. **Beim Aufteilen fielen zweimal ganze Dateien aus dem Modulgraphen.** `stats/index.js` referenziert
   seine Tabs als Werte (`minesStats`, nicht `minesStats()`), das Splitter-Werkzeug sah keine
   Aufrufe und schrieb keine Importe: das Bundle schrumpfte still um 109 KB und sechs Tabs
   existierten nicht mehr. Dasselbe danach bei `fleetdispatch`.

Dazu **eine tote Methode, die Phase 1 übersehen hatte**: `autoHarvest()` (81 Zeilen) hat keinen
Aufrufer. Mein damaliger Scanner hielt sie für lebendig, weil `json.autoHarvest` denselben Namen
trägt. Gelöscht. Ihr einziger Schreiber war sie für `keyboardActionSkip`, das `keyboardActions()`
weiterhin liest — als `KNOWN BUG:` an der Stelle vermerkt, samt der Bedingung, unter der man dort
hinkommt (`oglMode=autoharvest` aus einem alten Link).

### Drei neue statische Wächter

Fünf der sechs Fehler oben sind unsichtbar: ESLint hat `no-undef` aus, das Bundle baut, und die
Seite bricht erst, wenn jemand sie öffnet. `test/ctxpage/module-wiring.test.js` prüft deshalb
statisch:

- **kein extrahiertes Modul benutzt eine Bindung, die nur `ogCore.js` deklariert** (fängt 4),
- **das einzige `this` in einem Modul gehört einem OGame-Objekt** — mit namentlicher Liste, welche
  Lesezugriffe das sind (fängt 2),
- **jedes extrahierte Modul ist von `ogCore.js` aus erreichbar** (fängt 6).

Dazu `test/ogCore.wiring.test.js`: kein `this.foo()` in `ogCore.js` zeigt auf eine Methode, die es
nicht mehr gibt (fängt 3).

### Tests, die mitgewandert sind

`test/util/gameFormulas.test.js` (27) und `test/ctxpage/fleetdispatch.test.js` (9) sind die
Charakterisierungstests aus Phase 2, unverändert in ihren Erwartungswerten. **Das ist der Beleg für
die Verschiebung**: die Zahlen wurden vor dem Schnitt aufgenommen und gelten danach noch.
`test/util/tabs.test.js` (6) ist neu und deckt das Tab-Widget ab, das aus `ogCore.js` kam.

Eine Nebenwirkung des Schnitts ist eine Reparatur: `getBestRoi()` mittelte über `OGBIData.empire`
und teilte durch `this.json.empire.length` — zwei Lesewege, die nur zufällig übereinstimmten. Im
Modul sind beide `OGBIData.json.empire`, das Auseinanderdriften ist damit unmöglich, und der
`KNOWN BUG:`-Test dazu ist zu einem normalen Test geworden.

### Exit-Kriterien

| Kriterium            | Ziel                       | Ist                                           |
| :------------------- | :------------------------- | :-------------------------------------------- |
| `ogCore.js`          | < 2.000 Zeilen             | **1.846**                                     |
| Datei > 1.000 Zeilen | keine außer `translate.js` | **drei übrig**, siehe unten                   |
| Bundle-Test          | grün                       | **grün**, plus drei neue Verdrahtungs-Wächter |
| Startup-Profil       | nicht schlechter           | **nicht gemessen** — braucht einen Browser    |

**Die drei verbliebenen großen Dateien sind je eine einzige Funktion**, nicht eine Sammlung:
`betterFleetDispatcher.js` (1.616 Zeilen, davon 1.548 in einer Funktion), `stats/minesStats.js`
(1.330 / 1.260) und `settings/index.js` (1.064 / 898). Weiter zu teilen heißt, diese Funktionen
aufzubrechen — eine Umstrukturierung, keine Verschiebung, und damit ausdrücklich nicht das, was
diese Phase tut. Sie sind der erste Punkt für danach.
`ctxcontent/services/analyzer/SpyMessagesAnalyzer.js` (1.039) war nie Teil von `OGBInfinity`.

**Das Startup-Profil ist offen.** `localStorage["ogi-perf"] = "1"` vor und nach dem Schnitt zu
vergleichen verlangt einen laufenden Browser auf einer echten OGame-Seite; das steht noch aus, und
`make dev` einmal wirklich zu benutzen ist der andere Punkt, den der Plan verlangt und den ich
nicht erledigen konnte. Die statische Erwartung ist neutral: es ist derselbe Code in derselben
Reihenfolge, in einem Bundle, das 6 KB größer ist.

---

## Phase 4 — Ein Weg zum Store [ERLEDIGT]

**Problem.** `this.json.*` und `OGBIData.*` zeigten auf denselben `localStorage["ogk-data"]`. `this.json` wurde in `init()` einmal auf `OGBIData.json` gesetzt und danach direkt mutiert — umging die Setter, die Write-Through machen, weshalb es überall `this.saveData()` brauchte. Genau diese Doppelung war der Grund, warum extrahiertes Modul aus Phase 3 sonst wieder Instanzreferenz mitschleppen müsste.

Zahlen zu Beginn der Phase, nicht die aus Abschnitt 0 — Phase 3 hatte den Löwenanteil schon mitgenommen: **227 `this.json`-Stellen** in drei Dateien (`ogCore.js` 158, `ctxpage/messages-analyzer/index.js` 67, `ctxpage/pantry/index.js` 25 als `this?.json?.`) und **14 `this.saveData()`**.

### Was gemacht wurde

1. **Der Alias ist weg.** `init()` setzt kein `this.json` mehr, und die Methode `OGBeyondInfinity.saveData()` — ihr ganzer Rumpf war `OGBIData.json = this.json`, also eine Neuserialisierung des kompletten Blobs — ist gelöscht. Alle 227 Stellen lesen und schreiben jetzt über `OGBIData`.
2. **Eine Regel statt zweier Wege**, im Kommentar an `init()` festgehalten: eine einzelne logische Änderung geht durch ihren Setter, der schreibt durch; ein Stapel zusammengehöriger Änderungen mutiert `OGBIData.json.*` und endet in **genau einem** `OGBIData.Save()`. Nie beides. `init()` selbst ist die dokumentierte Ausnahme: rund sechzig Vorgabewerte, die als Stapel laufen, weil ein Setter je Vorgabe sechzig vollständige Serialisierungen vor dem ersten Paint bedeuten würde.
3. **Weniger Schreibvorgänge, nicht spätere** (Leitplanke 4). Drei Stellen schrieben den ganzen Blob pro Schleifendurchlauf:

   - `ctxpage/eventbox/index.js` speicherte innerhalb von `OGBIData.empire.forEach` — die zweite der beiden sogar außerhalb des Koordinaten-Vergleichs, also einmal pro Planet **pro Bewegung**. Bei 15 Planeten und 10 Rückflügen sind das 150 vollständige `JSON.stringify` des gesamten Speichers, für einen Zustand, den der Schreibvorgang am Ende des Blocks ohnehin festhält.
   - `ctxpage/galaxy/index.js` speicherte einmal pro markierter Galaxie-Zeile, also bis zu 15-mal bei jedem Aufbau der Galaxieansicht. Jetzt ein `markersChanged`-Flag und ein Schreibvorgang danach.
   - `ctxpage/empire/index.js`, `settings/index.js` und `util/Notifier.js` schrieben zweimal, wo ein Setter genügt.

   `OGBIData.Save()` im ganzen `src/`: **92 → 80**. Die verbliebenen sitzen in Klick-Handlern, also ein Schreibvorgang pro Benutzeraktion. Kein Deferred Write (`docs/performance.md`).

4. **`needsUpdate` bekam Getter/Setter** in `OGBIData` — drei Schreibstellen, alle mit `Save()` direkt dahinter. Damit sind es 29 Accessoren.

### Zwei stille Fehler, die dabei sichtbar wurden

1. **Der Pantry-Upload lud nichts hoch.** `pantrySync()` ist seit Phase 3 eine Modulfunktion, las den Speicher aber weiter als `this?.json?.options` und so weiter — 25-mal. In einem ES-Modul im Strict Mode ist `this` dort `undefined`, das Optional Chaining hat es verschluckt, und `JSON.stringify` hat jedes `undefined`-Feld weggeworfen. Der Korb bei Pantry enthielt nur noch seinen eigenen Zeitstempel. Nichts hat gemeckert: der Request war erfolgreich, der Toast meldete Erfolg, und das nächste Gerät, das von diesem Korb gemerged hat, bekam nichts. `test/ctxpage/pantry/pantry.test.js` (3 Tests) prüft jetzt den tatsächlich hochgeladenen Inhalt; zwei davon fallen gegen den alten Code.
2. **Zwei Müllschlüssel in der Wurzel von `ogk-data`.** Der Legacy-Analyzer schrieb bei Expeditionen mit Objektfund `this.json.result` und `this.json["object"]` — gemeint war der Expeditions-Datensatz, getroffen wurde der Speicher selbst. Gelesen hat die beiden nie jemand; das `type = "Object"` in derselben Verzweigung ist, was tatsächlich zählt. Entfernt.

### Wächter

- `test/util/store-access.test.js` (3 Tests) liest den Quelltext, weil keiner dieser Fehler einen Build, einen Lint oder ein Bundle bricht: kein `this.json`/`this?.json` mehr, kein `this.saveData(`, und kein `OGBIData.<setter> = …` mit einem `Save()` direkt dahinter. `ctxcontent/data-helper.js` ist ausgenommen — dessen `saveData()` gehört zu `chrome.storage.local` im Content-Context und hat mit diesem Speicher nichts zu tun.
- `test/util/callback-token-twins.test.js` (2 Tests) erledigt den **Nebenschauplatz**: `createCallbackToken()` existiert zweimal — in `util/service.callbackEvent.js` und handkopiert in `src/main.js`, weil ein klassisches Content-Script nicht importieren kann. Der Test vergleicht beide Funktionsrümpfe als Quelltext. Driften sie auseinander, veröffentlicht die eine Hälfte ein Token, das die andere nicht wiedererkennt, und das einzige Symptom ist, dass jeder `pageContextRequest()` in einen Timeout läuft.

### Exit-Kriterien

| Kriterium                                     | Ziel     | Ist                                             |
| :-------------------------------------------- | :------- | :---------------------------------------------- |
| `this.json`                                   | weg      | **weg** — 0 Stellen, statisch abgesichert       |
| `saveData()`-Aufrufe                          | < 20     | **0** — die Methode selbst gelöscht             |
| `TRAP:`-Tests in `test/util/OGBIData.test.js` | grün     | **grün**, unverändert                           |
| Tests gesamt                                  | —        | 508 → **516**                                   |
| `npm run check`                               | 0 Fehler | **0**                                           |
| Bundle-Test                                   | grün     | **grün**; `make dev` baut, Page-Bundle 1.132 KB |

**Was diese Phase bewusst nicht getan hat:** die rund 600 reinen **Lese**-Zugriffe der Form `OGBIData.json.x` auf `OGBIData.x` umzustellen, wo es einen Getter gibt. Das ist kein zweiter Zugriffsweg mehr — es ist derselbe Singleton, nur ohne den benannten Accessor — und eine Umstellung wäre ein Diff über zwanzig Dateien ohne jede Verhaltensänderung, der jeden echten Fund darin begraben würde. Sinnvoll als Beifang, wenn eine Datei ohnehin angefasst wird.

**Zwei Altlasten, die dabei auffielen und bewusst liegenbleiben**, weil sie Verhaltensfragen sind und keine Speicherfragen — beide in Phase 6 aufgenommen: `chat()` überschreibt bei jedem Seitenaufruf das gespeicherte `tchat` mit `!!document.querySelector("#chatBar")`, der Umschalter des Spielers überlebt also keine Navigation; und `util/needs.js` schreibt `OGBIData.json.flying` ohne zu speichern, während `ctxpage/eventbox/index.js` dasselbe Feld speichert.

---

## Phase 5 — Seitenweises Laden — **ERLEDIGT**

Page-Bundle **1.132 KB → 472 KB**. Tests 516 → **541**, alle grün. Lint 0 Fehler. 19 Chunks, zusammen 686 KB, von denen ein Seitenaufruf null bis zwei anfasst.

**Problem.** Das Page-Bundle wurde auf **jeder** Seite geladen — OGame ist keine Single-Page-App, also bei jedem Ansichtswechsel erneut. `docs/performance.md` §6 nennt das ausdrücklich als „was übrig bleibt". Der Code sagte selbst, wo die Grenzen liegen: 37 Abfragen auf `this.page`, davon 18 auf `fleetdispatch`.

### Wie geschnitten wurde

`scripts/bundle.mjs` bekam **keine** Chunk-Liste. Es setzt `chunkFileNames` und lässt **Rollup** aus dem Importgraphen entscheiden: was in `src/` über ein dynamisches `import()` erreicht wird, wird ein eigener Chunk unter `chunks/`. Damit gibt es keine zweite Liste, die mit `src/` in Schritt gehalten werden müsste. `chunks/*` steht als **ein** Eintrag in beiden Manifesten, dort muss also nie wieder etwas nachgetragen werden.

Zwei Rollup-Vorgaben mussten dafür abgeschaltet werden, beide hätten den Schnitt sonst still entwertet:

- `preserveEntrySignatures: "allow-extension"` — die Vorgabe `"exports-only"` schreibt eine **Fassade**: ein zweizeiliges `ogCore.js`, das einen Chunk mit dem ganzen Programm re-exportiert. Jedes Byte wäre aus der Datei gewandert, die das Manifest injiziert, und die Messung des Einstiegs wäre bedeutungslos geworden.
- `minifyInternalExports: false` — Bindungen, die Einstieg und Chunk teilen, heißen sonst `a`, `$`, `a0`. Das ist Minifizierung unter anderem Namen, ausgerechnet in der Datei, die ein Prüfer zuerst öffnet (`AGENTS.md` §0).

Geladen wird über `util/loadChunk.js`. Ein fehlgeschlagener Chunk-Abruf ist ein Fehlermodus, den statische Importe nicht hatten — Extension unter einer offenen Seite neu geladen, `web_accessible_resources` in einem der beiden Manifeste vergessen. `loadChunk()` nennt den Namen im Log und liefert `undefined`; der Aufrufer prüft darauf, der Rest der Seite läuft weiter.

### Was jetzt wo liegt

| Chunk                  |  Größe | Geholt, wenn                                   |
| :--------------------- | -----: | :--------------------------------------------- |
| `fleetdispatch.js`     | 166 KB | `component=fleetdispatch`                      |
| `stats.js`             | 111 KB | Klick auf den Statistik-Knopf                  |
| `messages.js`          |  95 KB | `component=messages`                           |
| `technoDetail.js`      |  43 KB | eine der sieben Bauseiten (`isBuildPage()`)    |
| `settings.js`          |  41 KB | Klick auf Einstellungen, oder Erstbegrüßung    |
| `overview.js`          |  37 KB | Klick auf den Imperium-Knopf                   |
| `messages-analyzer.js` |  28 KB | `component=messages` (Altpfad)                 |
| `galaxyView.js`        |  26 KB | `component=galaxy`                             |
| `de/es/fr/tr/br.js`    | ~12 KB | der Spieler spielt in dieser Sprache           |
| `pantry.js`            |   9 KB | der Spieler hat einen Pantry-Schlüssel gesetzt |
| `shared-*.js`          | ~60 KB | von zwei Chunks geteilt, Rollup entscheidet    |

**Ein Overview-Seitenaufruf lädt davon nichts** außer der Sprachtabelle — und `pantry.js`, falls konfiguriert. Vorher: 1.132 KB, immer.

### Die Übersetzungstabelle war der Rest

Nach den Seiten-Chunks stand der Kern bei **558 KB**, Ziel verfehlt. Die verbliebenen großen Posten sind alle seitenübergreifend: `empire/production.js` (38 KB) und `empireOverview/resourceDetail.js` (20 KB) hängen an `renderPlanetBar()`, `util/stalk.js` (26 KB) an `sideStalk()` — alle drei laufen auf jeder Seite.

Der einzige große Posten, der nicht seitenweise, aber sehr wohl bedarfsweise teilbar war, ist die Übersetzungstabelle: **78 KB, sechs Sprachen, ein Eintrag pro Schlüssel mit allen sechs Zeichenketten**. Jeder Spieler hat immer fünf davon geparst, um eine zu lesen.

Aufgeteilt nach `src/util/translations/<lang>.js`, eine Datei je Sprache. **Englisch bleibt statisch importiert**, weil es der Rückfall für jeden Schlüssel ist, den die Spielersprache nicht hat; die anderen fünf hängen an je einem wörtlichen `import()`. Ein aus der Sprachvariablen zusammengesetzter Pfad hätte gelintet, gebaut und **in gar keinen Chunk geteilt** — deshalb ein `switch` mit fünf Literalen und ein Test, der genau das festhält.

Geladen wird in `ogCore.js` direkt nach `domReady()` **ohne `await`**; gewartet wird erst hinter dem DOMPurify-Wächter. Zwischen beiden Punkten übersetzt nichts, der Abruf überlappt also Konstruktion und Wartezeit, statt sie zu verlängern. Nach `DOMContentLoaded` muss er liegen, weil die Sprache aus einem `<meta>`-Tag kommt, das zur Modulauswertungszeit noch nicht existiert (Leitplanke 5).

Zwei Schlüssel sind dabei entfallen, `tech.label` und `text.166`: beide führten alle sechs Sprachen als `undefined` und lieferten vorher wie nachher `""`.

**Preis der Aufteilung:** ein neuer Text ist jetzt sechs Änderungen statt einer, und fünf davon zu vergessen ist unsichtbar — die fehlenden Sprachen fallen auf Englisch zurück und sehen für den Autor richtig aus. `test/util/translations.test.js` (6 Tests) nennt deshalb Datei und Schlüssel: gleiche Schlüsselmenge in allen sechs, keine leeren Zeichenketten (eine leere gewinnt gegen den Rückfall und zeigt dem Spieler ein leeres Feld), alle sechs eingefroren.

### Ein echter Fehler, gefunden beim Schneiden

`technoDetail()` baute die Zugehörigkeitsprüfung **20-mal von Hand** nach — `page == "research" || page == "lfresearch"` und `page == "supplies" || page == "facilities" || page == "lfbuildings"`. Solange die Prüfung einmal in der Funktion stand, war das eine Stilfrage. Mit dem Chunk stehen zwei Prüfungen in zwei Dateien, und **die äußere gewinnt lautlos**: eine Seite, die in `ogCore.js` aus der Liste fällt, ist nirgends ein Fehler — das Baudetail-Panel erscheint dort einfach nicht mehr, und niemand bekommt eine Meldung.

`src/util/enum/gamePages.js` hält jetzt drei eingefrorene Listen (`BUILD_PAGES`, `RESEARCH_PAGES`, `LEVELED_BUILDING_PAGES`), beide Seiten der Chunk-Grenze lesen dieselbe, und `test/util/gamePages.test.js` (7 Tests) schlägt fehl, sobald eine solche Kette zurückkommt.

`shipyard` und `defenses` gehören zu **keiner** der beiden Unterlisten, und das ist Absicht: es sind Bauseiten, aber ein Schiff hat keine Stufe, über die `building()` summieren könnte. Der Test nagelt das fest, weil das „Vervollständigen" der Liste der naheliegende falsche Fix ist.

### Wächter

`test/bundle.test.js` wertet jetzt **jeden** Chunk aus, nicht nur den Kern: jeder ist lesbar (nicht minifiziert), keiner trägt lokale Dateipfade, jeder wertet sich ohne Ausnahme aus, keiner liegt außerhalb von `chunks/` — sonst steht er in keinem `web_accessible_resources` und 404t genau in dem Moment, in dem der Benutzer klickt — und beide Manifeste führen `chunks/*`.

Die Größe des Einstiegs ist als **`< 512_000` Bytes** festgehalten, also das Exit-Kriterium dieser Phase als Zahl, auf die ein Test fehlschlagen kann. Dazu eine Namensliste der Chunks, die existieren müssen: fehlt einer, ist ein statischer Import zurückgekrochen und hat das Modul in den Kern gezogen. Das macht nichts kaputt und ist ohne diesen Test unsichtbar — genau die Fehlerklasse aus Phase 3, Punkt 6.

### Exit-Kriterien

| Kriterium                  | Ziel      | Ist                                                   |
| :------------------------- | :-------- | :---------------------------------------------------- |
| Kern-Bundle (Page-Context) | < 500 KB  | **472 KB** (483.493 Bytes), per Test gedeckelt        |
| Overview-Seitenaufruf      | weniger   | **472 KB statt 1.132 KB** — gerechnet, nicht gemessen |
| `test/bundle.test.js`      | pro Chunk | **jeder Chunk**, 9 Tests                              |
| `web_accessible_resources` | beide     | **beide**, `chunks/*`, per Test geprüft               |
| Tests gesamt               | —         | 516 → **541**                                         |
| `npm run check`            | 0 Fehler  | **0**                                                 |

**Das Startup-Profil ist weiterhin offen** — dieselbe Lücke wie am Ende von Phase 3. Die Zahl oben ist gerechnet, nicht gemessen: sie sagt, wie viele Bytes ein Overview-Aufruf lädt und parst, nicht wie viele Millisekunden das spart. `localStorage["ogi-perf"] = "1"` vor und nach dem Schnitt auf einer echten OGame-Seite steht aus.

**Was diese Phase bewusst nicht getan hat:** die drei großen seitenübergreifenden Posten angefasst (`empire/production.js`, `empireOverview/resourceDetail.js`, `util/stalk.js`, zusammen 84 KB). Alle drei hängen an `renderPlanetBar()` oder an `sideStalk()`. Sie kleiner zu bekommen heißt, sie umzustrukturieren, nicht sie zu verschieben — und das ist ausdrücklich nicht, was diese Phase tut.

## Phase 6 — Altlasten, laufend

Kleinere Punkte, keine eigene Phase nötig, aber nicht vergessen. Jeder ein eigener Commit.

- **Regelverstoß, weiterhin offen — bewusst übersprungen.** `ogCore.js:17815` startet auf Overview-Seite ein `setInterval`, das `location.reload()` aufruft, sobald Rohstoffspeicher volläuft. Timergesteuerter Seiten-Reload, damit **`AGENTS.md` §1.3 verboten** („Auto refreshing/reloading game page (timer or otherwise)"). `docs/performance.md` weist bereits darauf hin. Produktentscheidung, kein Refactoring: entweder entfernen oder in etwas umbauen, das Spieler selbst auslöst — **vor nächster Toleration-Einreichung**. Beide anderen `location.reload()`-Stellen (3134, 3145) in Ordnung, laufen aus Click-Handler. Auftrag für diesen Durchlauf war ausdrücklich, diesen Punkt auszulassen — steht weiterhin offen.
- **`tchat` überlebt keine Navigation — ERLEDIGT.** `chat()` (`ogCore.js`) setzte bei jedem Seitenaufruf `OGBIData.json.tchat = !!document.querySelector("#chatBar")` — überschrieb also den gespeicherten Wert mit „existiert das Element gerade im DOM", was auf jeder Seite mit Chat fast immer `true` ist, unabhängig davon, ob der Spieler ihn zuvor versteckt hatte. Entscheidung: das Feld ist das **gespeicherte Nutzer-Häkchen**, nicht die DOM-Beobachtung — dafür existiert bereits der Write-Through-Setter `OGBIData.tchat`, den `toggleChat()` sauber benutzt. Die Existenzprüfung („hat diese Seite überhaupt einen Chat-Balken") ist jetzt eine lokale, unpersistierte Variable; sie entscheidet nur noch über den frühen Return.
- **`flying` wird an zwei Stellen anders behandelt — ERLEDIGT, echter Fehler dabei gefunden.** `util/needs.js` schrieb bei jedem Planetenleisten-Aufbau `OGBIData.json.flying = flying()` — ohne `Save()`, aber in-memory, auf **demselben** Feld, das `ctxpage/eventbox/index.js` als persistierte Baseline für seinen Ankunfts-Diff braucht (alte vs. aktuelle Flugliste, um ein gelandetes eigenes Schiff zu erkennen und dessen Fracht gutzuschreiben). `display()` in `needs.js` hängt an einem `MutationObserver` auf `#eventboxContent` und läuft als Microtask praktisch immer **vor** dem 10-ms-Poll in `eventBox()` — überschrieb also die aus der letzten Navigation persistierte Baseline mit einem Schnappschuss von _derselben_ Seite, bevor `eventBox()` sie je gesehen hatte. Der Diff fand dadurch fast nie einen Unterschied, und die Gutschrift ankommender Fracht lief ins Leere. Fix: `needs.js` bekommt eine eigene modul-lokale Variable (`currentFlying`) für seine Sperr-Icon-Berechnung; `OGBIData.json.flying` wird nur noch von `eventBox()` geschrieben. Zwei neue Tests in `test/util/needs.test.js` nageln beide Garantien fest: `display()` fasst das persistierte Feld nicht an, `getNeedsByCoords()` rechnet trotzdem mit frischer Flugfracht.
- **Polling auf ein Promise — ERLEDIGT.** Zwei Stellen in `ogCore.js` (`empireBtn`, `statsBtn`) starteten `setInterval(…, 20)`, um auf `this.isLoading` zu warten, während `updateEmpireData()` direkt daneben ein Promise zurückgab, das verworfen wurde. Jetzt wird das Promise gehalten (`const dataReady = updateEmpireData(…)`), der Chunk-Import läuft parallel dazu, und am Ende steht ein `await dataReady`. Als Beifang derselben Fehlerklasse: `ctxpage/stats/index.js` pollte per `setInterval(…, 50)` auf das globale `Chart`, nachdem es per Event dessen Nachladen angestoßen hatte — ersetzt durch `wait.waitForDefinition(window, "Chart")`, denselben Helfer, den der Boot-Pfad schon für `DOMPurify` benutzt.
- **jQuery.** Unverändert offen, wie geplant — keine Panik-Migration. 87 `$(…)`-Stellen hängen am jQuery der Spielseite; neuer Code nutzt es nicht.
- **`innerHTML` — geprüft, nichts zu tun.** Alle verbliebenen direkten `.innerHTML`-Zugriffe sind entweder lesend (XML-Textinhalt vergleichen) oder die sanktionierten Implementierungsstellen selbst (`Element.prototype.html`, `util/dom.js`s `createDOMSanitized`). Keine unsanitisierte direkte Zuweisung außerhalb dieser beiden Stellen gefunden.
- **Verzeichnisname stimmt nicht — ERLEDIGT.** `src/ctxcontent/services/analyzer/` (Page-Context, aber unter dem Content-Context-Verzeichnisnamen) nach `src/ctxpage/messages/analyzer/` verschoben. Reine Umbenennung: beide Pfadtiefen sind identisch, `util/`-Importe in den fünf Analyzer-Klassen und `Object/SpyReport.js` blieben unverändert; nur der `messagesTabs`-Import (`../../../ctxpage/messages/index.js` → `../index.js`) und die Importe in `messages/index.js` selbst (`./analyzer/…`) mussten angepasst werden. `test/ctxcontent/analyzers.test.js` zog mit nach `test/ctxpage/messages/analyzers.test.js`.
- **Doku-Drift — bereits erledigt.** `CLAUDE.md` beschreibt die Übersetzungsaufteilung (`src/util/translations/<lang>.js`, sechs `.js`-Dateien, `en` statisch, fünf als Chunks) und `background.js` (481 Zeilen) bereits korrekt — offenbar im selben Durchlauf erledigt, der Phase 5 die echte Aufteilung gebaut hat. Keine der drei ursprünglich genannten Karteileichen (`<lang>.json`, `make translations`, `scripts/split-translations.mjs`) taucht noch in `CLAUDE.md` auf. `docs/testing.md` verwies noch auf den alten Analyzer-Pfad — mit der Verzeichnisumbenennung oben korrigiert.
- **Uhrzeit-/Statusleiste, aus `showTabTimer()` gerettet.** Unverändert: reine Entwurfsnotiz für `docs/roadmap.md`, kein Handlungsbedarf in diesem Durchlauf.
- **`packaging.sh` — offen gelassen.** Bash + `zip` + GNU-`sed -i`, läuft auf Windows nur aus Git Bash/WSL (`make build` shellt dafür ohnehin nach Bash aus — kein blockierendes Problem, nur ein Portabilitäts-Komfort). Ein Node-Port bräuchte eine neue Abhängigkeit für das Zip-Schreiben (`archiver` o. ä.), die aktuell nirgends im Repo steckt — das ist eine Paketentscheidung, keine reine Verschiebung, deshalb hier ausgelassen statt sie unangekündigt einzuführen.
- **16 MB HAR-Datei im Repo — gegenstandslos.** `analysis/s282-de.ogame.gameforge.com.har` existiert nicht mehr im Arbeitsbaum und ist auch nicht (mehr) getrackt (`git ls-files` findet keine `.har`-Datei). Nichts zu tun.
- **Überfällige Versions-Altlasten aus Abschnitt 3.2 — bereits erledigt.** v12-Support ist seit Phase 2 gefallen, Abschnitt 3.2 ist selbst schon als „ERLEDIGT (Phase 2)" markiert. Der Verweis hier war stehen geblieben, obwohl nichts mehr offen ist.
- **PTRE-Team-Key ohne Fehlermeldung — ERLEDIGT.** `settings/index.js`: ein Format-Fehler beim Team-Key setzte `OGBIData.json.options.ptreTK` still auf `""` zurück, mit einem `// TODO` statt einer sichtbaren Meldung — PTRE blieb `DISABLED`, ohne dass der Spieler einen Grund sah. Jetzt erscheint unter dem Eingabefeld eine Fehlermeldung mit dem erwarteten Format, sobald das Eingegebene nicht leer und nicht gültig ist; ein leeres Feld (bewusst „PTRE aus") bleibt fehlerfrei.

---

## 4. Was dieser Plan bewusst **nicht** vorsieht

- **Kein Framework.** Kein React, kein Vue. Extension injiziert in fremdes DOM, das Spielserver kontrolliert; virtuelle DOM-Schicht darüber kauft nichts und kostet Bundle-Größe und Review-Aufwand (`AGENTS.md` §0: Quelltext muss lesbar bleiben).
- **Kein TypeScript-Umstieg.** Skripte sind ausdrücklich reines JavaScript. Wenn Typsicherheit gewünscht: billiger Weg ist JSDoc plus `checkJs` — inkrementell, ohne Buildschritt, ohne dass Reviewer transpilierten Code liest.
- **Kein Umschreiben von `util/`-Modulen mit guter Abdeckung.** `harvestPlanner`, `expeditionBalancer`, `productionEngine`, `targetClaims`, `fleetCost`, `defenceCost` stehen bei 100 %. Fertig.
- **Kein Deferred-Write für `OGBIData`.** Gemessen, gebaut, zurückgenommen. Begründung in `docs/performance.md`.

---

## 5. Zielbild

| Messung                     | heute                                 | Ziel                                            |
| :-------------------------- | :------------------------------------ | :---------------------------------------------- |
| größte Datei                | 19.024 Zeilen                         | < 2.000                                         |
| Dateien > 1.000 Zeilen      | 2                                     | 0 (außer `translate.js`)                        |
| `npm run check`             | 0 (Phase 0)                           | 0, in CI erzwungen — erreicht                   |
| Zeilenabdeckung             | 68 % (ohne 34 Dateien)                | > 75 %, ogCore.js dabei                         |
| Kern-Bundle (Page-Context)  | 1,13 MB                               | < 500 KB                                        |
| Zugriffswege auf `ogk-data` | ~~2~~ 1 (Phase 4)                     | 1 — erreicht                                    |
| Produktionsmodelle im Repo  | 3                                     | 1 (`productionEngine.js`)                       |
| `TODO`/`WIP`/`@deprecated`  | 41, keiner mit Ticket                 | 0 aus dem Altbestand; neue nur als `TODO(#123)` |
| `KNOWN BUG:`-Tests          | 11                                    | 0 (jeder Fix nimmt sein Präfix mit)             |
| getrackte tote Bäume/Blobs  | `local-extension-backup/` + 16 MB HAR | 0                                               |
| offene `AGENTS.md`-Verstöße | 1                                     | 0                                               |

Letzte Zeile ist wichtigste. Alles andere ist Komfort; Verstoß gegen Regeln der Origin-Toolentwickler kostet im Zweifel das Recht, Tool überhaupt zu veröffentlichen.
