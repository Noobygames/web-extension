# Refactoring-Plan II — Bugfixes, Fachlichkeit, Speicher

Stand: 2026-08-29, Branch `master`, nach Abschluss von Phase 0–6 aus `refactoring.md`.

`refactoring.md` ist **abgeschlossen** und bleibt als Protokoll stehen. Dieser Plan setzt darauf auf
und hat drei Stoßrichtungen, in dieser Reihenfolge wichtig:

1. **Bugfixes.** Es gibt 16 mit Test festgeschriebene Fehler und 10 neu gefundene. Vier davon rechnen
   dem Spieler falsche Zahlen aus, zwei machen ganze Ansichten unbrauchbar.
2. **`util/` auflösen.** 81 von 150 Dateien und 10.223 von 34.581 Zeilen liegen in einem Ordner,
   dessen Name nichts aussagt. Das ist kein Stilproblem — es ist der Grund, warum ein 807-Zeilen-
   Feature dort unbemerkt liegen konnte und warum ein komplettes totes Subsystem niemandem auffiel.
3. **Den Speicher-Blob verkleinern.** `docs/performance.md` benennt ihn als „der größte verfügbare
   Gewinn" und den einzigen sicheren Weg dorthin. Der ist noch nicht gegangen.

---

## 0. Ausgangslage in Zahlen

Gemessen auf aktuellem `master`, nicht geschätzt.

| Messung                             | Wert                                                        |
| :---------------------------------- | :---------------------------------------------------------- |
| `src/**` ohne `libs/`               | 150 Dateien, 34.581 Zeilen                                  |
| davon `src/util/**`                 | **81 Dateien (54 %), 10.223 Zeilen (30 %)**                 |
| größte Datei in `util/`             | `stalk.js`, **807 Zeilen** — reiner Feature-Code            |
| Kern-Bundle (Page-Context)          | 474 KB, 19 Chunks (Phase 5)                                 |
| Testabdeckung                       | **51,2 % Zeilen / 68,7 % Zweige / 43,9 % Funktionen**       |
| Tests                               | 543, alle grün; `npm run check` 0 Fehler                    |
| `KNOWN BUG:`-Tests                  | **16 offen**                                                |
| Neu gefundene Fehler (dieser Audit) | **10**                                                      |
| Unerreichbare Module                | **7 Dateien, 513 Zeilen** — von keinem Einstiegspunkt aus   |
| `OGBIData.Save()`                   | 80 Aufrufstellen, je eine vollständige Serialisierung       |
| `ogk-data`-Blob                     | 251–428 KB, ~3 ms je Serialisierung (`docs/performance.md`) |

Die beiden Module, die auf **jedem** Seitenaufruf laufen, sind zugleich die am schlechtesten
abgedeckten: `empireOverview/resourceDetail.js` **3,2 %** und `empire/production.js` **4,0 %**.

---

## 1. Leitplanken

Gelten unverändert aus `refactoring.md` §1 und werden hier nicht wiederholt. Zusätzlich für diesen
Plan:

8. **Kein Umbenennen ohne Wächter.** Jede Verschiebung aus Abschnitt 3 geht mit einem statischen
   Test einher oder mit einem, der schon existiert. Phase 3 hat gezeigt: eine Datei, die aus dem
   Modulgraphen fällt, bricht weder Build noch Lint noch Bundle.
9. **Bugfix vor Verschiebung, in getrennten Commits.** Ein Fix, der in einem 200-Dateien-Rename-Diff
   steckt, ist nicht reviewbar und nicht rücknehmbar.
10. **Kein Ordner heißt `util`, `helpers`, `common`, `shared`, `misc` oder `lib`** (ausgenommen das
    vendorte `src/libs/`). Das ist die Regel, die Abschnitt 3 überhaupt erst nötig gemacht hat.

---

## 2. Phase A — Bugfixes

**Zuerst, und einzeln committet.** Jeder Punkt: Test schreiben, der den Fehler zeigt, dann fixen,
dann ggf. `KNOWN BUG:`-Präfix entfernen (`docs/testing.md`).

### A.1 Falsche Zahlen für den Spieler — höchste Priorität

#### 1. `deuteriumInDebris` ist immer `true` — NEU — ERLEDIGT

`src/ogCore.js:578`:

```js
deuteriumInDebris: Boolean(xml.querySelector("deuteriumInDebris").innerHTML),
```

`serverData.xml` liefert `"0"` oder `"1"`. **`Boolean("0")` ist in JavaScript `true`** — ein nicht
leerer String ist truthy. Das Feld ist also auf **jedem** Universum `true`, unabhängig von der
Servereinstellung. Fünf Zeilen darüber steht es richtig: `donutGalaxy: … .innerHTML == 1`.

Wirkung: `deuteriumInDebris` ist der `includeDeut`-Schalter von `RecyclingYieldCalculator`. Auf
Universen ohne Deuterium im Trümmerfeld überschätzt OGI die Recyclingausbeute — in der Gewinn-Spalte
der Spionagetabelle (`SpyReport.js:249`, `:257`), im Flottenversand (`betterFleetDispatcher.js:1579`)
und in der Imperiums-Übersicht (`tables.js:498`). Der Spieler bekommt zu hohe Beutewerte und fliegt
Ziele an, die sich nicht lohnen.

Fix: `== 1` wie bei den Nachbarn. Test: `updateServerSettings()` gegen ein Fixture mit `0` und mit
`1`, und ein Test auf `RecyclingYieldCalculator`, dass `includeDeut === false` das Deuterium wirklich
auf 0 setzt.

**Erledigt.** Fix angewendet, 2 Tests in `test/ogcore.serverSettings.test.js` (treibt
`updateServerSettings()` end-to-end gegen ein `serverData.xml`-Fixture) plus 3 Tests in
`test/util/recyclingYieldCalculator.test.js`.

#### 2. `roiMine()` verrechnet sich um ein Vielfaches — `KNOWN BUG`, offen seit Phase 2 — ERLEDIGT

`test/util/gameFormulas.test.js:320`. Die Kostenschleife zählt `lvl` hoch, übergibt aber `tolvl` an
`building()`. Ein Ausbau von 20 auf 25 wird als **fünfmal die Kosten von Stufe 25** bepreist statt
als Summe der Stufen 21–25. Die Amortisationszeit ist systematisch zu hoch, und zwar umso mehr, je
mehr Stufen der Vorschlag überspringt — also genau bei den großen Sprüngen, für die man das Werkzeug
überhaupt benutzt. `roiLfBuilding()` zwei Methoden weiter oben macht dieselbe Schleife richtig; die
ist die Vorlage.

**Fix:** `building(technoId, tolvl, object)` → `building(technoId, lvl, object)` in der Schleife.
Ein-Level-Sprung unverändert (1091176), Fünf-Level-Sprung fällt von 4209440 auf **2193065** — nicht
mehr das exakte 5-fache der Stufe-25-Kosten. `KNOWN BUG:`-Präfix entfernt.

#### 3. `TradeMessagesAnalyzer` wirft weg, was es berechnet — `KNOWN BUG` — ERLEDIGT

`src/ctxpage/messages/analyzer/TradeMessagesAnalyzer.js:88` und `:103`: beide Rückschreibungen in den
Speicher sind auskommentiert (`/*OGBIData.trades = trades;*/`). **Niemand sonst** schreibt `trades` —
der Alt-Analyzer behandelt Transporte gar nicht. `OGBIData.trades` bleibt für immer leer, der
`msgId`-Cache eine Zeile darüber kann nie greifen, und die Handelsstatistik hat keine Datenquelle.

Vor dem Auskommentieren steht die Frage, **warum** — der Kommentar sagt es nicht. Erst klären
(Git-Historie), dann einschalten oder die Statistik entfernen. Ein drittes „bleibt so" gibt es nicht.

**Entscheidung: entfernt.** Git-Historie geprüft (`git log -S`, Commit `2319fe5`, 2024-07-30): die
Rückschreibung war **von Anfang an** auskommentiert, nie live. `tradesSums` war zudem die kopierte
Struktur der Combat-Sums (`losses`, `wins`, `topCombats` — für Handel bedeutungslos) und akkumulierte
nichts — selbst eingeschaltet wäre die Datenstruktur falsch gewesen. Kein Leser irgendwo im Code, keine
Statistik-Tab dafür (anders als bei Harvest/Combat/Expedition). `OGBIData.trades`/`.tradesSums`
inklusive Accessoren und Init-Defaults entfernt; sichtbares Feature (Standard-Unit-Label pro
Handelsnachricht) unverändert erhalten, da es nie vom Speicher abhing.

