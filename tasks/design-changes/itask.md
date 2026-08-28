# Task: Breite Bildschirme besser ausnutzen (responsive Layout)

**Status:** Done — umgesetzt in `src/global.css` (Block am Dateiende)
**Typ:** Improvement
**Branch:** `improvement/responsive_wide_layout`
**Kontext:** Page context (`src/global.css`, `src/ctxpage/wide-layout.js`, `src/ogkush.js`)

---

## 1. Problem

OGame rendert mit fester Breite. Auf breiten Monitoren (>= ~1920px) bleibt rechts
und unten sehr viel Fläche leer — auch mit den Zusatzelementen der Extension.

`tasks/design-changes/image.png` zeigt **den Ist-Zustand (das Problem)**, nicht das
Wunschbild: Spielinhalt klebt als schmale Spalte links, ca. 60% der Viewport-Breite
ist ungenutzter Sternenhintergrund.

Reproduktion: `tasks/design-changes/example.html` ist ein gespeicherter OGame-Dump
(v13.0.0-r16, Seite `component=lfbuildings`, Sprache de). Enthält die echte
DOM-Struktur inkl. `#pageContent`, `#left`, `#middle`, `#right`, `#planetList`,
`#siteFooter`, `#banner_skyscraper`. Für Layout-Experimente ohne laufendes Spiel
benutzen.

## 2. Ziel

Wenn genug Platz da ist, sollen die vorhandenen Elemente mehr Platz einnehmen.
Kein neues UI, keine neue Anordnung von Spielfunktionen — nur Breiten/Flächen
der bereits vorhandenen Container skalieren.

**Nachtrag 1:** Breite allein reicht nicht. Sobald die Spalte ihren Cap erreicht,
soll der Inhalt selbst größer werden — Texte und Bilder wie bei einem Zoom.
Zwei Stufen also: erst Breite ausnutzen, dann skalieren.

**Nachtrag 2:** Beides muss in den Extension-Settings ein-/ausschaltbar sein.
Der Zoom zusätzlich konfigurierbar, sodass er auch vor den fest verdrahteten
Breiten-Triggern manuell gesetzt werden kann.

## 3. Ist-Zustand im Code

Die Extension überschreibt das Layout bereits an diesen Stellen in `src/global.css`:

| Zeile (ca.) | Regel                                                    | Bedeutung                            |
| ----------- | -------------------------------------------------------- | ------------------------------------ |
| 2603        | `#pageContent { left: 0 !important }`                    | Content nach links gezogen           |
| 5479        | `#pageContent { width: max-content; min-width: 1145px }` | **Der harte Breiten-Anker**          |
| 5484        | `#pageContent > #right { float: left; width: 300px }`    | Planetenliste als linke Float-Spalte |
| 5716        | `#siteFooter .content { width: 995px }`                  | **Nicht anfassen** — siehe §5        |

Es gibt aktuell nur zwei Media Queries in der Datei (Zeile 7440 / 7446), beide
`max-height`. Es existiert **keine** breitenabhängige Anpassung. Das ist die Lücke.

## 4. Umsetzung

Erwarteter Ansatz (abweichen erlaubt, dann im PR begründen):

1. `min-width: 1145px` als Untergrenze behalten — darunter darf nichts brechen.
2. Breiten-Media-Queries ergänzen, z.B. Stufen bei `min-width: 1600px`,
   `min-width: 1920px`, `min-width: 2560px`.
3. Pro Stufe die Content-Container breiter laufen lassen statt `max-content`:
   `#pageContent`, `#middle`, `#mainContent`, `#box`.
4. Elemente, die in Rastern liegen (Gebäude-Kacheln, `.ogl-*`-Tabellen der
   Extension), sollen den gewonnenen Platz füllen — Grid/Flex mit
   `repeat(auto-fill, minmax(...))` statt fester Spaltenzahl.
5. Alles in `src/global.css`. Kein JS-Resize-Listener, keine Inline-Styles.

## 5. Harte Constraints — nicht verhandelbar

- **§1.7 AGENTS.md:** Werbebanner (`#banner_skyscraper`), oberer Ad-Bereich,
  `#siteFooter` und die Menüpunkte **Händler, Offizierskasino, Shop** dürfen
  **nicht** verschoben, verkleinert, ausgeblendet, transparent gemacht oder
  überlagert werden. Ein Layout, das den Skyscraper aus dem sichtbaren Bereich
  drückt, ist eine Regelverletzung — auch wenn es nur ein Nebeneffekt ist.
  Nach jeder Layoutstufe explizit prüfen: Banner und Footer weiterhin sichtbar
  und unverändert groß.
