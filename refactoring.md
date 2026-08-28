# Refactoring-Plan

Stand: 2026-08-27, Branch `master` (`33c1485`).

Dieser Plan beschreibt, **in welcher Reihenfolge** die Codebasis entzerrt wird und **woran man
erkennt, dass eine Phase fertig ist**. Er ersetzt keine Feature-Roadmap (`docs/roadmap.md`) und
keine Performance-Analyse (`docs/performance.md`) — er sagt, wie der Code dahin kommt, dass beides
noch wartbar bleibt.

---

## 0. Ausgangslage in Zahlen

Alle Zahlen aus dem aktuellen `master` gemessen, nicht geschätzt.

| Messung                                | Wert                                                               |
| :------------------------------------- | :----------------------------------------------------------------- |
| `src/**` ohne `libs/`                  | ~~33.859~~ **33.580** Zeilen (Phase 1)                             |
| davon `src/ogkush.js`                  | ~~19.024~~ **18.654 Zeilen (55 %)**, **151 Methoden** (Phase 1)    |
| Testabdeckung gesamt                   | 68,1 % Zeilen — aber `ogkush.js` ist **nicht dabei**               |
| Dateien ohne jede Abdeckung            | 34, darunter `ogkush.js`, `background.js`, alle 5 Message-Analyzer |
| `npm run check`                        | ~~404 Fehler~~ **0** — Phase 0 erledigt, gatet in CI               |
| `document.querySelector*` in ogkush.js | 424                                                                |
| `this.json.*` vs. `OGIData.*`          | 755 vs. 120 — zwei Zugriffswege auf denselben Store                |
| `this.saveData()`                      | 82 Aufrufe, jeder serialisiert den kompletten Blob                 |
| jQuery `$(…)`                          | 87 Stellen                                                         |
| `setInterval`                          | 15 Stellen, drei davon reine Polling-Schleifen auf ein Promise     |
| Tote Methoden in ogkush.js             | 13 (nur Definition, kein erreichbarer Aufruf)                      |
| `TODO`/`FIXME`/`WIP`/`@deprecated`     | 41 Marker in 7 Dateien — vollständige Liste in Abschnitt 3         |
| Toter Zweitbaum im Repo                | `local-extension-backup/`, 123 Dateien, 33.535 JS-Zeilen, getrackt |

Die vier größten Methoden allein: `betterFleetDispatcher()` 1.545 Zeilen, `minesStats()` 1.264,
`settings()` 899, `technoDetail()` 886. Zusammen 4.594 Zeilen in vier Funktionen.

---

## 1. Leitplanken — gelten in jeder Phase

Diese Punkte sind **nicht verhandelbar** und begrenzen, was ein Refactoring überhaupt tun darf:

1. **AGENTS.md schlägt jede Architektur-Präferenz.** Kein Refactoring darf die Zahl der
   Hintergrund-Requests pro Seitenaufruf erhöhen, Aktionen bündeln, etwas zeitlich verzögern oder
   Code unlesbar machen. Wer eine Datei aufteilt, teilt auch die Compliance-Kommentare mit auf.
2. **Kein Minifizieren, kein Obfuskieren** — das Review der Origin-Toolentwickler liest den Quelltext
   (`AGENTS.md` §0). Der Rollup-Build bleibt `treeshake: false`, ohne Terser.
3. **`test/bundle.test.js` muss grün bleiben.** Bündeln bricht Modul-Auswertungsreihenfolge lautlos;
   dieser Test ist die einzige Stelle, die das merkt. Jede Verschiebung von Top-Level-Code wird
   dagegen geprüft.