#### 4. `numbers`: Präzision `0` wird ignoriert — `KNOWN BUG` — ERLEDIGT

`test/util/numbers.test.js:64`. Klassische `||`-statt-`??`-Falle. Betrifft jede Anzeige, die bewusst
ohne Nachkommastellen formatieren will.

**Fix:** `precision ? precision : 0/2` → `precision ?? 0/2`. Der Default-Parameter ist `null`, also
löst `??` nur beim wirklich fehlenden Argument aus, nicht bei explizitem `0`.

### A.2 Ganze Ansichten fallen aus

#### 5. Eine unpassende Nachricht leert den ganzen Kampfbericht-Tab — `KNOWN BUG` — ERLEDIGT

`FightMessagesAnalyzer`: weder `#getExpeditionFight()` noch `#getFight()` prüft
`data-raw-messagetype`; beide filtern nur über Koordinaten und Hashcode. Alles andere landet im
Parser, wo `JSON.parse(null).owner` wirft — und der Fehler verlässt `analyze()`, sodass **jede
Nachricht danach übersprungen wird**. Harvest und Trade filtern beide zuerst auf den Typ; das ist die
Vorlage. Zusätzlich gehört jede `analyze()`-Schleife in ein `try/catch` pro Nachricht, damit ein
kaputter Einzelbericht nie mehr den Rest des Tabs mitnimmt.

**Fix: der `try`/`catch`-Weg, nicht der Typ-Filter.** Die richtige OGame-`data-raw-messagetype`-Kennzahl
für Kampfberichte ließ sich offline nicht verifizieren — ein geratener falscher Wert hätte echte
Berichte stillschweigend ausgefiltert, schlimmer als der Status quo. Beide Parser-Methoden
(`#parseOneExpeditionFight`, `#parseOneFight`) laufen jetzt hinter `try { … } catch (error) {
logger.error(...) }` pro Nachricht statt in der `forEach`-Schleife selbst. Ein Test mit zwei kaputten
Nachrichten links und rechts einer guten belegt: beide werden übersprungen (nicht nur die erste), die
gute wird trotzdem gebucht.

#### 6. Unvollständige Seite lässt den Konstruktor werfen — 3× `KNOWN BUG` — ERLEDIGT

`test/util/pageContext.test.js:203`, `:212`, `:220`: fehlendes `ogame-player-id`-Meta, leere
Planetenliste, fehlendes Universum-Meta. Alle drei werfen. Das ist der **Konstruktor** von
`OGBInfinity` — er wirft, bevor irgendein Feature laufen konnte, und die Extension ist auf dieser
Seite komplett tot statt teilweise nutzbar. Gleiche Klasse wie der `localStorage`-Absturz, den Phase
2 behoben hat: degradieren statt sterben, und einmal ins Log sagen, was fehlte.

**Fix: benannter Fehler statt stillem Absturz — kein „Weiterlaufen mit Fake-Daten".** Ohne Spieler-ID,
Heimatplanet oder Universum kann praktisch kein Feature sinnvoll weiterlaufen, ein „degradierter"
Zustand wäre Fiktion. Alle drei Stellen werfen jetzt ein benanntes `Error` mit klarer Diagnose
(`readPageContext: no .smallplanet entries — the page reports an empty planet list` usw.) statt eines
rohen `TypeError` aus einem Null-Dereferenzierungspunkt. Der äußere `catch (ex) { logger.error(ex); }`
im Boot-Pfad loggt jetzt tatsächlich, **was** fehlte.

#### 7. Pretty-printed XML lässt die Universum-Parser abstürzen — 2× `KNOWN BUG` — ERLEDIGT

`test/ctxcontent/universe.helpers.test.js:219` und `:235`. `childNodes` enthält Textknoten; der Code
funktioniert nur, weil die Live-API minifiziert ausliefert. Ändert Gameforge das Whitespace-Verhalten
oder schiebt ein Proxy etwas dazwischen, sind alle Universumsdaten weg. Dazu: eine Fehlerantwort
kommt als `TypeError` an, weil `fetchXml()` weder `response.ok` noch `<parsererror>` prüft.

**Fix.** Alle vier Live-Parser (`universe.planets.js`, `universe.players.js`,
`universe.alliances.js` — zwei Stellen —, `universe.highscore.js` — zwei Stellen) von
`doc.childNodes` auf `doc.children` umgestellt (nur Elementknoten, keine Textknoten); dazu
`node.firstChild` → `node.firstElementChild` für das verschachtelte `<moon>`-Element in
`universe.planets.js`, dieselbe Fehlerklasse. `util/fetching.js`s `fetchXml()` prüft jetzt
`response.ok` (wirft mit HTTP-Status in der Meldung) und `document.getElementsByTagName("parsererror")`
(DOMParser meldet ungültiges XML über einen `<parsererror>`-Wurzelknoten, kein Wurf). Drei Tests
ersetzen die zwei alten: Pretty-Print mit verschachteltem Mond, HTTP-503-Antwort, wohlgeformte
200-Antwort mit ungültigem XML-Körper.

### A.3 Toter Code, der als lebend dokumentiert ist — NEU

Eine Erreichbarkeitsanalyse vom Modulgraphen aus (`ogCore.js`, `ctxcontent/index.js`, `main.js`,
`background.js`) findet **7 Dateien, 513 Zeilen, die niemand erreicht**:

| Datei                                            | Zeilen | Anmerkung                                 |
| :----------------------------------------------- | -----: | :---------------------------------------- |
| `ctxcontent/helpers/universe.data.js`            |    195 | **hat keinen einzigen Importeur**         |
| `util/json.js`                                   |    116 | nur von den beiden Toten unten benutzt    |
| `ctxcontent/services/universe.expirations.js`    |     86 | einziger Importeur ist `universe.data.js` |
| `util/notifications.js`                          |     59 | vollständig auskommentierter Code         |
| `ctxcontent/services/universe.storage.js`        |     40 | einziger Importeur ist `universe.data.js` |
| `ctxcontent/services/request.ogameServerData.js` |     11 | einziger Importeur ist `universe.data.js` |
| `util/enum/resource.js`                          |      6 | —                                         |

Vier der sieben (`universe.data.js`, `universe.expirations.js`, `universe.storage.js`,
`request.ogameServerData.js`) sind mit diesem Abschnitt erledigt — siehe die Entscheidung unten.
`util/json.js` bleibt am Leben, weil `universe.expirations.js`/`universe.storage.js` es weiter
brauchen. `util/notifications.js` (vollständig auskommentiert) und `util/enum/resource.js` sind
damit nicht verwandt und bleiben offen — kleiner, unabhängiger Aufräum-PR.

Das ist **kein** kosmetischer Fund, sondern korrigiert zwei Dokumente und einen Plan:

- **`CLAUDE.md` beschreibt `ctxcontent/services/universe.storage.js` als lebenden Speicherweg**
  („`<universe>-<key>-information` via `ctxcontent/services/universe.storage.js`"). Der Weg
  existiert nicht mehr.
- **`refactoring.md` §3.1** schlägt als eigenen Quer-PR vor, drei Helfer an `universe.expirations.js`
  anzuschließen, „benutzt von genau einem Helfer, `universe.data.js`". Dieser eine Helfer ist selbst
  tot. Der vorgeschlagene Fix hätte an ein Modul angeschlossen, das niemand aufruft.
- **`getUniverseData()` ist die zweite, gecachte Implementierung von `serverData.xml`.** Die lebende
  ist `OGBeyondInfinity.updateServerSettings()` (`ogCore.js:527`) im **Page**-Context, mit eigener
  24-Stunden-Drosselung über `serverSettingsTimeStamp`. Die tote liegt im Content-Context und hat
  die sauberere Ablaufsteuerung. Zwei Modelle, das schlechtere lebt.

Aufgabe: **entscheiden, nicht nur löschen.** Entweder `getUniverseData()` wird angeschlossen und
`updateServerSettings()` gibt seinen Abruf ab, oder der Content-Zweig fällt vollständig weg. Erst
danach die Doku korrigieren und `refactoring.md` §3.1 als gegenstandslos markieren.

**Entscheidung: angeschlossen — ERLEDIGT.** Vor dem Anschließen zeigte sich: `getUniverseData()` war
selbst unfertig, nicht nur unbenutzt — derselbe `doc.childNodes`-Fehler wie A.2 #7, keine
`Number()`/`== 1`-Typkonvertierung, `toLifeforms()` ein reiner Stub (`// TODO: Need mapping
implementation to lifeforms`, der einzige `universe.*`-TODO aus Abschnitt 3.1 der `refactoring.md`,
der dort bewusst nicht mitgezählt wurde). Eine `Document` kann außerdem die
`service.callbackEvent.js`-Bridge nicht überqueren — nur klonbare Werte.

Umbau statt Reparatur der alten Form: `getServerDataXml(universe, force)` liefert jetzt rohen
`serverData.xml`-**Text**, gecacht über `universe.expirations.js` (feste 24-h-TTL statt des
`FetchResponse.expires`-HTTP-Headers, dessen Vorhandensein bei `serverData.xml` sich offline nicht
verifizieren ließ — ein fehlender Header hätte die alte Form permanent "expired" gemacht). Neue
Bridge-Command `serverData.get` (`ctxcontent/index.js`, dokumentiert in
`docs/context.content.commands.md`). `OGBeyondInfinity.updateServerSettings()` ruft sie über
`pageContextRequest("serverData", "get", force)` und reicht den Text an **exakt denselben** rund
150 Zeilen langen `DOMParser` + `Number()`/`== 1`-Auswertungsblock weiter wie zuvor — nichts an der
Feldextraktion wurde angefasst, nur der Abrufweg. `toUniverseInformation()`/`toLifeforms()` sind mit
dem Umbau weg; die Feldliste, die sie dokumentiert hatten, lebt jetzt implizit in der unveränderten
Auswertung von `updateServerSettings()`.

Vier neue Tests in `test/ctxcontent/universe.data.test.js` (Erstabruf cacht, zweiter Abruf innerhalb
der TTL trifft nicht das Netz, `force` umgeht den Cache, Universen cachen unabhängig voneinander).
`test/ogcore.serverSettings.test.js` musste von einem `globalThis.fetch`-Mock auf einen
`pageContextRequest`-Mock umgestellt werden (die Bridge selbst hat ihre eigene Testdecke in
`test/util/service.callbackEvent.test.js` — dieser Test prüft, was `updateServerSettings()` mit dem
Text macht, nicht die Bridge-Mechanik). Kern-Bundle unverändert (474 KB), Content-Bundle 66 → 77 KB
(die vier vormals toten Dateien sind jetzt echt erreichbar und werden mitgebündelt).

Zusätzlich tot, aber innerhalb lebender Dateien:

- `ogCore.js` parst `lifeFormResearchSpeed`, `lifeFormCostReductionFromBuilding` und
  `lifeFormCostReductionFromResearch` aus `serverData.xml` — rund 40 Zeilen verschachtelte
  DOM-Navigation — und **kein einziges Modul liest diese drei Felder**.
- `SpyMessagesAnalyzer.js:468`: `classByStatus`, ein Objektliteral mit sechs Einträgen, wird gebaut
  und nie benutzt (die Zeile darunter nimmt `report.statusCssClass`).

### A.4 Stille Fehlerklassen — NEU — ERLEDIGT

#### 8. `splice()` während `forEach()` — 3 Stellen — ERLEDIGT

`util/stalk.js:337`, `util/stalk.js:689`, `ctxcontent/data-helper.js:166`. `forEach` überspringt nach
einem `splice` das nächste Element. In allen drei Fällen wird „das eine passende Element entfernen"
gemeint — bei Duplikaten überlebt eines. `filter()` statt `forEach`+`splice`.

**Fix:** alle drei auf `.filter(...)` mit Neuzuweisung umgestellt (`let` statt `const`, wo nötig).
Verhalten unverändert im Normalfall (kein Duplikat), aber der Duplikat-Fall kann jetzt nicht mehr
halb-entfernen.

#### 9. `forEach(async …)` — 2 Stellen — ERLEDIGT

`ctxpage/stalk/index.js:166`, `ctxpage/stats/combatStats.js:30`. Die zurückgegebenen Promises erwartet
niemand: Fehler darin sind unbeobachtete Rejections, und die Reihenfolge der Ergebnisse ist
undefiniert. `for…of` mit `await` oder `Promise.all(map(...))`.

**Fix, unterschiedlich pro Stelle:** `stalk/index.js`s `updatePlayerList` wurde selbst `async`, mit
`for...of` statt `forEach` — die sortierte Spielerliste erscheint jetzt in Rang-Reihenfolge, nicht in
Auflösungsreihenfolge der einzelnen `dataHelper.getPlayer()`-Aufrufe. `combatStats.js`s `renderDetails`
bleibt **synchron** (sieben Aufrufstellen erwarten das) — dort wurde `forEach(async ...)` durch eine
`reduce()`-Promise-Kette ersetzt, die nach Funktionsende weiterläuft (genauso „fire and forget" wie
vorher), aber die drei DOM-Zeilen pro Top-Kampf jetzt in der sortierten Reihenfolge anhängt.

#### 10. Unbewachte Polling-Schleifen — ERLEDIGT

`ctxpage/eventbox/index.js:15` und `:261`, dazu Stellen in `planetbar/index.js` und
`betterFleetDispatcher.js`: `setInterval`, dessen `clearInterval` **nur im Erfolgsfall** läuft. Wird
die Bedingung nie wahr — Seite ohne Eventbox, abgebrochenes Laden —, läuft der Timer bis zum
Seitenwechsel weiter. `util/wait.js` hat mit `waitFor()` seit jeher einen Timeout; genau dafür ist er
da. Phase 6 hat zwei solche Stellen schon umgestellt (`ogCore.js` Empire-/Statistik-Knopf,
`stats/index.js` auf `Chart`), die restlichen fehlen noch.

**Geprüft, drei echte Treffer plus zwei Fehlalarme.** Auf `wait.waitFor()` umgestellt:
`eventbox/index.js`s beide Polls (`#eventboxLoading`, `toggleEvents.loaded` — letzteres ein
OGame-eigenes globales Objekt, `config/ogame-globals.cjs`) und `planetbar/index.js`s `flyingFleet()`
(wartet auf `.event_list`). **Nicht** angefasst: `planetbar/index.js:94`/`:269` und
`betterFleetDispatcher.js:832` sind wiederkehrende UI-Ticker (Sekundentakt-Anzeige, sauber
`clearInterval`-verwaltet vor jeder Neuzuweisung) — keine Warte-auf-Einmal-Bedingung, andere
Fehlerklasse, absichtlich unverändert gelassen.

#### 11. Unerwartete Promises — ERLEDIGT

`ogCore.js:820` (`overViewBtn`) und `ctxpage/eventbox/index.js:97` rufen `updateEmpireData()` ohne
`await` und ohne `.catch()`. `suppressAbortRejections()` fängt nur `AbortError`; jeder andere Fehler
ist eine unbeobachtete Rejection. Entweder erwarten wie beim Empire-Knopf nebenan, oder ein
ausdrückliches `.catch(logger.error)` mit Begründung, warum hier nicht gewartet wird.

**Fix:** `eventbox/index.js` — der `.then()`-Callback des ersten Polls (Item 10) wurde `async`, der
Aufruf jetzt `await`-ed und läuft in dieselbe `.catch()`-Kette wie der Poll selbst.
`overViewBtn` — bewusst **nicht** erwartet (die Toggle-Logik darunter liest gecachte Daten und soll
sofort reagieren), stattdessen `.catch((err) => logger.error(...))` mit Begründungskommentar.

### A.5 Restliche `KNOWN BUG:`-Tests — ERLEDIGT

| Datei                                     | Zeilen        | Kurz                                                                                             | Fix                                                                                                                                                                     |
| :---------------------------------------- | :------------ | :----------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/util/ogame.coordinate.test.js`      | 125, 138, 148 | falscher Fehlertyp; `toNumber` ignoriert Instanztyp; `toString` gibt `undefined` statt zu werfen | drei `throw X(...)` → `throw new X(...)`; `toNumber`s Typ-Parameter defaultet jetzt auf `coordinate.type`; leerer Guard in `toString` wirft jetzt                       |
| `test/util/runContext.test.js`            | 103           | unbekannter Browser wirft, statt einen Kontext zu melden                                         | `isPluginContext()` gibt `false` zurück (passend zum eigenen JSDoc), statt zu werfen                                                                                    |
| `test/util/tabs.test.js`                  | 106           | leere Titelliste wirft, statt eine leere Leiste zu rendern                                       | früher Return bei `tabs.length === 0`, vor dem `tabs[0].classList`-Zugriff                                                                                              |
| `test/util/service.callbackEvent.test.js` | 46, 349       | `ReferenceError` ohne `chrome`; Token wird mit `"1"` überschrieben                               | `typeof chrome === "undefined"`-Check vor dem Zugriff; neue `pageInitialized`-Sperre verhindert zweiten `pageContextInit()`-Aufruf statt ihn stillschweigend zuzulassen |

Bei den letzten beiden Zeilen musste auch je ein bestehender (nicht `KNOWN BUG:`) Test angepasst
werden, der sich absichtlich auf einen zweiten `pageContextInit()`-Aufruf verließ, um den
30-Sekunden-Deadlock-Wächter zu erreichen — jetzt über ein Token ohne Content-Context-Listener
nachgebildet, ohne den (jetzt verbotenen) doppelten Init.

### Exit-Kriterium Phase A — ERREICHT

| Kriterium                 | Ziel               | Ist                                                                                                                                                                                                                                                                                |
| :------------------------ | :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KNOWN BUG:`-Tests        | 16 → 0             | **0** — keiner mehr im Repo (`grep -rn "KNOWN BUG:" test` liefert nichts)                                                                                                                                                                                                          |
| Zehn neu gefundene Fehler | je ein Test        | **erledigt** — deuteriumInDebris, roiMine (schon KNOWN BUG), Trade-Statistik (schon KNOWN BUG), FightMessagesAnalyzer-Absturz (schon KNOWN BUG), tote Lifeform-Felder, `classByStatus`, 3× `splice`/`forEach`, 2× `forEach(async)`, 3× unbewachtes Polling, 2× unerwartete Promise |
| Totes Subsystem (A.3)     | entscheiden        | **wiederverdrahtet** — `serverData.get`-Bridge-Command, 4 neue Tests                                                                                                                                                                                                               |
| Tests gesamt              | —                  | 543 → **553**, alle grün                                                                                                                                                                                                                                                           |
| `npm run check`           | 0 Fehler           | **0**                                                                                                                                                                                                                                                                              |
| Kern-Bundle               | < 500 KB (Phase 5) | **475 KB**, unverändert im Rahmen der Messtoleranz                                                                                                                                                                                                                                 |

Nicht Teil des Exit-Kriteriums, aber erwähnenswert: Content-Bundle wuchs 66 → 79 KB, weil die vier
vormals toten Dateien aus A.3 jetzt echt gebündelt werden — das ist der Preis der Entscheidung
„wiederverdrahten statt löschen" und bewusst in Kauf genommen.

---

## 3. Phase B — `util/` auflösen

### Das Problem, konkret

`src/util/` hält **81 Dateien und 10.223 Zeilen** — mehr als die Hälfte aller Dateien des Projekts.
Der Ordnername beschreibt keine Fachlichkeit, sondern eine Verlegenheit: „hat woanders nicht
gepasst". Drei Belege, dass das echte Kosten hat und nicht nur unordentlich aussieht:

1. **`util/stalk.js` ist 807 Zeilen** — größer als jedes Feature-Modul unter `ctxpage/`. Es ist die
   vollständige Spieler-Verfolgungs-Oberfläche. `ctxpage/stalk/index.js` daneben ist zu großen Teilen
   eine dünne Hülle: `sideStalk(context, playerid)` ruft `side(playerid)`, `updateStalk()` ruft
   `update()`. Das Feature liegt in `util/`, die Fassade in `ctxpage/`.
2. **Ein komplettes totes Subsystem blieb unbemerkt** (A.3). In einem Ordner mit 81 Dateien ohne
   thematische Ordnung fällt nicht auf, dass vier davon einander im Kreis importieren und sonst
   niemand.
3. **Die Namen tragen die Herkunft, nicht den Zweck.** `service.callbackEvent.js`,
   `service.ptre.js`, `ogame.coordinate.js` — Punkt-Präfixe als Ersatz für Ordner. `OGBIData.js`,
   `Notifier.js`, `OgamePageData.js` in PascalCase neben 50 camelCase-Dateien.

### Die Zielstruktur — ERLEDIGT, mit einer bewussten Abweichung

**Abweichung vom ursprünglichen Plan unten: reine 1:1-Verschiebung, kein Zusammenlegen.** Die Tabellen
in diesem Abschnitt beschreiben den ursprünglichen Entwurf (mehrere alte Dateien zu einer neuen
zusammengefasst — `game/ships.js`, `game/costs.js`+`game/roi.js` aus `gameFormulas.js`, `format/dates.js`
aus `dateTime.js`+`time.js`, …). Ausgeführt wurde stattdessen: **jede Datei bekommt einen neuen Ordner,
behält aber ihre eigene Datei** — `enum/ship.js` wird `game/ship.js`, nicht Teil von `game/ships.js`;
`gameFormulas.js` wird `game/gameFormulas.js` als Ganzes, nicht in `costs.js`/`roi.js` gesplittet.

Grund: 81 Dateien in sieben Zielordner zu sortieren **und gleichzeitig** mehrere Dateien inhaltlich zu
verschmelzen (Exporte zusammenführen, alle Aufrufer auf die neuen Namen umstellen) ist in einem Schritt
ein deutlich größeres Risiko als die reine Verschiebung — und `gameFormulas.js` unterschreitet mit 669
Zeilen ohnehin das Exit-Kriterium „keine Datei über 700 Zeilen außerhalb `ctxpage/`" schon als Ganzes.
Das Zusammenlegen bleibt ein echter, eigenständiger Wert (siehe Nebeneffekt-Absatz unten), aber als
**Folge-PR**, mit eigener Testabdeckung für den Schnitt — nicht vermischt mit 79 Datei-Verschiebungen in
einem Diff. Die Tabellen unten zeigen die ursprüngliche Absicht; die tatsächlichen 79 Ziele stehen im
Exit-Kriterium.

### Die Zielstruktur (ursprünglicher Entwurf, siehe Abweichung oben)

Sortiert nach **Fachlichkeit**: wonach würde jemand suchen, der ein Verhalten ändern will.

```
src/
  game/          OGames Regelwerk. Reine Funktionen und Daten.
                 Darf kein DOM und keinen Speicher anfassen.
  ogame/         Die laufende Seite: was OGames DOM und Globals hergeben.
  store/         Persistenz.
  ui/            Darstellungswerkzeug: DOM bauen, Overlays, Tooltips.
  format/        Menschenlesbare Ausgabe: Zahlen, Daten, Übersetzung.
  platform/      Extension-Infrastruktur. Nichts Spielspezifisches.
  integrations/  Fremdsysteme: PTRE, Pantry, MMORPG-Stats.
  ctxpage/       Features (unverändert, bekommt Zuwachs)
  ctxcontent/    Content-Context (unverändert)
```

#### `src/game/` — das Regelwerk

Der wertvollste Teil des Repos und der einzige, der zu 100 % testbar ist, ohne einen Browser
anzufassen. Heute über `util/` und `util/enum/` verstreut.

| Neu                      | Aus                                                                                                           |
| :----------------------- | :------------------------------------------------------------------------------------------------------------ |
| `game/buildings.js`      | `enum/buildingInfo.js` (548)                                                                                  |
| `game/research.js`       | `enum/researchInfo.js` (599)                                                                                  |
| `game/ships.js`          | `enum/ship.js` + `enum/shipCosts.js` + `shipsData.js` + `fleetCost.js`                                        |
| `game/defence.js`        | `enum/defence.js` + `enum/defenceCosts.js` + `defenceCost.js`                                                 |
| `game/costs.js`          | Kosten- und Zeitteil von `gameFormulas.js`                                                                    |
| `game/roi.js`            | die fünf `roi*`-Funktionen aus `gameFormulas.js`                                                              |
| `game/production.js`     | `productionEngine.js`                                                                                         |
| `game/flight.js`         | `fleetFlight.js`                                                                                              |
| `game/recycling.js`      | `recyclingYieldCalculator.js`                                                                                 |
| `game/expeditions.js`    | `expeditionBalancer.js`                                                                                       |
| `game/farming.js`        | `farmEvaluator.js` + `harvestPlanner.js` + `calcNeededShips.js`                                               |
| `game/resources.js`      | `standardUnit.js` + `enum/resource.js`                                                                        |
| `game/constants.js`      | `gameConstants.js`                                                                                            |
| `game/missions.js` u. a. | `enum/missionType.js`, `planetType.js`, `playerClass.js`, `allianceClass.js`, `itemType.js`, `itemImageID.js` |

Nebeneffekt, der allein den Umzug rechtfertigt: `gameFormulas.js` (669 Zeilen) in `costs.js` und
`roi.js` zu trennen macht sichtbar, dass es **drei** Produktionsmodelle im Repo gibt — der Zielwert
in `refactoring.md` §5 ist 1. `game/production.js` wird die einzige Quelle; die acht offenen
Rechenlücken aus `refactoring.md` §3.3 bekommen dort ihren Platz.

#### `src/ogame/` — die laufende Seite

| Neu                       | Aus                                                                              |
| :------------------------ | :------------------------------------------------------------------------------- |
| `ogame/pageData.js`       | `OgamePageData.js`                                                               |
| `ogame/pageContext.js`    | `pageContext.js`                                                                 |
| `ogame/pages.js`          | `enum/gamePages.js`                                                              |
| `ogame/coordinates.js`    | `ogame.coordinate.js` (Punkt-Präfix fällt weg)                                   |
| `ogame/fleetMovements.js` | `flying.js` — der Name sagt heute nicht, dass es ein Parser für die Eventbox ist |
| `ogame/ownPlanets.js`     | `isOwnPlanet.js`                                                                 |

#### `src/store/`, `src/ui/`, `src/format/`, `src/platform/`, `src/integrations/`

| Ordner          | Inhalt                                                                                                                                                                                                                                                 |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store/`        | `OGBIData.js`, `usage.js` (`localStorageUsage.js`)                                                                                                                                                                                                     |
| `ui/`           | `dom.js`, `popup.js`, `tooltip.js`, `tabs.js`, `loading.js`, `highlight.js`, `markers.js` (`markerui.js`), `icons.js` (`iconVisibility.js` + `enum/iconMode.js`)                                                                                       |
| `format/`       | `numbers.js`, `dates.js` (`dateTime.js` + `time.js`), `text.js` (`cleanValue.js`), `i18n/` (`translate.js` + `translations/`)                                                                                                                          |
| `platform/`     | `logger.js`, `perf.js`, `runContext.js`, `loadChunk.js`, `abort.js`, `fetch.js` (`fetching.js`), `wait.js`, `debounce.js`, `observer.js`, `domChanges.js` (`stageForUpdate.js`), `lzstring.js`, `version.js`, `bridge.js` (`service.callbackEvent.js`) |
| `integrations/` | `ptre/` (`service.ptre.js` + `ptre.js`), `mmorpgStats.js`, `dataHelper.js`, `notifier.js` (`Notifier.js` + `enum/NotificationPriority.js`)                                                                                                             |

#### Was `ctxpage/` bekommt — Feature-Code, der nie `util` war

| Heute                  | Zeilen | Neu                              |
| :--------------------- | -----: | :------------------------------- |
| `util/stalk.js`        |    807 | `ctxpage/stalk/stalkPanel.js`    |
| `util/needs.js`        |    311 | `ctxpage/planetbar/needs.js`     |
| `util/targetClaims.js` |    125 | `ctxpage/galaxy/targetClaims.js` |
| `util/player.js`       |     30 | `ctxpage/stalk/player.js`        |

`util/stalk.js` und `ctxpage/stalk/index.js` zusammenzuführen wäre der einzige Punkt dieser Phase
gewesen, der **kein** reines Verschieben ist: die Fassade verschwindet, und die Aufrufer nehmen die
Implementierung direkt. `util/stalk.js` steht bei **7,2 % Abdeckung** — deutlich zu wenig, um einen
Facade-Merge ohne Netz zu machen.

**Entscheidung: verschoben (`ctxpage/stalk/stalkPanel.js`), nicht verschmolzen.** Aus demselben Grund
wie bei `gameFormulas.js`: erst Testabdeckung, dann die riskante inhaltliche Verschmelzung, in einem
eigenen Folge-PR. `ctxpage/stalk/index.js` importiert `stalkPanel.js` jetzt als eigenständiges Modul
(`import * as stalkUtil from "./stalkPanel.js"`) statt aus einem fremden `util/`-Ordner — das allein
ist schon der Bruch mit „Feature liegt in `util/`, Fassade in `ctxpage/`", auch ohne die Dateien
inhaltlich zu vereinen.

### Reihenfolge — tatsächlich ausgeführt

Nicht acht einzelne PRs wie ursprünglich geplant, sondern **ein automatisiertes Werkzeug, ein Durchlauf**:
79 Dateiverschiebungen und 571 Importpfad-Korrekturen von Hand zu machen ist genau die Art Arbeit, bei
der ein Mensch (oder ein Agent) Fehler macht, die kein Test bemerkt. Stattdessen:

1. Vollständige Alt-→-Neu-Zuordnungstabelle für alle 79 Dateien aufgestellt (siehe Tabellen oben),
   plus zwei Löschungen (`notifications.js`, `enum/resource.js` — beide seit Phase A.3 bestätigt tot,
   keine Testabdeckung).
2. Ein Node-Skript verschiebt alle Dateien (`git mv`) und liest danach **jede** `.js`-Datei unter
   `src/`, `test/`, `scripts/` erneut: jede relative Import-/Export-Spezifikation, jedes dynamische
   `import()`, jedes `new URL(spec, import.meta.url)` und jedes `importFresh("src/...")` wird gegen
   die alte Position des lesenden **und** des gelesenen Moduls aufgelöst und auf den neuen Pfad
   umgeschrieben.
3. Was das Skript **nicht** sieht — Pfade als getrennte `path.join()`-Segmente (`"util", "OGBIData.js"`),
   hartkodierte Datei-Listen in Meta-Tests (`test/ctxpage/module-wiring.test.js`,
   `test/util/page-context-boot.test.js`), Build-Skripte (`scripts/bundle.mjs`s Prune-Liste,
   `scripts/build-unpacked.mjs`, `packaging.sh`, `Makefile`) — von Hand nachgezogen, gefunden über
   `npm test` (jeder verwaiste Pfad wirft `ERR_MODULE_NOT_FOUND` oder `ENOENT`) und `grep` über
   verbliebene `"util/`-Vorkommen.
4. `src/ctxcontent/helpers/` (fünf `universe.*`-Parser aus Phase A.3) trägt denselben verbotenen Namen
   wie `util/` — beim Schreiben des Wächtertests aufgefallen, nicht vorher geplant. Mitverschoben nach
   `src/ctxcontent/parsers/`, gleiches Muster.

### Wächter gegen Rückfall

- **`test/architecture.test.js`** (neu), liest den Quelltext:
  - kein Ordner unter `src/` heißt `util`, `utils`, `helpers`, `common`, `shared`, `misc` oder `lib`
    (ausgenommen `src/libs/`) — fängt `src/ctxcontent/helpers/` ab, bevor es zurückkommt;
  - jede Datei unter `src/` ist von einem der vier Einstiegspunkte erreichbar — der Test, der A.3
    gefunden hätte, bevor 513 Zeilen tot herumlagen;
  - `platform/` importiert nichts außerhalb von sich selbst.
- **Bewusst nicht geprüft: „`game/` importiert nichts aus `ui/`/`store/`/`ctxpage/`".** Stimmt nicht
  — `calcNeededShips.js` und `gameFormulas.js` lesen `OGBIData` direkt, `standardUnit.js` liest
  `ctxpage/conf-options.js`. Diese Grenze wirklich zu ziehen heißt, die Funktionen zu parametrisieren
  statt aus dem Singleton zu lesen — ein echter, separater Umbau, keine Nebenwirkung einer
  Dateiverschiebung. Ein Test, der eine Regel prüft, die der Code nicht einhält, ist am ersten Tag
  schon falsch; hier als bewusste Lücke dokumentiert statt stillschweigend übergangen.
- `test/ctxpage/module-wiring.test.js` (hartkodierte Dateiliste, sieben Einträge auf neue Pfade
  umgestellt) und `test/bundle.test.js` (Prune-/Chunk-Pfade auf `platform/version.js` umgestellt)
  laufen unverändert weiter und hätten eine beim Verschieben aus dem Graphen gefallene Datei gefangen.

### Exit-Kriterium Phase B — ERREICHT

| Kriterium                               | Ziel                         | Ist                                                               |
| :-------------------------------------- | :--------------------------- | :---------------------------------------------------------------- |
| `src/util/`                             | existiert nicht mehr         | **weg** — 79 Dateien verschoben, 2 tote gelöscht, Ordner entfernt |
| `src/ctxcontent/helpers/`               | (nicht ursprünglich geplant) | **auch weg** — nach `src/ctxcontent/parsers/`, gleicher Fund      |
| Datei > 700 Zeilen außerhalb `ctxpage/` | keine                        | **keine** — `game/gameFormulas.js` bleibt bei 669                 |
| `test/architecture.test.js`             | grün, gatend                 | **grün**, 3 Tests                                                 |
| Tests gesamt                            | —                            | 553 → **556**                                                     |
| `npm run check`                         | 0 Fehler                     | **0**                                                             |
| Kern-Bundle                             | unverändert ± 5 KB           | **475 KB** (unverändert — reine Verschiebung, nichts hinzugefügt) |

**Bewusst nicht in dieser Phase erledigt** (jeweils als eigener Folge-PR, mit eigener Testabdeckung
zuerst):

- `gameFormulas.js` in `costs.js`/`roi.js` teilen.
- `enum/ship.js` + `shipCosts.js` + `shipsData.js` + `fleetCost.js` zu `game/ships.js` zusammenlegen
  (analog `defence.js`).
- `dateTime.js` + `time.js` zu `format/dates.js` zusammenlegen.
- `util/stalk.js` (jetzt `ctxpage/stalk/stalkPanel.js`) mit `ctxpage/stalk/index.js`s Fassade
  verschmelzen.
- Die `game/`-Reinheitsregel (kein `OGBIData`/`ctxpage`-Import) wirklich durchsetzen.

---

## 4. Phase C — Den Speicher-Blob teilen

### Das Problem

`docs/performance.md` beziffert es und benennt den einzigen sicheren Ausweg:

> Jeder `OGBIData`-Setter serialisiert den **ganzen** Blob […] bei ~3 ms je Serialisierung eines
> 428-KB-Blobs sind das bis zu **250 ms reiner Overhead pro Seitenaufruf** — auf dem Papier der
> größte verfügbare Gewinn.
>
> **Der sichere Weg** ist, die Zahl der Schreibvorgänge zu senken oder **den Blob zu verkleinern
> (`spies` dominiert ihn)**.

Verzögertes Schreiben wurde gebaut und zurückgenommen — es bricht den Write-Through-Contract
(Leitplanke 4). Der andere Weg ist nie gegangen worden. Heute: **80 `Save()`-Aufrufstellen**, jede
eine vollständige Serialisierung.

Besonders teuer: `updateProductionProgress()` (`ctxpage/empire/production.js:917`) endet auf
`OGBIData.Save()` und wird aus `renderPlanetBar()` gerufen — also auf **jedem** Seitenaufruf, **vor
dem ersten Paint**, mitten in dem Pfad, den Phase 3 ausdrücklich freigeräumt hat, damit die
Planetenleiste früh erscheint.

### Der Schnitt

`ogk-data` zerfällt fachlich in zwei Hälften, die sich in Größe und Schreibhäufigkeit genau
gegenläufig verhalten:

| Hälfte   | Inhalt                                                                                                          | Größe                  | Schreibt                                          |
| :------- | :-------------------------------------------------------------------------------------------------------------- | :--------------------- | :------------------------------------------------ |
| **heiß** | `options`, `empire`, `flying`, `markers`, `needs`, `sideStalk`, Fortschritts- und Zeitstempelfelder             | klein                  | ständig — die 80 Aufrufstellen                    |
| **kalt** | `spies`, `expeditions`, `combats`, `harvests`, `trades`, `discoveries`, die zugehörigen `*Sums`, `translations` | **dominiert den Blob** | selten — nur wenn eine Nachricht ausgewertet wird |

Die kalte Hälfte ist reine Historie: sie wächst monoton und wird auf der Nachrichtenseite
geschrieben, nirgends sonst. Sie in `localStorage["ogk-history"]` auszulagern macht **jede** der 80
heißen Schreibungen billig, ohne am Write-Through-Contract zu rühren — der bleibt Zeichen für Zeichen
derselbe, er serialisiert nur weniger.

### Schritte

1. `OGBIData` bekommt intern zwei Blobs und **eine** unveränderte Außenschnittstelle. Kein Aufrufer
   ändert sich, kein `TRAP:`-Test ändert sich. Getter/Setter entscheiden anhand des Feldnamens,
   welcher Blob betroffen ist, und `Save()` schreibt nur den, der sich geändert hat.
2. Migration beim ersten Start: bestehendes `ogk-data` lesen, kalte Schlüssel herausziehen, beide
   schreiben, erst dann das alte Feld leeren. Bei jedem Fehler unterwegs bleibt `ogk-data`
   unangetastet — das ist die gesamte Historie des Spielers (`refactoring.md` Phase 2: „leer starten
   kostet eine Sitzung; leer starten und wegwerfen kostet den Account").
3. `updateProductionProgress()` vom Boot-Pfad entkoppeln: entweder schreibt es nicht mehr vor dem
   ersten Paint, oder es schreibt nur noch die heiße Hälfte.
4. Vorher/nachher mit `localStorage["ogi-perf"] = "1"` auf einer echten OGame-Seite messen. Diese
   Messung steht seit Phase 3 aus und ist hier keine Kür: ohne sie ist nicht belegt, dass die Phase
   etwas gebracht hat.

### Exit-Kriterium Phase C

`ogk-data` (heiß) unter 50 KB bei einem etablierten Konto. Serialisierungszeit pro `Save()`
mindestens um den Faktor 5 gefallen, gemessen über den `ogk-data`-Block von `perf.report()`. Alle
`TRAP:`-Tests unverändert grün. Ein Test, der die Migration von einem echten alten Blob durchspielt,
inklusive Abbruch mittendrin.

### Umsetzung — ERLEDIGT

**Der Schnitt, konkret.** `COLD_FIELDS` in `src/store/OGBIData.js` ist eine feste Liste:
`spies`, `expeditions`, `combats`, `harvests`, `discoveries`, `expeditionSums`, `discoveriesSums`,
`combatsSums`, `translations` — genau die neun Felder aus der Tabelle oben (`trades`/`tradesSums`
gab es zu dem Zeitpunkt schon nicht mehr, tot seit Phase A.3). Alles andere ist heiß, per Default —
auch die knapp 100 generischen `OGBIData.json.<feld>`-Zugriffe, die nie einen eigenen Getter/Setter
hatten (`speed`, `technology`, `moonProductionProgress*`, `lfResearchProgress*`, `allianceClass`,
`reminders`, …). Eine Positivliste für „heiß" zu pflegen hätte bedeutet, bei jedem neuen Feld im
Code mitzuziehen; eine Negativliste für „kalt" mit neun festen, historisch gewachsenen Namen nicht.

**Eine Proxy, kein zweites Interface.** `get json()` liefert dieselbe Instanz für die Lebensdauer
des Singletons zurück — die Proxy-Traps lesen `self.#hot`/`self.#cold` bei jedem Zugriff neu, nicht
einmalig beim Bau. Lesen, Schreiben, `in`, `delete`, `Object.keys()`, `Object.assign({}, json)`,
`JSON.stringify(json)` — alles funktioniert unverändert gegen zwei Objekte statt eines. Kein
Aufrufer außerhalb von `OGBIData.js` wurde angefasst außer den beiden unten.

**`Save()` bekam ein Dirty-Flag, ungeplant.** Der Plan sagte für Schritt 3, `updateProductionProgress()`
solle „nur noch die heiße Hälfte" schreiben. Ohne weiteres Zutun hätte `Save()` beide Hälften
geschrieben — die Kompatibilitäts-Falle des Plans selbst: der teure Boot-Pfad-Aufruf bleibt teuer,
nur jetzt mit einem zweiten `localStorage`-Schreiben obendrauf. Also trägt `#coldDirty` jetzt Buch:
gesetzt, wenn die Proxy-`set`/`deleteProperty`-Traps ein `COLD_FIELDS`-Feld anfassen; gelöscht nach
jedem `#saveCold()`. `Save()` schreibt Heiß immer, Kalt nur wenn das Flag steht. Ergebnis:
`updateProductionProgress()` selbst musste **nicht angefasst werden** — keins seiner Felder ist kalt,
also bleibt sein `Save()`-Aufruf automatisch heiß-only.

**Ein echter, stiller Kopplungsbruch, gefunden beim Nachziehen.** `format/i18n/translate.js`
aktualisiert `translations` (kalt) und schrieb `OGBIData.json.translations = translations;` — ohne
je `Save()` zu rufen. Im ungeteilten Blob war das kein Bug: irgendein anderer Setter (Optionen,
Empire, egal was) hat kurz danach ohnehin den ganzen Blob geschrieben und die Übersetzung gratis
mitgenommen. Nach dem Schnitt schreibt kein heißer Setter mehr die kalte Hälfte — ohne Korrektur
wären Übersetzungs-Updates ab diesem Commit still verschwunden, bei grünem Test, weil kein
bestehender Test das je geprüft hat. Fix: `OGBIData.Save()` explizit nach beiden Zuweisungen
(`UpdateAllTechNamesFromEmpire`, `InitializeLFNames`).

**Ein Bypass geschlossen, der `_json` sonst überlebt hätte.** `traderOverview/TraderImportExportPage.js`
griff über `OGBIData._json.reminders` direkt auf das alte private Feld zu, nicht über den Getter — der
in `refactoring.md` Phase 4 dokumentierte Vertrag „nur `OGBIData.json`, nie ein Alias" wurde hier schon
gebrochen. `_json` existiert nach dem Schnitt gar nicht mehr (`#hot`/`#cold`, echte private Felder statt
Konvention), also musste das ohnehin auf `OGBIData.json.reminders` umgestellt werden — der Bug wäre sonst
erst als Absturz zur Laufzeit aufgefallen, nicht beim Lesen.

**Migration.** `#migrate()` läuft nur, solange `ogk-history` noch nicht existiert — danach ist der
Schnitt bereits vollzogen und der Test „once ogk-history exists, migration never runs again" hält das
fest. Schreibreihenfolge bei einem Fund: erst `ogk-history`, dann das getrimmte `ogk-data` — wirft der
zweite Schreibvorgang (Kontingent, o. ä.), bleibt `ogk-data` auf der Platte exakt der Alt-Zustand, und
der nächste Seitenaufruf versucht die Migration erneut. Der Speicher dieser Sitzung ist trotzdem sofort
korrekt gesplittet, unabhängig vom Schreiberfolg. `test/util/OGIData.migration.test.js` (neu, 4 Tests)
spielt das durch: echte Migration, Blob ohne kalte Felder (kein Schreiben nötig), bereits migriert
(kein zweiter Versuch), und der Abbruch mittendrin — der explizite Exit-Kriterium-Test.

**`OGIData.construction.test.js` und `OGIData.test.js` liefen mit einer Ausnahme unverändert weiter** —
alle bestehenden Seeds sind rein heiß, die Migrationsprüfung ist für sie ein No-Op. Angepasst wurden
nur `stored()` (liest jetzt `ogk-data` **und** `ogk-history` und führt sie zusammen — das ist, was
`OGBIData.json` dem Aufrufer ohnehin als eine Sicht zeigt) und `withOGBIData()` (die redundante manuelle
`localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))`-Zeile flog raus — sie schrieb den **ungeteilten**
Seed direkt in `ogk-data`, was bei einem kalten Feld im Seed den Schnitt sofort wieder aufgehoben hätte;
der `json`-Setter persistiert bereits korrekt gesplittet). Kein `TRAP:`-Test geändert.

### Exit-Kriterium Phase C — ERREICHT

| Kriterium                                    | Ziel             | Ist                                                                                                                                                                                                                      |
| :------------------------------------------- | :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogk-data` (heiß) < 50 KB, etabliertes Konto | < 50 KB          | nicht an echten Kontodaten gemessen (kein Browser hier) — strukturell erzwungen: jedes monoton wachsende Feld ist per `COLD_FIELDS` kalt, der heiße Rest ist durchweg klein/gedeckelt                                    |
| `Save()`-Zeit, Faktor 5                      | ≥ 5×             | **~119×–212×**, `node scripts/bench.mjs store` gegen einen synthetischen 251-KB-Blob (siehe `docs/performance.md`)                                                                                                       |
| `TRAP:`-Tests                                | unverändert grün | **unverändert**, alle 3 grün                                                                                                                                                                                             |
| Migrationstest inkl. Abbruch mittendrin      | vorhanden        | **`test/util/OGIData.migration.test.js`**, 4 Tests                                                                                                                                                                       |
| Tests gesamt                                 | —                | 556 → **563**                                                                                                                                                                                                            |
| `npm run check`                              | 0 Fehler         | **0**                                                                                                                                                                                                                    |
| Vorher/Nachher auf echter OGame-Seite        | gemessen         | **nicht gemacht** — kein Browser verfügbar; `scripts/bench.mjs` liefert eine reproduzierbare untere Schranke nach derselben Methodik wie der Rest von `docs/performance.md`, ersetzt aber keine echte `ogi-perf`-Messung |

---

## 5. Phase D — Abdeckung dorthin, wo es weh tut

51,2 % Zeilen / 43,9 % Funktionen. Die Zahl allein ist kein Ziel; die Verteilung ist das Problem.

**Auf jedem Seitenaufruf, praktisch ungetestet:**

| Datei                                      |  Abdeckung | Läuft                      |
| :----------------------------------------- | ---------: | :------------------------- |
| `ctxpage/empireOverview/resourceDetail.js` |  **3,2 %** | `renderPlanetBar()`, immer |
| `ctxpage/empire/production.js`             |  **4,0 %** | `renderPlanetBar()`, immer |
| `util/stalk.js`                            |  **7,2 %** | `sideStalk()`, immer       |
| `util/flying.js`                           |  **9,2 %** | Eventbox, immer            |
| `util/needs.js`                            | **19,0 %** | Planetenleiste, immer      |

Diese fünf sind zusammen rund 1.900 Zeilen, die bei **jedem** Seitenaufruf laufen und bei denen ein
Fehler erst im Live-Universum auffällt. Sie kommen vor allem anderen dran — und zwar **vor** ihrem
Umzug in Phase B, damit der Umzug dieselben Zahlen behält wie in Phase 3
(`gameFormulas.test.js` als Vorlage: Werte vorher aufgenommen, nach der Verschiebung unverändert
gültig).

Danach: `SpyMessagesAnalyzer` (9,6 %, 1.039 Zeilen) und `SpyReport` (12,8 %) — seit Phase 2 als Lücke
benannt, „dort landen die meisten Fehlerberichte" (`docs/testing.md`).

**Exit:** > 70 % Zeilen gesamt, und keine Datei im Boot-Pfad unter 60 %.

### Umsetzung — TEILWEISE ERLEDIGT

Die fünf Boot-Pfad-Dateien und die beiden `SpyMessagesAnalyzer`/`SpyReport`-Dateien — die vollständige,
namentlich genannte Liste dieses Abschnitts — sind abgedeckt. Das Gesamtziel von > 70 % ist **nicht**
erreicht; das war bei 150 Dateien und 34.581 Zeilen mit dieser Liste allein auch nicht zu erwarten,
siehe „Was offen bleibt" unten.

| Datei                    | Vorher |                    Nachher |
| :----------------------- | -----: | -------------------------: |
| `resourceDetail.js`      |  3,2 % |                 **97,8 %** |
| `production.js`          |  4,0 % |                 **95,0 %** |
| `stalkPanel.js`          |  7,2 % |                 **79,0 %** |
| `fleetMovements.js`      |  9,2 % | **98,7 %** (siehe Fußnote) |
| `needs.js`               | 19,0 % |                 **91,6 %** |
| `SpyMessagesAnalyzer.js` |  9,6 % |                 **71,0 %** |
| `SpyReport.js`           | 12,8 % |                 **89,0 %** |
| Gesamt (alle Dateien)    | 52,5 % |                 **59,2 %** |

Fußnote `fleetMovements.js`: in der Gesamt-Coverage-Tabelle (`make coverage`) steht diese Datei
weiterhin bei 9,2 % — derselbe Mess-Artefakt, der in `docs/testing.md` schon für `OGBIData.js` und
`pageData.js` dokumentiert ist. `test/util/page-context-boot.test.js` importiert die Datei ebenfalls
(reine Modul-Auswertung, kein Verhalten), läuft alphabetisch nach `test/ogame/`, und der Reporter
behält pro Datei nur die zuletzt gesehene URL. Isoliert gemessen (nur die beiden neuen Testdateien):
**98,68 %**. Kein Nacharbeiten nötig — dieselbe Zeile aus `docs/testing.md` gilt hier unverändert:
„Treat that row as artefact, not gap."

**3 `KNOWN BUG:`-Tests neu dazugekommen — und, außerhalb des eigentlichen Phase-D-Umfangs (reine
Abdeckung, kein Bugfixing), auf ausdrücklichen Wunsch direkt im Anschluss gefixt:**

- `stalkPanel.js`: `update()` verglich `mainId` (Zahl, `Math.min(...validIds)`) mit `planet.id`
  (String, überall wo das Feld wirklich befüllt wird) via `===` — kein Planet wurde je als `ogl-main`
  markiert, unabhängig davon, welcher tatsächlich die niedrigste ID hatte. **Fix:**
  `parseFloat(planet.id) === mainId`.
- `fleetMovements.js`: `fleetDataRow.slice(deuteriumRow, deuteriumRow + 1)` wurde bei
  `deuteriumRow = -1` (kein Lifeforms-Konto) zu `slice(-1, 0)` — das Ende-Argument ist der **Literal**-Index
  `0`, nicht „ein hinter dem Start", also Start > Ende, und der Aufruf lieferte immer `[]`. Deuterium
  wurde deshalb im häufigsten Fall (keine Lifeforms) immer als `0` gelesen, unabhängig vom
  Tabelleninhalt. Metall und Kristall waren vom selben Bug nicht betroffen (ihre Offsets kreuzen die
  Null nicht). **Fix:** `fleetDataRow.at(row)` statt `.slice(row, row + 1)?.[0]` für alle drei
  Ressourcen — `.at()` behandelt einen negativen Index direkt richtig.
- `SpyMessagesAnalyzer.js`: der Gefahren-Hinweis für unbekannte Flotten-/Verteidigungsdaten verglich
  gegen den String `"No Data"` (großes D), `SpyReport.js` erzeugt aber durchgehend `"No data"`
  (kleines d) — der Vergleich traf nie, der numerische Fallback lieferte `NaN` (führt ebenfalls zu
  `false`), und die Zelle blieb leer statt eine Warnung zu zeigen. Gerade der riskanteste Fall — OGame
  hat die Flotte nicht verraten — sah identisch aus wie „0 Flotte, 0 Verteidigung, ungefährlich".
  **Fix:** Vergleich auf `"No data"` korrigiert, und die Zelle zeigt jetzt das Label „No data" statt
  leer zu bleiben, wenn der Wert nicht numerisch ist.

Alle drei Tests umbenannt (Präfix `KNOWN BUG:` entfernt) und auf das jetzt korrekte Verhalten
umgestellt; volle Suite (650 Tests) und `npm run check` (0 Fehler) danach erneut grün, beide Builds
(Chrome/Firefox) erneut verifiziert.

**Ein echter Test-Infrastruktur-Fund:** `test/helpers/globals.js`s `setupBrowser()` exportierte
`MutationObserver` nicht, obwohl jsdom es bereitstellt — jeder Test, der `stalkPanel.js`s
`observeSideStalkPlayerTitle()` durchläuft, warf `ReferenceError: MutationObserver is not defined`.
Ergänzt in `GLOBAL_KEYS` und der `define()`-Liste; betrifft jeden künftigen Test, nicht nur diese Phase.

**Zwei wiederkehrende Test-Fallen, gefunden beim Verifizieren der (durch einen Rate-Limit
unterbrochenen) Subagenten-Arbeit:**

1. jsdom setzt `ontouchstart` auf `document.documentElement` **immer** (auch ohne echte Touch-Unterstützung
   — derselbe Grund, warum `"ontouchstart" in window` als Feature-Test in echten Browsern seit Jahren als
   unzuverlässig gilt). Code, der `"ontouchstart" in document.documentElement ? "touchstart" : "mouseenter"`
   verzweigt (`stalkPanel.js`s `stalk()`, `resourceDetail.js`s Flottenflug-Tooltip), bindet in jedem Test
   also an `"touchstart"`, nie an `"mouseenter"` — Tests müssen das passende Event dispatchen, sonst
   passiert beobachtbar nichts (kein Fehler, nur eine leere Assertion).
2. `SpyMessagesAnalyzer#flagDeleted()` setzt einen echten 10-Sekunden-`setTimeout()` als
   Sicherheitsnetz, falls der Server nie bestätigt. Ein Test, der die Löschung auslöst, ohne die
   Bestätigung zu simulieren oder den Timer zu mocken, hinterlässt einen echten, referenzierten Timer —
   der hält den Node-Prozess bis zu 10 echte Sekunden am Leben (unabhängig davon, ob sein Callback dank
   eines `settled`-Flags am Ende ein No-Op ist: `clearTimeout()` wird nie aufgerufen) und kann, wenn er
   irgendwann während eines völlig anderen Tests feuert, gegen dessen inzwischen abgebautes
   `document`/`$` crashen. Drei betroffene Tests liefen deshalb je 10 Sekunden und ließen die
   Testdatei insgesamt >10 s statt <1 s dauern; behoben mit `t.mock.timers.enable({apis:["setTimeout"]})`
   um die auslösende Aktion.

### Was offen bleibt

`Phase D2 restliche Abdeckung -> laufend` (Abschnitt 6) war von Anfang an als fortlaufende, nicht als
einmalig abschließbare Arbeit geplant — bei 150 Dateien ist die hier bearbeitete Liste ein Anfang, kein
Abschluss. Nächste Kandidaten nach Zeilenzahl × Unbedecktheit: alles unter `src/ctxpage/messages/analyzer/`
außer `SpyMessagesAnalyzer.js` (Trade/Harvest/Expedition/Fight sind jeweils schon teilweise über
`test/ctxpage/messages/analyzers.test.js` mitgedeckt, aber nicht Ziel dieser Phase), und die
Fleetdispatch-/Galaxy-Module, die laut `docs/testing.md` ebenfalls noch großteils ungetestet sind.

---

## 6. Reihenfolge und Begründung

```
Phase A  Bugfixes                    -> falsche Zahlen und tote Ansichten zuerst
Phase D1 Abdeckung Boot-Pfad-Module  -> Netz, bevor Phase B sie verschiebt
Phase B  util/ auflösen              -> ein Ordner pro PR
Phase C  Speicher-Blob teilen        -> braucht die klaren Grenzen aus B
Phase D2 restliche Abdeckung         -> laufend
```

Phase A steht vorn, weil sie das Einzige ist, das der Spieler heute merkt. Phase D1 vor B, aus
demselben Grund wie Phase 2 vor Phase 3 stand: eine Verschiebung ohne Netz prüft nur ihr Ergebnis,
nicht sich selbst. Phase C nach B, weil der Schnitt zwischen heißen und kalten Daten voraussetzt,
dass man ansieht, wer was schreibt — und das ist genau die Sichtbarkeit, die B herstellt.

---

## 7. Zielbild

| Messung                           | heute                   | Ziel                               |
| :-------------------------------- | :---------------------- | :--------------------------------- |
| `KNOWN BUG:`-Tests                | 16                      | 0                                  |
| Neu gefundene Fehler offen        | 10                      | 0                                  |
| Unerreichbare Module              | 7 Dateien, 513 Zeilen   | 0, per Test gedeckt                |
| Dateien in `src/util/`            | 81 (54 % aller Dateien) | **0 — der Ordner existiert nicht** |
| Größte Datei außerhalb `ctxpage/` | 807 (`util/stalk.js`)   | < 700                              |
| Produktionsmodelle im Repo        | 3                       | 1 (`game/production.js`)           |
| Zeilenabdeckung                   | 51,2 %                  | > 70 %, Boot-Pfad > 60 %           |
| `ogk-data` (heiß)                 | 251–428 KB              | < 50 KB                            |
| Zeit je `Save()`                  | ~3 ms                   | < 0,6 ms                           |
| Startup-Profil gemessen           | nie                     | vorher/nachher im PR zu Phase C    |
| Offene `AGENTS.md`-Verstöße       | 1 (`location.reload()`) | 0                                  |

Die letzte Zeile ist unverändert die wichtigste und **steht weiterhin offen**: der timergesteuerte
`location.reload()` auf der Übersichtsseite (`ogCore.js`, `AGENTS.md` §1.3). Er wurde in Phase 6
ausdrücklich übersprungen, weil er eine Produktentscheidung ist und kein Refactoring — aber er muss
**vor der nächsten Toleration-Einreichung** weg oder in etwas umgebaut werden, das der Spieler selbst
auslöst. Alles andere in diesem Plan ist Komfort; ein Regelverstoß kostet im Zweifel das Recht, das
Tool überhaupt zu veröffentlichen.