- **§1.5 AGENTS.md:** Keine alternative UI. Elemente dürfen breiter werden,
  aber nicht umsortiert, zusammengelegt oder durch eigene Widgets ersetzt werden.
- Keine Änderung an `src/libs/` (vendored).
- v12-Kompatibilität: Selektoren, die Messages-/UI-Layer betreffen, brauchen
  ggf. beide Branches über `OgamePageData.isAtLeast_13_0_0`. Reines
  `#pageContent`-Breiten-CSS ist davon nicht betroffen.

## 6. Compliance-Einordnung

⚠️ **Grauzone (AGENTS.md §3).** Reines Umskalieren vorhandener Container ist ein
Komfort-Feature und liegt sehr wahrscheinlich innerhalb der Toleranz. Sobald die
Umsetzung aber Elemente umgruppiert, verschiebt oder das Layout so verändert, dass
es sich wie eine eigene Oberfläche anfühlt, ist ToolDev-Freigabe im OGame-Origin-Forum
nötig **vor** dem Publish.

Im Code an der betroffenen Stelle vermerken:
`/* GRAY AREA: requires ToolDev approval before publishing — see AGENTS.md §3 */`

**Zusatz durch den Zoom.** §1.7 listet ausdrücklich _"resizing"_ von Bannern,
oberer Werbeleiste, Premium-Inhalten, Footer und den Menüpunkten Händler /
Offizierskasino / Shop. Die Regel qualifiziert die Richtung nicht — Vergrößern
zählt genauso wie Verkleinern. Der Zoom ist deshalb bewusst nur auf den
Spielinhalt gelegt:

| skaliert                              | nicht skaliert                                    |
| ------------------------------------- | ------------------------------------------------- |
| `#middle` (Grids, Tabellen, Reports)  | `#bannerskyscrapercomponent` (Ad-Slot)            |
| `#planetbarcomponent` (Planetenliste) | `#top` (Rohstoffe, Dark Matter, Offiziere)        |
|                                       | `#left` (Menü inkl. Händler/Offizierskasino/Shop) |
|                                       | `#siteFooter` (liegt außerhalb `#pageContent`)    |

Das ging sauber, weil `#bannerskyscrapercomponent` **Geschwister** von
`#planetbarcomponent` innerhalb `#right` ist, nicht dessen Kind — der Ad-Slot
liegt damit nie in einem gezoomten Subtree, kein Gegen-Zoom-Trick nötig.

Ein durchgehender Seiten-Zoom inkl. `#top` und `#left` sähe stimmiger aus, würde
aber genau die von §1.7 benannten Elemente vergrößern. **Nicht gebaut** — dafür
zuerst ToolDev fragen.

Keine Automatisierung, keine Netzwerkaufrufe, keine Datenerhebung in diesem Task.
Toleration-Status des Gesamttools ändert sich nicht (Extension, §5 — bereits
toleration-pflichtig).

## 7. Akzeptanzkriterien

Gemessen im lokalen Render-Harness (`example.html` + Vanilla-CSS vom CDN +
`src/global.css`), Viewport per iframe exakt gesetzt.

| Viewport | zoom | `#middle` spec | sichtbar | Kachel | Banner  | `#left` | H-Scroll |
| -------- | ---- | -------------- | -------- | ------ | ------- | ------- | -------- |
| 1145     | 1    | 670            | 670      | 100    | 160x600 | 160     | (Base)   |
| 1599     | 1    | 670            | 670      | 100    | 160x600 | 160     | nein     |
| 1600     | 1    | 960            | 960      | 100    | 160x600 | 160     | nein     |
| 1920     | 1    | 1280           | 1280     | 100    | 160x600 | 160     | nein     |
| 2099     | 1    | 1400 Cap       | 1400     | 100    | 160x600 | 160     | nein     |
| 2100     | 1.15 | 1269.57        | 1460     | 115    | 160x600 | 160     | nein     |
| 2560     | 1.25 | 1400 Cap       | 1750     | 125    | 160x600 | 160     | nein     |
| 3200     | 1.4  | 1400 Cap       | 1960     | 140    | 160x600 | 160     | nein     |
| 3440     | 1.4  | 1400 Cap       | 1960     | 140    | 160x600 | 160     | nein     |