4. **Der `OGIData`-Write-Through-Contract bleibt.** `OGIData.options = {...}` persistiert,
   `OGIData.options.foo = 1` nicht. Das ist dokumentiert und mit `TRAP:`-Tests festgenagelt
   (`docs/performance.md`, „Coalescing the store writes — reverted"). Wer daran arbeitet, reduziert
   die **Zahl** der Schreibvorgänge, verzögert sie nicht.
5. **Nichts im Page-Context liest DOM zur Modul-Auswertungszeit.** `ogkush.js` wird bei
   `document_start` injiziert, `<head>` ist dann leer. Neue Module folgen dem Lazy-Muster von
   `OgamePageData` und `translate.js`.
6. **`src/manifest.json` und `src/manifest-firefox.json` immer im Paar ändern.**
7. **Jede Phase ist einzeln releasbar.** Kein „Big Bang"-Branch, der drei Wochen offen liegt.

---

## 2. Reihenfolge und Begründung

Die Reihenfolge ist nicht beliebig. Sie folgt der Regel: **erst das Sicherheitsnetz, dann die
Schnitte.**

```
Phase 0  Werkzeug reparieren        [ERLEDIGT]  -> Lint ist grün und gatet in CI
Phase 1  Toter Code + Delegaten     [ERLEDIGT]  -> 370 Zeilen weg, 123 Dateien untracked
Phase 2  Charakterisierungstests    (1-2 Wochen)-> Netz für alles Folgende
Phase 3  ogkush.js aufteilen        (Wochen)    -> der eigentliche Schnitt
Phase 4  Store-Zugriff vereinheitl. (1 Woche)   -> this.json -> OGIData
Phase 5  Seitenweises Code-Splitting(1 Woche)   -> Boot-Payload halbieren
Phase 6  Altlasten & Doku-Drift     (laufend)
```

Phase 3 **ohne** Phase 2 zu machen, ist der klassische Fehler bei einer 19k-Zeilen-Datei ohne
Tests: Man merkt die Regression erst im Live-Universum.

**Quer dazu, jederzeit machbar** (hängt an keiner Phase, blockiert keine):

- Die drei `universe.*`-Helfer an `universe.expirations.js` anschließen — Abschnitt 3.1.
- Neun der elf `KNOWN BUG:`-Tests einzeln fixen — Abschnitt 3.7. Die anderen zwei laufen in Phase 2 mit.

Abschnitt 3 ist die vollständige Marker-Inventur; jeder einzelne Marker ist dort einer Phase oder
einem dieser Quer-PRs zugeordnet.

---

## 3. Bestandsaufnahme: `TODO`, `FIXME`, `WIP`, `@deprecated`

Vollständige Liste aus `src/`, `test/`, `scripts/`, `packaging.sh`, `Makefile` — ohne `src/libs/`
(Fremdcode) und ohne `local-extension*` (siehe Phase 1, Problem E). **41 Marker in 7 Dateien**,
27 davon in `ogkush.js`.

Kein einziger ist so notiert, dass er wiederauffindbar wäre: kein Ticketbezug, kein Datum, kein
Autor. Ein Teil ist deshalb älter als das Spielrelease, auf das er wartet.

Sie sind hier nach **Ursache** gruppiert, nicht nach Datei — weil sich sonst nicht sehen lässt, dass
sechs davon dieselbe eine fehlende Verdrahtung beschreiben.

### 3.1 Cache-Ablauf im Content-Context — 6× derselbe TODO, das Modul existiert bereits

| Datei                                      | Zeilen  | Text                                                |
| :----------------------------------------- | :------ | :-------------------------------------------------- |
| `ctxcontent/helpers/universe.alliances.js` | 9, 39   | „need validation / save cache expiration timestamp" |
| `ctxcontent/helpers/universe.highscore.js` | 55, 100 | dito (`filter {typesToUpdate}` / speichern)         |
| `ctxcontent/helpers/universe.players.js`   | 16, 37  | dito                                                |

**Das ist kein Entwurfsproblem.** `src/ctxcontent/services/universe.expirations.js` existiert, hat
`isUniverseExpired()` und `setUniverseExpiration()` — und wird von genau **einem** Helfer benutzt,
`universe.data.js`. Die drei anderen Helfer haben stattdessen einen Kommentar bekommen.

Folge im Betrieb: Allianz-, Highscore- und Spielerdaten im `chrome.storage.local` haben kein
Ablaufdatum. Sie werden entweder öfter geholt als nötig — jeder Hintergrund-Request erzeugt
Aktivität (`AGENTS.md` §4) — oder sie veralten unbemerkt. Beides ist relevant, nicht kosmetisch.

→ **Einordnung: eigener kleiner PR, unabhängig von den Phasen.** Drei Helfer auf
`universe.expirations.js` umstellen, `universe.expirations.js` (heute 0 % Abdeckung) mittesten.

### 3.2 OGame-Versions-Altlasten — drei Blöcke, vier Marker, alle überfällig

| Ort                                                              | Bedingung                                        |
| :--------------------------------------------------------------- | :----------------------------------------------- |
| `ogkush.js:3652`–`3702` (`topBarUtilities`)                      | „temporary until +12 ogame came into production" |
| `ctxcontent/services/analyzer/ExpeditionMessagesAnalyzer.js:265` | „remove after v12"                               |
| `ctxcontent/services/analyzer/Object/SpyReport.js:146`           | „after 11.16.0, … no need of regex & cleanValue" |

Der Code kennt bereits `OgamePageData.isAtLeast_13_0_0` und schaltet daran Selektoren um — v13 ist
also draußen, v12 und 11.16 sind Vergangenheit. Diese drei Blöcke warten damit auf ein Ereignis,
das längst eingetreten ist.

→ **Einordnung: Phase 6.** Aber erst prüfen, ab wann v12 wirklich nicht mehr unterstützt wird;
`CLAUDE.md` verlangt bis dahin beide Zweige. Wenn v12-Support fällt, fallen diese drei Blöcke, die
`isAtLeast_13_0_0`-Verzweigungen und ein Teil der Fixture-Arbeit aus Phase 2 zusammen weg — deshalb
gehört diese Entscheidung **vor** Phase 2 getroffen, nicht danach.

### 3.3 Produktionsberechnung — 8 TODOs, und es gibt bereits einen getesteten Zweitmotor

`updateEmpireProduction()` (`ogkush.js:12539`–`12818`, 279 Zeilen, mit `// WIP` überschrieben) trägt:

| Zeile   | Lücke                                                                                         |
| :------ | :-------------------------------------------------------------------------------------------- |
| `12542` | `productionFactor = 1` fest verdrahtet — „change use in fleetDispatcher with computed factor" |
| `12598` | Solarsatelliten-Energie wird nicht berechnet (`3: 0`)                                         |
| `12626` | Ingenieur-Energie wird nicht berechnet (`3: 0`)                                               |
| `12686` | „compute energy detailed production if used"                                                  |
| `12718` | Fusionsreaktor-Faktor fehlt                                                                   |
| `12738` | Crawler-Prozentsatz geraten statt berechnet                                                   |
| `14123` | Lifeform-Verbrauchsreduktion fehlt                                                            |
| `14373` | „check if own population factor is needed"                                                    |

Gleichzeitig liegt in `src/util/productionEngine.js` ein Produktionsmodell mit **100 % Abdeckung**
(`plasmaBonus`, `effectiveCrawlers`, `crawlerBonus`, `realProduction`, `productionBreakdown`) — das
aber nur an **einer** Stelle benutzt wird, in `realProductionTooltip()`. Eine dritte Kopie der
Crawler-Mathematik steht in `roiMine()` (`ogkush.js:16599`–`16688`).

Drei Modelle, eines davon getestet, und die Löcher stecken ausgerechnet in den zwei ungetesteten.

→ **Einordnung: Phase 3, Modul 1 (`util/gameFormulas.js`) und Modul 8.** Beim Herausziehen wird
`productionEngine.js` die einzige Quelle; die acht TODOs werden dabei zu acht Tests, die zunächst
das heutige (unvollständige) Verhalten festschreiben. Erst danach kann man die Physik ergänzen,
ohne zu raten, was man gerade kaputtmacht.

### 3.4 `@deprecated`, aber überall benutzt

| Ort                        | Alias                                | Ersatz                        |
| :------------------------- | :----------------------------------- | :---------------------------- |
| `ogkush.js:140`            | `createDOM`                          | `DOM.createDOM`               |
| `ogkush.js:145`            | `createSVG`                          | `DOM.createSVG`               |
| `ogkush.js:151`            | `toFormatedNumber`                   | `Numbers.toFormattedNumber`   |
| `ogkush.js:156`            | `fromFormatedNumber`                 | `Numbers.fromFormattedNumber` |
| `ogkush.js:14081`          | `Element.prototype.html` / DOMPurify | globale Funktion              |
| `SpyReport.js:158`, `:171` | zwei Getter                          | — nicht benannt               |

Die vier Modul-Aliase sind der Hauptgrund, warum `ogkush.js` sich nicht sauber schneiden lässt: sie
sind Datei-globale Kurznamen, die jede herausgezogene Datei mitnehmen müsste.

→ **Einordnung: Phase 3, als mechanischer erster Schritt jedes Schnitts.** Wer ein Modul
herauszieht, ersetzt darin die Aliase durch die Importe. Die Aliase in `ogkush.js` fallen weg,
sobald die letzte Nutzung weg ist. Für `SpyReport.js:158/171` fehlt die Angabe, wodurch zu
ersetzen ist — das muss der Autor klären, sonst ist die Markierung wertlos.

### 3.5 Abgeschaltete Features, die noch im Startpfad hängen

- **Tooltip-Kette** (`ogkush.js:106`, `:1763`, `:14935`) — siehe Phase 1, Problem D. ~120 tote
  Zeilen, ein wirkungsloser Aufruf in `start()`.
- **`showTabTimer()`** — der Aufruf ist in `start()` (`ogkush.js:1782`) auskommentiert, die Methode
  (`:18704`, ~22 Zeilen) enthält einen siebenzeiligen TODO-Block: in den Uhrbereich verschieben,
  OGame-Zeitstempel nutzen, Zeitzonen-Indikator und Ping-Anzeige integrieren, Performance-API statt
  eigener Messung, umbenennen, wieder aktivieren. Das ist ein **Feature-Entwurf im Kommentar**, kein
  TODO. Er gehört nach `docs/roadmap.md` oder in ein Issue; die Methode wird gelöscht.

→ **Einordnung: Phase 1 (löschen), Entwurf nach `docs/roadmap.md` umziehen.**

### 3.6 Einzelne, kleine, echte Aufgaben

| Ort                                      | Aufgabe                                                                                                                                                                    | Wohin                                            |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| `ogkush.js:12228`–`12232`                | `updateLifeform()`: `// WIP` + „temporary hack until code reworked to work with unique needLifeformUpdate" — setzt das Flag für **alle** Planeten zurück, statt pro Planet | Phase 3, Modul 8                                 |
| `ogkush.js:13699`                        | `checkDebris()`: „reuse code?, hide debris image with css?, align style"                                                                                                   | Phase 3, Modul 5                                 |
| `ogkush.js:14634`                        | „make throttle class for reuse it?" — Drosselung ist ad hoc eingebaut                                                                                                      | Phase 3, dann `util/`                            |
| `ogkush.js:16075`                        | PTRE-Team-Key: ungültiges Format wird **stillschweigend** geschluckt, Fehlertext fehlt                                                                                     | Phase 6, kleiner UX-Fix                          |
| `ogkush.js:19008`                        | „workaround for 'DOMPurify not defined' issue" — der `waitForDefinition`-Block im Boot                                                                                     | bleibt, aber Kommentar erklärt das _Warum_ nicht |
| `messages-analyzer/index.js:513`         | auskommentierter Deuterium-Parser                                                                                                                                          | Phase 1, Punkt 5                                 |
| `ctxcontent/helpers/universe.data.js:75` | „Need mapping implementation to lifeforms" — der einzige `universe.*`-TODO, der **nicht** zu 3.1 gehört                                                                    | eigener PR, zusammen mit 3.1                     |
| `scripts/install-local.mjs:61`           | erklärender Kommentar zu Firefox-Temporär-Add-ons                                                                                                                          | kein Handlungsbedarf                             |

### 3.7 Die andere Sorte Marker: `KNOWN BUG:` und `TRAP:` in den Tests

Diese sind **kein** Wildwuchs, sondern die Repo-Konvention aus `docs/testing.md`: Tests, die
absichtlich falsches Verhalten festschreiben, damit ein Fix als bewusste Änderung sichtbar wird.
Aktuell **11 `KNOWN BUG:`** und **3 `TRAP:`**.

Die drei `TRAP:`-Tests (`test/util/OGIData.test.js:127`, `:187`, `:206`) beschreiben den
Write-Through-Contract und bleiben — sie sind Leitplanke 4 in Testform.

Die elf `KNOWN BUG:`-Tests sind echte Fehler mit bekanntem Ort:

| Datei                                      | Zeilen        | Kurz                                                                                                                             |
| :----------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------- |
| `test/util/service.callbackEvent.test.js`  | 46, 349, 366  | Bridge: `ReferenceError` ohne `chrome`; Token wird mit `"1"` überschrieben; Anfrage auf unbekanntes Token wird **nie** aufgelöst |
| `test/util/ogame.coordinate.test.js`       | 125, 138, 148 | Falscher Fehlertyp; `toNumber` ignoriert Instanztyp; `toString` liefert `undefined` statt zu werfen                              |
| `test/ctxcontent/universe.helpers.test.js` | 219, 235      | Formatiertes XML lässt die Parser abstürzen; Fehlerantwort kommt als `TypeError`                                                 |
| `test/util/OGIData.construction.test.js`   | 56            | Beschädigter `localStorage`-Inhalt lässt den Import abstürzen                                                                    |
| `test/util/runContext.test.js`             | 103           | Unbekannter Browser wirft, statt einen Kontext zu melden                                                                         |
| `test/util/numbers.test.js`                | 64            | Präzision `0` wird ignoriert                                                                                                     |

Zwei davon sind mehr als Schönheitsfehler: **eine nie auflösende Promise** in der Bridge
(`service.callbackEvent.test.js:366`) hängt die aufrufende Stelle dauerhaft, und **ein Absturz bei
beschädigtem `localStorage`** (`OGIData.construction.test.js:56`) bedeutet, dass eine einzige
kaputte Speicherung die Extension unbenutzbar macht, ohne Selbstheilung.

→ **Einordnung: die zwei oben in Phase 2 mitnehmen** (dort wird die Bridge und `OGIData` ohnehin
angefasst), die restlichen neun als eigene kleine PRs, jeweils „Fix + Präfix am Test entfernen",
wie `docs/testing.md` es vorschreibt. Kein stilles Löschen eines Tests.

### 3.8 Regel für neue Marker

Ab sofort gilt: **ein `TODO` ohne Ticketbezug ist kein `TODO`, sondern eine Notiz an niemanden.**
Neues Format, ein Zeile, prüfbar per Lint:

```js
// TODO(#123): kurze Beschreibung — Bedingung, unter der es fällig wird
```

Ohne Nummer: entweder sofort machen oder gar nicht schreiben. Der ESLint-Regelsatz aus Phase 0 kann
das über `no-warning-comments` erzwingen, sobald der Altbestand abgearbeitet ist — vorher nicht,
sonst ist Lint wieder rot und niemand schaut hin.

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

240 dieser Fehler waren **selbst verursacht**: `.eslintrc.cjs` erweiterte `"prettier"` (das genau
diese Stilregeln abschaltet) und schaltete danach im `rules`-Block `indent`, `quotes`, `semi` und
`linebreak-style` wieder ein. Sie stritten sich mit Prettier, der dieselben Dinge bereits über
`prettier/prettier` durchsetzt. Ergebnis: Lint war auf korrekt formatiertem Code rot, also schaute
niemand hin, also fielen die **6 echten Funde** nicht auf. Der CI-Test-Workflow übersprang Lint.

**Was gemacht wurde.**

1. **Die vier redundanten Stilregeln aus `.eslintrc.cjs` gelöscht.** `prettier/prettier` bleibt die
   einzige Instanz für Stil. Ein Kommentar an der `extends`-Zeile hält fest, warum dort nichts
   wieder eingeschaltet werden darf. 404 → 164 Fehler, exakt die vorhergesagten 240.
   Mitgelöscht: ein wirkungsloser `overrides`-Block (`files`/`excludedFiles` ohne `rules` ist ein
   No-op; `src/libs/` wird von `.eslintignore` ausgeschlossen).
2. **Die fünf tatsächlich unformatierten Dateien formatiert** — und nur diese fünf:
   `ctxcontent/services/analyzer/ExpeditionMessagesAnalyzer.js`,
   `ctxcontent/services/analyzer/SpyMessagesAnalyzer.js`, `ctxpage/messages/index.js`,
   `ctxpage/traderOverview/TraderImportExportPage.js`, `util/enum/itemImageID.js`.
   `ogkush.js` war bereits Prettier-konform und wurde nicht angefasst.
3. **Die 6 echten Funde behoben**, alle in `ogkush.js`, alle semantisch neutral:

   | Ort              | Fund                    | Änderung                                                                            |
   | :--------------- | :---------------------- | :---------------------------------------------------------------------------------- |
   | `4606`, `4630`   | `no-redeclare`          | `var data = $.parseJSON(data)` → `data = …`; `var` erzeugte hier keine neue Bindung |
   | `12005`, `12006` | `no-extra-boolean-cast` | `if (!!template.fleetSpeed)` → `if (template.fleetSpeed)`                           |
   | `18620` (2×)     | `no-useless-escape`     | `\"` in einem Template-Literal → `"`; identische Zeichenkette                       |

   Kein Fund war ein echter Bug — aber genau das ist der Punkt: das ließ sich vorher nicht sagen,
   weil sie in 398 Phantomfehlern lagen.

4. **Lint scharf geschaltet** in `.github/workflows/test.yml`, als eigener Schritt **nach** den
   Tests (ein Formatierungsverstoß soll kein echtes Testergebnis verdecken).

**Zwei Dinge zusätzlich, beide risikofrei.**

- `npm run check` deckt jetzt auch `scripts/*.mjs` ab, wie `npm run format` es schon tat.
  `bundle.mjs` und `build-unpacked.mjs` sind buildkritisch und waren ungelintet. Sie waren bereits
  sauber — die Lücke schließt sich also ohne eine einzige Änderung an ihnen.
- `.prettierrc` bekommt `"endOfLine": "lf"` explizit. Das ist Prettiers Vorgabewert, ändert also
  nichts, hält aber die Absicht fest, die vorher in der gelöschten `linebreak-style`-Regel steckte.
  Durchgesetzt wird sie ohnehin schon von `.gitattributes` (`* text=auto eol=lf`).

**Bewusst nicht geändert: `printWidth: 120` und `trailingComma: "es5"`.** Beide weichen von
Prettiers Vorgabe (80 / `"all"`) ab, und beide dürften laut Auftrag angefasst werden. Eine Änderung
würde aber den kompletten Baum umformatieren, `ogkush.js` eingeschlossen — also genau der Diff, den
`CLAUDE.md` und Phase 0 („Risiko praktisch keins") vermeiden wollen. 120 Spalten sind eine bewusste,
dokumentierte Projektentscheidung. Falls das doch gewünscht ist: eigener Commit, nichts anderes
darin, und `.git-blame-ignore-revs` anlegen.

**Exit-Kriterium — erfüllt.** `npm run check` = 0 Fehler, `prettier --check` grün über `src`,
`test`, `scripts`, Tests 391/391, Lint gatet in CI.

**Folge für den Rest des Plans.** `no-warning-comments` (Abschnitt 3.8) ist jetzt technisch
einschaltbar — aber erst, wenn der Marker-Altbestand aus Abschnitt 3 abgearbeitet ist. Sonst ist
Lint sofort wieder rot, und der ganze Zweck dieser Phase ist wieder weg.

---

## Phase 1 — Toter Code und Schein-Delegaten — **ERLEDIGT**

`src/ogkush.js`: 19.024 → **18.654 Zeilen** (−370). Getrackte Dateien: 315 → **192** (−123).
Tests 391 → **395**, alle grün. Lint 0. Build läuft (`ogkush.js`-Bundle 1128 KB).

### Problem A — Methoden ohne Aufrufer

Neun der zehn geplanten waren wirklich tot und sind weg: `calcAvailableFret`, `cleanValue`,
`convertDuration`, `generateGalaxyLink`, `getJSON`, `hasActivityChanged`, `recordActivityChange`,
`recordLostConnectivity`, `resetStalk` (148 Zeilen).

**Der zehnte war nicht tot.** `fetchAndConvertRC` (96 Zeilen) wird aus
`ctxpage/messages-analyzer/index.js:385` gerufen, und diese Datei ist live — genau der Punkt, den
Schritt 5 unten offen hält. Der ursprüngliche Plan hatte den Aufruf übersehen, weil er über `this`
aus einem `.call(this)` läuft und in keiner Suche nach `ogKush.fetchAndConvertRC` auftaucht. Er
bleibt, bis die Entscheidung über den Alt-Analyzer gefallen ist. Das erklärt zugleich, warum das
Zeilenziel knapp verfehlt wurde: diese eine Methode ist mehr als die Hälfte der Lücke.

### Problem D — die abgeschaltete Tooltip-Kette

Gelöscht: der `goodbyeTipped`-Kommentarblock (33 Zeilen), `betterTooltip()` samt Aufruf in
`start()`, `showTooltip()`, `betterAPITooltip()` — und im Nachlauf `trashsimTooltip()`,
`this.eventAction` und der dadurch unbenutzte `json.js`-Import. Zusammen 174 Zeilen.

Die Frage „Übergang tipped → tippy passiert oder aufgegeben?" ist entschieden: **passiert.** Beleg
im Code selbst — `ogkush.js` ruft an anderer Stelle `ship._tippy.disable()`. Das Spiel benutzt
tippy, der Workaround wartete auf ein Ereignis, das längst eingetreten war.

**Eine Löschung entfernt ein echtes Feature:** `trashsimTooltip()` baute den Trashsim-Prefill-Button
in Flotten-Tooltips. Er war seit der Abschaltung nicht erreichbar, hing aber nur an `showTooltip()`.
Halb löschen wäre der dritte Zustand, den der Plan verbietet — also ganz weg. Die Historie hat ihn;
wer ihn zurückwill, hängt ihn an den tippy-Pfad, nicht an `Tipped.show`.

Ebenfalls weg: **`showTabTimer()`** (22 Zeilen), dessen Aufruf in `start()` auskommentiert war. Die
Entwurfsnotizen aus dem Kopf der Methode sind nicht verloren, sondern nach Phase 6 gewandert.

### Problem B — Schein-Delegaten

`tooltip()` (3 Aufrufe), `popup()` (15), `formatToUnits()` (1) aufgelöst, Aufrufstellen auf
`utilTooltip.tooltip` / `popupUtil.popup` / `Numbers.formatToUnits` umgestellt.

**Dabei ist ein echter Bug aufgefallen.** `SpyMessagesAnalyzer.js:660` rief `this.popup(…)` — aber
`SpyMessagesAnalyzer` hat keine `popup`-Methode, erbt von nichts und ist nicht die
`OGInfinity`-Klasse. Der Aufruf warf also `TypeError: this.popup is not a function`, und zwar genau
in dem Zweig, der dem Benutzer sagen soll, dass kein externer Simulator konfiguriert ist. Jetzt
direkter Import aus `util/popup.js`. Ohne die Auflösung der Delegaten wäre das nicht aufgefallen:
die gleichnamige Klassenmethode in `ogkush.js` ließ den Aufruf im ganzen Repo plausibel aussehen.

### Problem C — `createDOM` doppelt

`createDOMSanitized()` liegt jetzt in `util/dom.js`, die 52 Aufrufstellen (51 in `ogkush.js`, 1 in
`messages-analyzer`) zeigen darauf, die Klassenmethode ist weg. **Nicht** durch `DOM.createDOM`
ersetzt — der Unterschied ist real und bleibt erhalten:

|                | `createDOM`                   | `createDOMSanitized`                 |
| :------------- | :---------------------------- | :----------------------------------- |
| Inhalt         | `textContent`                 | `innerHTML` via `DOMPurify.sanitize` |
| `0` als Inhalt | übersprungen (falsy)          | wird gerendert                       |
| `<select>`     | bekommt `dropdownInitialized` | bekommt es nicht                     |

Vier neue Tests in `test/util/dom-and-wait.test.js` schreiben genau diese drei Unterschiede fest,
inklusive der Falle, dass `"" == 0` in JS **wahr** ist — der leere String läuft also trotz
„übersprungen" durch den Sanitizer. Erst mit diesem Netz lässt sich später Stelle für Stelle
entscheiden, welche eigentlich `textContent` will.

### Problem E — der Zweitbaum

`local-extension-backup/` ist untracked (`git rm -r --cached`) und steht in `.gitignore`; die
Dateien bleiben auf der Platte, verschwinden aber aus jedem `git grep` und aus ripgrep.
315 → 192 getrackte Dateien.

Vorher geprüft: alle 123 Dateien haben ein Gegenstück in `src/`, keine Schlüssel oder Zugangsdaten
darin, und es ist ein **gestempelter Build**, kein Quellstand — `version.js` steht auf `"1.0.0"`
statt `"__VERSION__"`, und `fetching.js` enthält noch das `window.onbeforeunload`-Muster, das
`test/util/abort.test.js` heute verbietet. Er war also nicht nur redundant, sondern zeigte auf einen
Stand, den das Projekt bewusst verlassen hat.

### Schritt 5 — `messages-analyzer/index.js`: Entscheidung getroffen, Ausführung wartet auf Phase 2

**Entscheidung: der neuere Pfad gewinnt, die Datei wird gelöscht.** Sie ist noch da, weil Phase 2
erst die fünf Analyzer-Klassen abdecken muss. Die Begründung steht als Kopfkommentar in der Datei,
damit sie nicht nur hier steht. Was der Vergleich ergeben hat:

- **Genau ein Feature hat kein Gegenstück** im neuen Pfad: die Zeitzonen-Umschreibung von
  `.msg_date` (`updateTimeZone()`). `msg_date` und `timezoneDiff` kommen in keiner Analyzer-Klasse
  vor. Das ist das Einzige, was vor dem Löschen umziehen muss. Alles andere — `ogk-expedition`,
  `ogk-harvest`, `ogk-combat`, `expeditionSums`, `combats` — existiert doppelt.
- **Beide Pfade schreiben in dieselben Store-Schlüssel und sind sich über die Form uneinig.**
  `HarvestMessagesAnalyzer` legt `harvest: [0, 0, 0]` an (Metall, Kristall, Deuterium), der Alt-Pfad
  `harvest: [0, 0]` und addiert nur auf Slot 0 und 1. Wer ein Datum zuerst sieht, bestimmt die Form.
  Das ist kein Stilproblem, das ist ein Datenfehler mit Laufzeit-Rennen.
- Der auskommentierte Deuterium-Parser (`:513`) war damit erledigt: er beschreibt eine Lücke, die
  nur die sterbende Kopie hat. Der nackte `@TODO` ist raus, die Tatsache steht als Kommentar an der
  Stelle und im Dateikopf.

### Exit-Kriterien

| Kriterium                | Ziel            | Ist                                                     |
| :----------------------- | :-------------- | :------------------------------------------------------ |
| `ogkush.js`              | < 18.500 Zeilen | **18.654** — verfehlt, siehe `fetchAndConvertRC` oben   |
| Methode ohne Aufrufer    | 0               | **0** von 151                                           |
| Funktion doppelt im Repo | 0               | **0** (`createDOM`, `cleanValue`, `generateGalaxyLink`) |
| `git ls-files`           | −123            | **−123** (315 → 192)                                    |
| Tests                    | grün            | **395/395**                                             |

Das Zeilenziel war eine Schätzung in diesem Plan, keine Anforderung, und beruhte auf „10 tote
Methoden, rund 250 Zeilen". Es waren neun mit 148 Zeilen. Die substanziellen Kriterien sind erfüllt;
die restlichen ~150 Zeilen fallen in Phase 3, wenn die `@deprecated`-Aliase mitgehen.

---

## Phase 2 — Charakterisierungstests, bevor irgendetwas geschnitten wird

**Problem.** Die 19.024 Zeilen von `ogkush.js` haben **keine** Testabdeckung. `bundle.test.js`
wertet das Bundle zwar aus, bricht aber erwartungsgemäß im `OGInfinity`-Konstruktor ab — er liest
sofort `meta[name="ogame-player-id"]`. Damit prüft der Test die Auswertungsreihenfolge, nicht das
Verhalten. Dasselbe gilt für `background.js` (481 Zeilen, zwei Klassen, drei `chrome.*`-Listener —
`CLAUDE.md` beschreibt ihn immer noch als „near-empty service worker") und für alle fünf
Message-Analyzer.

**Ziel dieser Phase ist nicht schöne Testabdeckung, sondern ein Netz für Phase 3.** Getestet wird
das, was gleich verschoben wird.

**Vorbedingung: die v12-Frage entscheiden.** Fixtures für zwei Spielversionen zu pflegen ist der
teuerste Einzelposten dieser Phase. Wenn v12-Support ohnehin fällt (siehe Abschnitt 3.2 — drei
Codeblöcke warten explizit darauf), halbiert das die Fixture-Arbeit und löscht nebenbei die
`isAtLeast_13_0_0`-Verzweigungen. Diese Entscheidung gehört **vor** den ersten Fixture-Commit.

**Schritte.**

1. **DOM-Fixtures bauen.** `test/fixtures/` mit je einem gespeicherten Ausschnitt der OGame-Seiten,
   die am meisten Code triggern: Overview, Fleetdispatch, Galaxy, Messages — je für v12 und v13,
   solange beide unterstützt werden, weil `OgamePageData.isAtLeast_13_0_0` die Selektoren umschaltet.
   Ohne beide Varianten testet man die Hälfte.
2. **Konstruktor testbar machen.** `OGInfinity` liest DOM direkt im Konstruktor. Diese Lesevorgänge
   in eine `readPageContext(document)`-Funktion ziehen, die ein einfaches Objekt liefert. Das ist der
   kleinste Eingriff, der die Klasse überhaupt instanziierbar macht — und Voraussetzung für alles
   Weitere.
3. **Charakterisierungstests** für die Rechenkerne, die in Phase 3 wandern und die **kein** DOM
   brauchen: `research()`, `building()`, `minesProduction()`, `consumption()`, `roiMine()`,
   `roiAstrophysics()`, `roiPlasmatechnology()`, `roiLfResearch()`, `roiLfBuilding()`,
   `getBestRoi()`, `calcNeededShips()`, `selectBestCargoShip()`. Sie schreiben fest, **was der Code
   heute tut** — auch wenn es falsch ist. Für bekannt falsches Verhalten die Repo-Konvention nutzen:
   Test mit `KNOWN BUG:` oder `TRAP:` präfixen und in `docs/testing.md` eintragen
   (Fix später = Präfix weg, kein stiller Delete).
4. **`background.js`** bekommt eigene Tests: Notification-Persistenz über `chrome.storage.local`,
   Alarm-Handling, Reaktion auf `chrome.runtime.onMessage`. Er ist der einzige Teil, der einen
   Neustart des Service Workers überlebt — hier tut ein Fehler am meisten weh, und niemand sieht ihn.
5. **Die fünf Message-Analyzer** bekommen je einen Test pro `support()`/`analyze()`-Pfad, mit einem
   gespeicherten Nachrichten-HTML als Eingabe.
6. **Die zwei ernsten `KNOWN BUG:`-Tests mitnehmen** (Abschnitt 3.7), weil ihre Module hier ohnehin
   angefasst werden: die nie auflösende Bridge-Promise
   (`test/util/service.callbackEvent.test.js:366`) und der Absturz bei beschädigtem `localStorage`
   (`test/util/OGIData.construction.test.js:56`). Fix plus Präfix am Test entfernen.

`docs/testing.md` vor dem ersten Test lesen — die beiden nicht offensichtlichen Regeln (`chrome: true`
bei `setupBrowser()` nur für Content-Context-Module; `importFresh()` nur für Konstruktionstests, weil
es die Abdeckungszuordnung zerschießt) stehen dort und sonst nirgends.

**Exit-Kriterium.** Die 12 Rechenkerne oben sind abgedeckt, `background.js` > 70 %, jeder Analyzer
hat mindestens einen Test, `OGInfinity` lässt sich im Test konstruieren, `KNOWN BUG:`-Tests von 11
auf 9.

**Risiko.** Zeitaufwand. Das ist die unbeliebteste Phase und die, ohne die Phase 3 blind ist.

---

## Phase 3 — `ogkush.js` aufteilen

**Problem.** Eine Klasse, 160 Methoden, 19.024 Zeilen, in der Seitensteuerung, DOM-Aufbau,
Spielarithmetik, Netzwerk und Persistenz durcheinanderliegen. Jede Änderung fasst dieselbe Datei an,
also kollidiert jeder Branch mit jedem.

**Schnitt entlang der Achsen, die der Code schon selbst zieht** — nicht entlang „Model/View/
Controller", das hier nichts abbildet. Reihenfolge nach Verhältnis Nutzen zu Risiko:

| #   | Modul                                    | Was hinein wandert                                                                                                                                                                                                                                          | ~Zeilen | Risiko  |
| --- | :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | :------ |
| 1   | `util/gameFormulas.js`                   | `research`, `building`, `minesProduction`, `consumption`, alle `roi*`, `getBestRoi`, `selectBestCargoShip` — reine Arithmetik, kein DOM                                                                                                                     |  ~1.600 | niedrig |
| 2   | `ctxpage/stats/`                         | `statistics`, `generalStats`, `minesStats`, `combatStats`, `expeditionStats`, `discoveryStats`, `roiStats`, alle `*Graph`/`*Box`, `tabs`                                                                                                                    |  ~4.900 | niedrig |
| 3   | `ctxpage/empireOverview/`                | `overview`, `minesOverview`, `fleetOverview`, `defenseOverview`, `harvestOverview`, `resourceDetail`, `updateresourceDetail`                                                                                                                                |  ~1.400 | mittel  |
| 4   | `ctxpage/fleetdispatch/` (existiert)     | `betterFleetDispatcher`, `fleetDispatcher`, `neededCargo`, `openPlanetList`, `preselectShips`, `select*Ships`, `expedition`, `customMissions`, `collect`, `autoHarvest`, `keepOnPlanetDialog`, `initUnionCombat`, `onFleetSent`, `overwriteFleetDispatcher` |  ~3.500 | hoch    |
| 5   | `ctxpage/galaxy/`                        | `onGalaxyUpdate`, `addGalaxyTooltips`, `addGalaxyMarkers`, `applyTargetClaims`, `renderTargetClaims`, `getActivity`, `scan`, `ptreActivityUpdate`                                                                                                           |    ~700 | mittel  |
| 6   | `ctxpage/planetbar/`                     | `renderPlanetBar`, `observePlanetBar`, `minesLevel`, `harvest`, `activitytimers`, `jumpGate`, `updateSpaceShipsPresence`, `markLifeforms`, `sideOptions`                                                                                                    |  ~1.200 | mittel  |
| 7   | `ctxpage/settings/`                      | `settings`, `welcome`, `probingWarning`                                                                                                                                                                                                                     |  ~1.000 | niedrig |
| 8   | `ctxcontent/empire/` (Page-Context-Teil) | `updateEmpireData`, `updateInfo`, `getEmpireInfo`, `updateEmpireProduction`, `updateLifeform*`, `ProcessProductionProgressData`, `updateProductionProgress`                                                                                                 |  ~1.600 | hoch    |

**Was von `ogkush.js` übrig bleiben soll:** die Klasse `OGInfinity` als reiner Aufrufplan —
`constructor`, `init`, `start`, `renderPlanetBar`-Aufruf, der Rest delegiert. Zielgröße unter 2.000
Zeilen.

**Module 1 und 8 räumen nebenbei die Produktionsmathematik auf.** Heute existieren drei Modelle
(Abschnitt 3.3): das getestete `util/productionEngine.js`, das nur in `realProductionTooltip()`
benutzt wird; `updateEmpireProduction()` mit acht offenen TODOs; und eine dritte Crawler-Rechnung in
`roiMine()`. Beim Herausziehen wird `productionEngine.js` die einzige Quelle. Die acht TODOs werden
dabei zu acht Tests, die zuerst das heutige, unvollständige Verhalten festhalten — die Physik
ergänzt man danach, in eigenen Commits.

**Regeln für jeden einzelnen Schnitt.**

- **Ein Modul pro Pull Request.** Branch-Name nach Repo-Konvention:
  `improvement/extract_<modulname>`.
- **Die `@deprecated`-Aliase (Abschnitt 3.4) fliegen beim Schnitt raus.** `createDOM`, `createSVG`,
  `toFormatedNumber`, `fromFormatedNumber` sind datei-globale Kurznamen in `ogkush.js`; ein
  herausgezogenes Modul importiert stattdessen direkt aus `util/dom.js` bzw. `util/numbers.js`.
  Genau diese vier Aliase sind der Grund, warum sich Teile heute nicht sauber lösen lassen.
- **Reine Verschiebung, keine Verbesserung im selben Commit.** Wer beim Verschieben einen Bug sieht:
  eigenen Commit davor oder danach, nie vermischt — sonst ist der Diff nicht mehr prüfbar.
- **Zustand explizit übergeben.** Die Methoden hängen an `this.json`, `this.current`, `this.page`,
  `this.planetList`. Extrahierte Module bekommen das als Parameter oder greifen direkt auf `OGIData`
  zu (siehe Phase 4), sie bekommen **keine** Referenz auf die `OGInfinity`-Instanz. Ein `ogi.foo()`
  im neuen Modul ist der Beweis, dass der Schnitt an der falschen Stelle liegt.
- **Nach jedem Schnitt `test/bundle.test.js` laufen lassen** und mit `make dev` einmal wirklich im
  Spiel nachsehen.
- **`localStorage.setItem("ogi-perf", "1")`** vor und nach jedem Schnitt: die Startup-Tabelle zeigt
  sofort, wenn ein Schritt teurer geworden ist.

**Exit-Kriterium.** `ogkush.js` unter 2.000 Zeilen, keine Datei in `src/` über 1.000 Zeilen außer
`util/translate.js` (siehe Phase 6), Bundle-Test grün, Startup-Profil nicht schlechter als vorher.

---

## Phase 4 — Ein Weg zum Store

**Problem.** `this.json.*` (755 Stellen) und `OGIData.*` (120 Stellen) zeigen auf denselben
`localStorage["ogk-data"]`. `this.json` wird in `init()` einmal auf `OGIData.json` gesetzt und
danach direkt mutiert — das umgeht die Setter, die den Write-Through machen, weshalb es überall
`this.saveData()` braucht (82 Aufrufe). Genau diese Doppelung ist der Grund, warum ein extrahiertes
Modul aus Phase 3 sonst wieder eine Instanzreferenz mitschleppen müsste.

**Schritte.**

1. Erst inventarisieren: welche der 755 Stellen **lesen** nur (trivial umstellbar), welche mutieren
   (brauchen ein `OGIData.x = …` statt `OGIData.x.y = …`).
2. Modul für Modul umstellen, in derselben Reihenfolge wie Phase 3, jeweils direkt nach dem Schnitt.
3. Erst wenn eine Zone vollständig auf Setter umgestellt ist, die dortigen `saveData()`-Aufrufe
   entfernen — sie sind dann redundant.
4. **Kein Deferred Write.** Das wurde bereits versucht und bewusst zurückgenommen
   (`docs/performance.md`). Der Gewinn kommt hier aus _weniger_ Schreibvorgängen, nicht aus
   _späteren_.

**Nebenschauplatz gleicher Art:** `createCallbackToken()` existiert zweimal — in
`util/service.callbackEvent.js` und handkopiert in `src/main.js`, weil ein klassisches Content-Script
nicht importieren kann. Das ist begründet und kommentiert, aber ungetestet: ein Test, der beide
Implementierungen gegeneinander prüft, kostet zehn Zeilen und verhindert ein stilles Auseinanderlaufen.

**Exit-Kriterium.** `this.json` existiert nicht mehr; `saveData()`-Aufrufe unter 20; die
`TRAP:`-Tests in `test/util/OGIData.test.js` unverändert grün.

---

## Phase 5 — Seitenweises Laden

**Problem.** Das Page-Bundle ist 1,13 MB und wird auf **jeder** Seite geladen — OGame ist keine
Single-Page-App, also bei jedem Ansichtswechsel erneut. `docs/performance.md` §6 nennt das
ausdrücklich als „was übrig bleibt": Weiterkommen heißt, den Monolithen so aufzuteilen, dass
seitenspezifischer Code nur noch dort geladen wird, wo er gebraucht wird. Phase 3 macht genau das
möglich.

Der Code sagt selbst, wo die Grenzen liegen: 37 Abfragen auf `this.page`, davon 18 auf
`fleetdispatch`, dazu `galaxy`, `highscore`, `movement`, `shop` und die Baumenüs
(`supplies`/`facilities`/`research`/`shipyard`/`defenses`/`lfbuildings`/`lfresearch`).

**Schritte.**

1. `scripts/bundle.mjs` auf mehrere Ausgänge erweitern: ein Kern-Bundle plus je ein Chunk für
   Fleetdispatch, Galaxy, Stats/Overlays, Bauseiten.
2. In `start()` dynamisch importieren: `if (this.page === "fleetdispatch") await import(...)`.
   `web_accessible_resources` in **beiden** Manifesten entsprechend erweitern.
3. Die On-Demand-UI (Stats, Settings, Empire-Overview — alles, was erst nach einem Klick auf die
   Seitenleiste erscheint) hinter denselben Mechanismus legen. Diese ~7.300 Zeilen sieht die Mehrheit
   der Seitenaufrufe nie.
4. `test/bundle.test.js` erweitern, sodass es **jeden** Chunk auswertet, nicht nur den Kern.

**Exit-Kriterium.** Kern-Bundle unter 500 KB; Overview-Seitenaufruf lädt messbar weniger als heute
(Startup-Profil vorher/nachher im PR).

**Risiko.** Mittel. Ein dynamischer Import ist ein zusätzlicher Round-Trip — das lohnt nur, wenn der
Chunk groß genug ist. Chunks unter ~50 KB bleiben im Kern.

---

## Phase 6 — Altlasten, laufend

Kleinere Punkte, die keine eigene Phase brauchen, aber nicht vergessen werden dürfen. Jeder ist ein
eigener Commit.

- **Regelverstoß, weiterhin offen.** `ogkush.js:17815` startet auf der Overview-Seite ein
  `setInterval`, das `location.reload()` aufruft, sobald ein Rohstoffspeicher volläuft. Das ist ein
  timergesteuerter Seiten-Reload und damit **`AGENTS.md` §1.3 verboten** („Auto refreshing/reloading
  game page (timer or otherwise)"). `docs/performance.md` weist bereits darauf hin. Es ist eine
  Produktentscheidung, kein Refactoring: entweder entfernen oder in etwas umbauen, das der Spieler
  selbst auslöst — **vor der nächsten Toleration-Einreichung**. Die beiden anderen
  `location.reload()`-Stellen (3134, 3145) sind in Ordnung, beide laufen aus einem Click-Handler.
- **Polling auf ein Promise.** `sideOptions()` (ogkush.js:5056, 5084) und die Statistik-Buttons
  starten `setInterval(…, 20)`, um auf `this.isLoading` zu warten — während `updateEmpireData()`
  direkt daneben ein Promise zurückgibt, das verworfen wird. Ersetzen durch `await`. Drei Stellen,
  je zwei Zeilen.
- **jQuery.** 87 `$(…)`-Stellen hängen an dem jQuery, das die Spielseite mitbringt. Keine Panik-
  Migration, aber: neuer Code nutzt es nicht, und wer eine Datei in Phase 3 anfasst, ersetzt die
  jQuery-Aufrufe darin gleich mit.
- **`innerHTML`.** 69 Stellen. Sie laufen über `Element.prototype.html`, also durch DOMPurify — das
  ist in Ordnung. Direkte `innerHTML =`-Zuweisungen prüfen und auf `.html()` umstellen.
- **Verzeichnisname stimmt nicht.** `src/ctxcontent/services/analyzer/` läuft im **Page**-Context.
  Nach `src/ctxpage/messages/analyzer/` verschieben — reine Umbenennung, aber sie beseitigt die
  Falle, dass jemand dort `chrome.*` verwendet.
- **Doku-Drift.** `CLAUDE.md` beschreibt drei Dinge, die es nicht (mehr) gibt:
  `src/util/translations/<lang>.json`, `make translations`, `scripts/split-translations.mjs`. Die
  Übersetzungstabelle liegt tatsächlich als 2.626-zeiliges `Object.freeze({…})` in
  `src/util/translate.js:6`. Entweder die Aufteilung wirklich bauen (sie hätte einen echten Nutzen:
  das Bundle trägt heute sechs Sprachen, gebraucht wird eine plus Englisch als Fallback) oder die
  Doku korrigieren. Ebenso: `CLAUDE.md` nennt `background.js` „near-empty" (481 Zeilen). Die
  Prettier-Behauptung im selben Absatz ist mit Phase 0 erledigt und dort korrigiert.
- **Uhrzeit-/Statusleiste, aus `showTabTimer()` gerettet.** Die Methode wurde in Phase 1 gelöscht
  (der Aufruf war seit Langem auskommentiert, und sie startete ein Sekunden-`setInterval`, das nur
  den Seitentitel umschrieb). Ihre Entwurfsnotizen sind das Behaltenswerte und stehen deshalb hier:
  Anzeige in den Uhr-Bereich verschieben statt in `document.title`; letzte Aktualisierungszeit aus
  dem OGame-Zeitstempel statt aus `window.performance.timing` (deprecated) ziehen; Zeitzonen-
  Indikator, Ping-Statistik (über die Performance-API statt der alten Messung) und eventuell eine
  Ladezeit dort zusammenführen. Wenn das gebaut wird, dann ohne Sekundentakt — ein Timer pro Seite
  ist genau das, was die Performance-Arbeit gerade abgebaut hat.
- **`packaging.sh`** ist Bash + `zip` + GNU-`sed -i` und läuft auf Windows nur aus Git Bash/WSL.
  Nach `scripts/` als Node-Skript portieren, wie `build-unpacked.mjs` es bereits vormacht — dann
  funktioniert `make build` überall gleich.
- **16 MB HAR-Datei im Repo.** `analysis/s282-de.ogame.gameforge.com.har` ist getrackt und macht
  jeden Clone um 16 MB schwerer. Geprüft: die Datei enthält **keine** `cookies`-Arrays, keine
  `set-cookie`-, `authorization`-, `PHPSESSID`-, `gf-token`- oder `prsess`-Vorkommen, also keine
  Sitzungsdaten — sie ist nur groß. Entweder in `.gitignore` und lokal behalten, oder als Anhang an
  ein Issue. Falls sie bleiben soll: kurz im Repo begründen, wozu.
- **Überfällige Versions-Altlasten** aus Abschnitt 3.2, sobald die v12-Support-Entscheidung
  getroffen ist.
- **PTRE-Team-Key ohne Fehlermeldung** (`ogkush.js:16075`, Abschnitt 3.6): ein Tippfehler im Key
  führt heute stillschweigend dazu, dass nichts passiert.

---

## 4. Was dieser Plan bewusst **nicht** vorsieht

- **Kein Framework.** Kein React, kein Vue. Die Extension injiziert in fremdes DOM, das der
  Spielserver kontrolliert; eine virtuelle DOM-Schicht darüber kauft nichts und kostet Bundle-Größe
  und Review-Aufwand (`AGENTS.md` §0: der Quelltext muss lesbar bleiben).
- **Kein TypeScript-Umstieg.** Die Skripte sind ausdrücklich reines JavaScript. Wenn Typsicherheit
  gewünscht ist, ist der billige Weg JSDoc plus `checkJs` — inkrementell, ohne Buildschritt, ohne
  dass der Reviewer transpilierten Code liest.
- **Kein Umschreiben von `util/`-Modulen mit guter Abdeckung.** `harvestPlanner`, `expeditionBalancer`,
  `productionEngine`, `targetClaims`, `fleetCost`, `defenceCost` stehen bei 100 %. Die sind fertig.
- **Kein Deferred-Write für `OGIData`.** Wurde gemessen, gebaut, zurückgenommen. Begründung steht in
  `docs/performance.md`.

---

## 5. Zielbild

| Messung                     | heute                                 | Ziel                                            |
| :-------------------------- | :------------------------------------ | :---------------------------------------------- |
| größte Datei                | 19.024 Zeilen                         | < 2.000                                         |
| Dateien > 1.000 Zeilen      | 2                                     | 0 (außer `translate.js`)                        |
| `npm run check`             | 0 (Phase 0)                           | 0, in CI erzwungen — erreicht                   |
| Zeilenabdeckung             | 68 % (ohne 34 Dateien)                | > 75 %, ogkush.js dabei                         |
| Kern-Bundle (Page-Context)  | 1,13 MB                               | < 500 KB                                        |
| Zugriffswege auf `ogk-data` | 2                                     | 1                                               |
| Produktionsmodelle im Repo  | 3                                     | 1 (`productionEngine.js`)                       |
| `TODO`/`WIP`/`@deprecated`  | 41, keiner mit Ticket                 | 0 aus dem Altbestand; neue nur als `TODO(#123)` |
| `KNOWN BUG:`-Tests          | 11                                    | 0 (jeder Fix nimmt sein Präfix mit)             |
| getrackte tote Bäume/Blobs  | `local-extension-backup/` + 16 MB HAR | 0                                               |
| offene `AGENTS.md`-Verstöße | 1                                     | 0                                               |

Die letzte Zeile ist die wichtigste. Alles andere ist Komfort; ein Verstoß gegen die Regeln der
Origin-Toolentwickler kostet im Zweifel das Recht, das Tool überhaupt zu veröffentlichen.
