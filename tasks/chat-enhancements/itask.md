# Task: Chat — PN-Button und Koordinaten-Hovermenü

**Status:** Umgesetzt (ingame ungetestet)
**Typ:** Feature
**Branch-Vorschlag:** `feature/chat_enhancements`
**Kontext:** Page context (`src/ctxpage/chat/index.js`, `src/global.css`, `src/util/translate.js`, `src/ogkush.js`)

---

## 1. Anforderung

1. Im Allianzchat neben dem Namen des Nachrichtenautors ein Button, um eine PN zu senden.
2. Alle Koordinaten im Chat (`1:34:6` oder `1-24-5`) bekommen ein Hovermenü mit
   Spionieren, Angreifen und Sprung in die Galaxieansicht.

## 2. Compliance-Einordnung (AGENTS.md)

| Wunsch                       | Verdikt                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| PN-Button am Autor           | ✅ erlaubt — öffnet den spielinternen Chat, 1 Klick = 1 Aktion             |
| Sprung in die Galaxieansicht | ✅ erlaubt — reine Navigation                                              |
| Angriff                      | ✅ als Navigation zu `fleetdispatch` mit vorbelegtem Ziel (Repo-Präzedenz) |
| **Direktes Spionieren**      | ❌ **verboten, nicht gebaut** — §1.5.1                                     |

**Warum kein Spionage-Button.** §1.5.1 verbietet, eine Direkt-Spionage an
Koordinatenanzeigen oder eigene Ziellisten zu hängen. Vanilla erlaubt Direct
Probing nur aus der Galaxieansicht und aus Spionageberichten im Posteingang —
Chatnachrichten sind beides nicht. Das Repo hat diese Grenze bereits gezogen:
`OGBeyondInfinity.renderPlanet()` (`src/ogkush.js`) zeigt zwar noch das Augensymbol,
ruft aber `probingWarning()` statt `sendShipsWithPopup()`.

**Ersatz:** Der Augen-Eintrag im Menü öffnet die Galaxieansicht auf genau dieser
Koordinate. Das ist der von den Regeln geforderte Weg — das Spielsymbol zum
Spionieren steht dann in der Zeile.

**Angriff.** Der Eintrag setzt nur `galaxy/system/position/type` in der URL von
`fleetdispatch`. Keine Mission, keine Schiffe, kein Absenden — der Spieler
bestätigt in der Spiel-UI. Identisch zu dem, was `renderPlanet()` für Stalk- und
Ziellisten seit jeher tut.

Keine Netzwerkaufrufe, keine Timer, kein Polling, keine Datenerhebung. Der
MutationObserver liest ausschließlich Markup, das das Spiel selbst auf die vom
Spieler geöffnete Seite geschrieben hat (§1.3 / §4 nicht berührt).

## 3. DOM-Grundlage

Aus dem echten Dump `tasks/design-changes/example.html` (v13.0.0-r16):

```html
<li class="chat_bar_list_item" data-associationid="500003">
  <!-- Allianzchat -->
  <ul class="chat" data-foreign-association-id="500003">
    <li class="chat_msg" data-chat-id="30501">
      <div class="msg_head">
        <span class="msg_date fright">27.08.2026 18:39:15</span>
        <span class="msg_title blue_txt">Emperor Viking</span>
        <!-- nur Text, keine ID -->
      </div>
      <span class="msg_content">…</span>
    </li>
  </ul>
</li>
```

Privatchats liegen unter `data-playerid` / `data-foreign-player-id`,
Systemnachrichten sind `li.chat_msg.sys_msg`.

**Kernproblem:** Der Absender steht nur als Text da, ohne Spieler-ID. Die ID
kommt deshalb aus drei rein lokalen Quellen, in dieser Reihenfolge:

1. `.cb_playername[data-playerid]` — Kontaktliste/offene Unterhaltungen im DOM,
2. `window.visibleChats.players[]` — das Global neben der Chatbar,
3. `window.ogame.chat.playerList` — die Liste, die das Spiel selbst lädt
   (undokumentierte Struktur, defensiv gelesen),
4. Fallback: `Player.get(name)` über die Bridge `ogi-players` → `DataHelper`
   (bereits gecachte Universumsdaten, kein Request ans Spiel).

Findet keine Quelle die ID, öffnet der Klick die Chatseite, statt tot zu sein.

## 4. Koordinatenerkennung

```
/(?<!\d)(?<![\d][:.-])([1-9])([:-])([1-9]\d{0,2})\2(1[0-6]|[1-9])(?!\d)(?![:.-]\d)/g
```

