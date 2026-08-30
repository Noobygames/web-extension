# UX & UI Design Review

Review-Durchgang über Info-Anzeige, Nutzerführung, Sortierung. Alle Fixes: Tests grün, Lint sauber, Bundle baut.

## Fixes

**Loading/Error-States**
- PTRE-Popup: Spinner beim Öffnen, Fehlermeldung statt Endlos-Spinner bei Netzwerkfehler
- Stats-Popup: Spinner beim Öffnen (Chart.js-Injection + Datenladen konnte Klick tot wirken lassen)
- PTRE-Sync-Fehler: jetzt geloggt statt komplett verschluckt

**Empty-States**
- Spy-Tabelle: "Keine Berichte hier" statt nacktem Header bei leerem Papierkorb/Favoriten

**Info-Hierarchie**
- Minen-Zeile Planetbar: Tooltip erklärt Metall-Kristall-Deuterium-Reihenfolge
- Empire-Übersicht (minesOverview): Legende für 4 gestapelte, unbeschriftete Werte pro Zelle (Bestand/Std/Tag/Woche)

**Spio-Tabelle Sortierung (Bugs)**
- Sortier-Klick auf Spalten-Header ohne `stopPropagation()` — Klick bubbelt in OGame's native Nachrichtenliste, löst dort vermutlich Toasts aus. Fix: stopPropagation ergänzt.
- Stale-Options-Bug: Optionen wurden beim Tabellenaufbau einmal gelesen und im Klick-Handler geschlossen — jeder Sortier-Klick überschrieb stillschweigend andere zwischenzeitlich geänderte Optionen (z.B. Frachter-Wahl). Fix: frisch lesen bei jedem Klick.
- Falsche Zeilennummern: im append-Modus (Standard) wurden Zeilen neu einsortiert, aber die "#"-Spalte nie aktualisiert — Nummern stimmten nicht mit sichtbarer Reihenfolge überein. Fix: Neunummerierung nach jedem Sortieren.
- Aufgeklappte Renta-Aufschlüsselung blieb beim Verschieben der Zeile an alter Position zurück. Fix: vor Verschieben zugeklappt.
- 2 neue Regressionstests (fallen mit altem Code durch, grün mit Fix).

**Vorheriger Review-Durchgang (gleiche Session, davor)**
- ~100+ Tooltips ergänzt: Settings, Fleetdispatch (Expedition/CustomMissions/Collect/KeepOnPlanet/BetterFleetDispatcher), TechnoDetail, Stalk, Galaxy, Messages/SpyTable, Popup/Tooltip-Infrastruktur, Planetbar, PTRE
- Settings-Fenster: Gruppen-Header, sticky Save-Footer, Datenverwaltung erklärt
- Spy-Tabelle: max-height + sticky Header (unbegrenztes Wachstum vorher)
- PTRE-Timeframe-Buttons: aktiver Zustand fehlte
- Ctrl+? Shortcut für Welcome-Popup implementiert (war nur behauptet, nie verdrahtet)
- Falsche Shortcut-Behauptungen (f/s/e/d) entfernt (Konfliktrisiko mit Fleetdispatch-Shortcuts, nicht live verifizierbar)
- Echter Bugfix: toter Spy-Icon-Klick in Stalk-Panel jetzt mit `probingWarning()` verdrahtet (Compliance §1.5.1)
- 6 passive-Listener DevTools-Warnings gefixt
- Gewinn/h: Schiffsanzahl-Mismatch bei Treibstoffkosten behoben, Tooltip-Lesbarkeit verbessert

**Weitere Runde**
- Eventbox-Hover: Nachbarzeile (vorherige Zeile) über/unter gehoverter Zeile blieb nach `mouseout` dauerhaft aufgehellt (Opacity nie zurückgesetzt) — jede gehoverte Fleet-Zeile hinterließ eine "kaputte" Zeile in der Liste. Fix: eigene Original-Opacity je Zeile gecacht und für Nachbarn korrekt wiederhergestellt statt hartkodiertem Wert bzw. gar keinem Reset.
- Eventbox "Keep"-Checkbox-Label war hartkodiertes Englisch statt übersetzt (Nachbar-Checkbox nutzte bereits Translator) — neuer Key 347 in allen 6 Sprachdateien ergänzt.
- Settings-Reset-Button: `confirm("Are you sure ? :)")` — unübersetzt, unprofessioneller Ton für eine Aktion die potenziell ALLE Optionen/Expeditionen/Kämpfe/Spähberichte/Cache löscht. Fix: nutzt jetzt vorhandenen Key 197 ("Are you sure you want to perform this action?").
- PTRE-Key-Format-Fehlermeldung im Settings-Fenster war hartkodiertes Englisch. Fix: neuer Key 348, übersetzt in allen 6 Sprachen.
- PTRE-Stats-Zeilen ("Last API update", "Systems count", "Storage size" + "never"/"(unavailable)") im Settings-Fenster waren ebenfalls hartkodiertes Englisch. Fix: Keys 349-353 in allen 6 Sprachen ergänzt.

## Geprüft, kein Fix nötig
fleetOverview/defenseOverview/resourceDetail (Empire-Übersicht) — bereits gelabelt bzw. farbcodiert. Fleetdispatch-Briefing-Panel — sauber Label+Wert gepaart. Galaxy-Ansicht — Tooltips vorhanden. Overview-Page Toggle — hat bereits visuellen Zustand. Empire/EmpireOverview/Pantry — Tooltips ausreichend.