`Banner` = Skyscraper-Platzhalter fester Größe 160x600, im Harness injiziert
(offline liefert das echte Ad-Slot 0x0). Er bleibt über alle neun Breiten exakt
160x600 — der Beweis, dass der Zoom ihn nicht anfasst. `#left` bleibt 160.

Die Zeile 1145 hat H-Scroll (`scrollWidth` 1192). Gegen die Baseline gemessen
(`git stash`, gleicher Platzhalter): dort **identisch** 1192. Vorbestehend, nicht
durch diese Änderung verursacht — unterhalb 1600px ist der Block inaktiv.

- [x] Bei Viewport-Breite 1145–1599px ist das Layout identisch zu vorher
      (`#middle` 670, `#pageContent` 1145, `header` 654 — unverändert).
- [x] Bei >= 1920px füllt der Spielinhalt sichtbar mehr Breite (`#middle` 1280
      statt 670; Gebäude-Grid legt 12 Kacheln in eine Reihe statt 6+6).
- [x] Ab 2100px werden Texte und Bilder zusätzlich skaliert: Kachelbreite wächst
      100 -> 115 -> 125 -> 140px, Schrift und Icons proportional mit.
- [x] `#banner_skyscraper` behält über alle Breiten exakt seine Ausgangsgröße.
- [x] `#left` (Händler / Offizierskasino / Shop) behält exakt 160px.
- [x] Firefox < 126 ohne `zoom`-Support: `@supports`-Guard hält die Stufen
      inaktiv, `--ogl-wide-zoom` bleibt 1, Spaltenformel teilt durch 1.
- [x] `#siteFooter` unverändert: vanilla `position: fixed; width: 100%`, vom
      `#pageContent`-Baum entkoppelt — die Änderung kann ihn nicht erreichen.
- [x] `#banner_skyscraper` bleibt im Viewport: das Breitenbudget reserviert den
      Überhang; bei jeder aktiven Stufe passt ein 160px-Skyscraper mit Rand.
- [x] Menüpunkte Händler / Offizierskasino / Shop unverändert (`#left`, nicht angefasst).
- [x] Kein horizontaler Scrollbalken auf allen sieben getesteten Breiten.
- [x] `make dev` und Firefox-Build laufen durch, Regeln landen in beiden Builds.
- [x] `npx prettier --check src/global.css` sauber.
- [x] `npm test` — 334 pass, 0 fail.
- [x] Firefox-`sed`: neue Regeln führen keine URL-Schemata ein; im Firefox-Build
      0 verbliebene `chrome-extension://`, 37 `moz-extension://`.

**Nicht verifiziert:** nur die Seite `lfbuildings` lag als Dump vor. Die
654px-Overrides greifen laut Vanilla-CSS identisch auf `galaxy`, `messages`,
`fleetdispatch`, `overview`, `highscore`, `research`, `shipyard`, `defense`,
`supplies`, `facilities` — dort visuell ungeprüft. Ebenso ungeprüft:
`#technologydetails*` (im Dump leer, wird per AJAX nachgeladen) und die
`.ogl-*`-Panels (Harness läuft ohne Extension-JS). Beim ersten Ingame-Durchlauf
diese Seiten einmal ansehen; jede Zeile im Selektor-Block ist einzeln entfernbar.

## 8. Test

Manuell, es gibt keinen DOM-Layout-Test im `node:test`-Setup.

1. `make dev` → `dist/unpacked/chrome`
2. `make brave` (Wegwerf-Profil, lädt Build)
3. Ingame `component=lfbuildings` öffnen (die Seite aus `image.png`)
4. Fenster auf 1145 / 1600 / 1920 / 2560 px Breite ziehen, jede Stufe prüfen
5. Ohne Spiel-Login: `example.html` lokal öffnen und `global.css` einbinden

## 9. Entschiedene Fragen

- Eigene `.ogl-*`-Panels sollen den Platz mitnutzen. → umgesetzt: `.ogl-settings`
  (Cap 950px aufgehoben), `.ogl-dispatch > div` (660px), `.ogk-roi-desc` (675px).
  `.ogk-welcome` und `.ogl-tooltip` bewusst ausgenommen — Intro-Box bzw. Tooltip,
  die von Breite nicht profitieren.
- Obergrenze gewünscht. → Cap 1400px für die Contentspalte, erreicht ab ca.
  2040px Viewport. Darüber wächst nur noch der Rand.

## 10. Umsetzungsnotizen

- Ein Block am Ende von `src/global.css`, gesteuert über
  `--ogl-wide-column: clamp(670px, calc(100vw - 640px), 1400px)`.