Die Wertebereiche sind Teil des Musters, weil Chat voll von Uhrzeiten und Daten
ist, die wie Koordinaten aussehen:

| Text         | Ergebnis | Grund                                          |
| ------------ | -------- | ---------------------------------------------- |
| `1:34:6`     | Treffer  |                                                |
| `1-24-5`     | Treffer  | normalisiert zu `1:24:5`                       |
| `4:117:12.`  | Treffer  | Satzpunkt ist kein Trennzeichen                |
| `18:39:15`   | kein     | Galaxie ist `[1-9]`, Lookbehind blockt die `8` |
| `2026-08-27` | kein     | dito                                           |
| `1:34-6`     | kein     | Trennzeichen per Backreference identisch       |
| `1:34:17`    | kein     | Position > 16                                  |

Gegen den echten Dump (73 Nachrichten): 5 Koordinaten erkannt, davon eine in
Bindestrich-Schreibweise, **0** TreffOGBeyondInfinityg_date`.

## 5. Umsetzung

- `src/ctxpage/chat/index.js` — neues Page-Context-Modul.
  `initChatEnhancements()` läuft in `OGInfinity.start()` direkt nach `this.chat()`.
- Beobachtet `#chatBar` (und auf `component=chat` die Contentspalte), weil die
  Chatbar ihre Historie asynchron nachlädt und jede neue Nachricht anhängt.
  `data-ogl-chat` verhindert Doppelverarbeitung.
- PN-Button nur in Assoziationschats, nicht bei Systemnachrichten und nicht bei
  eigenen Nachrichten (`meta[name="ogame-player-name"]`; OGame lehnt Chat mit
  sich selbst ab).
- **Platzierung:** inline in der Absenderzeile hat das Layout der Nachricht
  gesprengt. Der Button hängt jetzt hinter dem Melden-Button und ist
  `float: right; clear: right`, liegt also darunter und außerhalb des
  Textflusses. Den Melden-Button fügt OGames eigenes Skript zur Laufzeit ein —
  er steht in keinem gespeicherten Dump, seine Klasse ist im Repo nirgends
  belegt. `findReportControl()` sucht deshalb per Attribut-Sweep
  (`class`/`id`/`title`/`onclick`/`data-action` gegen `/report|melden|operator/i`).
  Fehlt er noch, landet der Button vorne in `.msg_head` (durch den Float unter
  dem Datum) und wandert beim ersten `mouseenter` nach, sobald das Spiel den
  Melden-Button nachgezogen hat.
  **Offen:** die echte Klasse des Melden-Buttons ist ungeprüft — beim ersten
  Ingame-Durchlauf verifizieren und den Sweep ggf. auf einen festen Selektor
  reduzieren.
- Hovermenü über die vorhandene `tooltip()`-Utility, Einträge sind echte
  `<a href>` — Strg+Klick öffnet also im neuen Tab.
- CSS-Block am Ende von `src/global.css`, rein additiv.
- Übersetzungen: Keys 255–259 in `src/util/translate.js` (de/en/es/fr/tr/br).

## 6. Tests

`test/ctxpage/chat.test.js`, 13 Tests (Gesamtsuite 360 pass / 0 fail):
Notationen, False-Positive-Liste (Uhrzeiten, Daten, gemischte Trenner,
Position > 16), Textknoten-Ersetzung ohne Textverlust, keine Verschachtelung in
Links, Idempotenz, PN-Button-Sichtbarkeitsregeln, ID-Auflösung aus allen drei
lokalen Quellen plus Bridge-Fallback, Observer für nachgeladene Nachrichten,
und eine Compliance-Assertion: die Menü-Links enthalten weder `miniFleet` noch
`mission=`.

## 7. Nicht verifiziert

- Kein Ingame-Durchlauf. Getestet gegen jsdom und den gespeicherten Dump.
- Die Standalone-Chatseite (`component=chat`) lag nicht als Dump vor; dort wird
  auf `#chatcomponent` → `#middle` → `body` zurückgefallen. Beim ersten
  Ingame-Test prüfen, ob dort ebenfalls `li.chat_msg` verwendet wird.
- v12: Chatbar-Markup ist in beiden Versionen `li.chat_msg` — ungeprüft.
- Die Trefferquote der lokalen ID-Auflösung hängt davon ab, wen das Spiel in der
  Kontaktliste rendert; im Dump war sie leer (wird per JS gefüllt).