- Budget `100vw - 640px` = `#left` 160 + Lücke 10 + `#right` 300 + Skyscraper-
  Überhang ~52 + Scrollbar/Zentrierung.
- Über das reine Verbreitern hinaus waren drei Vanilla-Eigenheiten zu korrigieren,
  sonst sieht die breite Spalte kaputt aus:
  1. `header` trägt das Seiten-Artwork als Hintergrund fester Größe — kachelt
     ohne `background-size: cover` + `no-repeat`.
  2. `.c-right` (Deko-Ecke) ist global auf `left: 642px` genagelt — auf
     `right: -16px` umgestellt, was den Original-Überhang reproduziert.
  3. `#technologies .icons` nutzt `space-between` plus einen `::after`-Spacer
     fester Breite, um die letzte Reihe bei genau 654px zu füllen. Beides ist bei
     jeder anderen Breite falsch — ersetzt durch `flex-start` + echtes `gap`.
- Kollateral: `prettier --write src/global.css` hat zusätzlich eine
  vorbestehende Verletzung in Zeile 8853 korrigiert
  (`brightness(1.0)` → `brightness(1)`). Einzeilig, kein Datei-weites Reformat.

### Nachtrag: Zoom-Stufen

- Zweiter Block am Dateiende, `--ogl-wide-zoom`, gestuft:
  `>=2100px -> 1.15`, `>=2560px -> 1.25`, `>=3200px -> 1.4`.
- Stufen beginnen erst, wenn die Spalte ihren 1400px-Cap erreicht hat (ca.
  2040px Viewport). Damit wird zuerst Breite ausgenutzt, dann skaliert.
- Spaltenformel teilt jetzt durch den Zoom:
  `clamp(670px, calc((100vw - 640px) / var(--ogl-wide-zoom)), 1400px)`.
  Der Cap wirkt so in _Spec-Pixeln_, nicht in Gerätepixeln — Zeichen pro Zeile
  bleiben konstant, obwohl die Schrift größer wird.
- `@supports (zoom: 1.25)` umschließt alle Stufen. `manifest-firefox.json`
  deklariert `strict_min_version: "120.0"`, CSS `zoom` kam aber erst in Firefox 126. Auf 120-125 bleibt es beim reinen Verbreitern.
- `zoom` statt `transform: scale()`, weil `zoom` das Layout tatsächlich neu
  umbricht; `scale()` würde nur vergrößert überlagern und Überlauf erzeugen.
- OGI-Dialoge, Toasts und Tooltips hängen an `document.body`
  (`src/util/popup.js:18`, `src/util/tooltip.js:24`, `src/ogkush.js:13937`),
  also außerhalb `#pageContent` — vom Zoom nicht betroffen.

**Zusätzlich ungeprüft (über die Liste in §7 hinaus):** ob OGames eigenes JS
und OGI-Code, die Positionen per `getBoundingClientRect()` berechnen, im
gezoomten `#middle` korrekt liegen. Chrome liefert dort zoom-korrigierte Werte,
das sollte passen — im Spiel aber einmal Tooltips und Galaxie-Hover prüfen.

### Nachtrag: Schalter und manueller Zoomfaktor

Drei Optionen in `src/ctxpage/conf-options.js` (der Options-Proxy weist
unbekannte Keys ab, sie müssen dort deklariert sein):

| Option             | Default | Wirkung                                        |
| ------------------ | ------- | ---------------------------------------------- |
| `wideLayoutEnable` | `true`  | Breitenstreckung                               |
| `wideZoomEnable`   | `true`  | Inhaltsskalierung                              |
| `wideZoomFactor`   | `0`     | `0` = automatische Stufen, sonst fester Faktor |

`src/ctxpage/wide-layout.js` setzt daraus zwei Klassen auf `<html>`
(`ogl-wide-layout`, `ogl-wide-zoom`) und schreibt einen manuellen Faktor als
Inline-Custom-Property. Aufgerufen in `OGBeyondInfinity.start()` und beim Speichern
des Settings-Dialogs.

Warum Klassen statt „CSS neutralisieren": ohne Klasse greift **keine einzige**
Deklaration des Blocks. Aus ist damit wirklich aus, nicht nur überschrieben.

Warum der manuelle Faktor inline gesetzt wird: Inline-Styles schlagen die
`@media`-Regeln in `global.css`. Genau das lässt einen selbst gewählten Wert ab
1600px sofort gelten, statt auf die Stufen bei 2100 / 2560 / 3200 zu warten —
also „vor den hardcoded Triggern", wie gefordert.

UI im Settings-Dialog: zwei Checkboxen plus ein Zahlenfeld, Übersetzungen als
Keys 251–254 in `src/util/translate.js` (de/en/es/fr/tr/br).

**Gefunden und behoben beim Testen.** Ein manueller Faktor unterhalb der
Auto-Trigger erzeugte einen horizontalen Scrollbalken (1600 / 1700 / 1920px mit
Faktor 1.3). Ursache: das Budget reservierte konstant 640px, aber die gezoomte
Planetenleiste schiebt den absolut positionierten Ad-Slot weiter nach rechts,
als die `margin:auto`-Zentrierung von `#pageContent` Platz lässt. Zwei
Korrekturen:

- Reserve wächst mit dem Zoom: `calc(260px + 384px * var(--ogl-wide-zoom))`,
  hergeleitet aus `gap >= overhang`.
- Untergrenze der Spalte teilt durch den Zoom
  (`calc(670px / var(--ogl-wide-zoom))`), damit die Spalte nie _sichtbar_
  schmaler wird als Vanilla, egal wie stark gezoomt wird.

`WIDE_ZOOM_MAX` ist deshalb **1.75**, nicht 2: bei 1600px — der schmalsten
Breite, auf der das Feature überhaupt aktiv ist — beginnt der Überlauf gemessen
ab 1.85. Die Planetenleiste ist `max-content`, ihre Breite hängt von den
Planetennamen ab, daher der Puffer.

### Messungen (Schalter-Matrix bei 2560px)

| Fall                    | zoom | spec   | sichtbar | Kachel | Banner  | H-Scroll |
| ----------------------- | ---- | ------ | -------- | ------ | ------- | -------- |
| beides AUS              | 1    | 670px  | 670      | 100    | 160x600 | nein     |
| Layout AN, Zoom AUS     | 1    | 1400px | 1400     | 100    | 160x600 | nein     |
| Zoom AN, Layout AUS     | 1.25 | 670px  | 838      | 125    | 160x600 | nein     |
| beides AN (automatisch) | 1.25 | 1400px | 1750     | 125    | 160x600 | nein     |
| beides AN + manuell 1.2 | 1.2  | 1400px | 1680     | 120    | 160x600 | nein     |
| beides AN + manuell 1.0 | 1    | 1400px | 1400     | 100    | 160x600 | nein     |

„beides AUS" trifft exakt die Vanilla-Werte 670 / 654 — der Beweis, dass der
Schalter zurücksetzt statt zu überlagern.

### Messungen (manueller Faktor vor den Auto-Triggern)

| Viewport | manuell | zoom | `#middle` sichtbar | H-Scroll |
| -------- | ------- | ---- | ------------------ | -------- |
| 1600     | auto    | 1    | 956                | nein     |
| 1600     | 1.4     | 1.4  | 802                | nein     |
| 1600     | 1.75    | 1.75 | 670                | nein     |
| 1700     | 1.5     | 1.5  | 864                | nein     |
| 1920     | 1.75    | 1.75 | 988                | nein     |
| 2560     | 1.75    | 1.75 | 1628               | nein     |
| 3440     | 1.75    | 1.75 | 2450               | nein     |

Banner in jeder Zeile konstant 160x600.

### Tests

`test/ctxpage/wide-layout.test.js`, 13 Tests: Klassen-Schaltlogik, Inline-Wert
gesetzt/entfernt, unitloser Wert (`zoom: 1.2px` wäre ungültig), Clamping,
Komma-Dezimaltrennung (`1,25`), Müll-Eingaben, kein Wurf ohne `document`.
Gesamtsuite 347 pass / 0 fail.

**Ungeprüft:** die Verdrahtung im Settings-Dialog selbst (Checkboxen, Zahlenfeld,
Save-Handler in `src/ogkush.js`) — der Render-Harness läuft ohne Extension-JS,
und für `ogkush.js` gibt es im Repo keine Testinfrastruktur. Die Modullogik
dahinter ist getestet, das Anklicken im Spiel nicht.

### Korrektur zu CLAUDE.md

CLAUDE.md sagt, `npm run check` sei auf `master` rot wegen zehn Dateien
(u.a. `ogkush.js`, `translate.js`). Nachgemessen per `git stash`: beide sind
prettier-**sauber**. Auch `scripts/split-translations.mjs` und die Targets
`make translations` / `make translations-check` existieren nicht; die
Übersetzungen liegen als eingefrorenes Objekt in `src/util/translate.js`.
