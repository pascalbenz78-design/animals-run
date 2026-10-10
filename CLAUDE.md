# Animals Run – Projektregeln für Claude

Tier-Rennspiel (Mario-Kart-Stil) als statisches Browserspiel. Vollständiges Konzept: `docs/GAME_DESIGN.md` (inkl. Abschnitt «Entscheide»). Privates Familienprojekt: keine Werbung, kein Tracking, keine Anmeldung, keine externen Dienste/Schriften (ausser PeerJS-Vermittlung ab Phase 4).

## Befehle

```bash
npm install          # Abhängigkeiten
npm run dev          # Entwicklungsserver (auch im WLAN erreichbar: http://<PC-IP>:5173)
npm run build        # Typprüfung + Produktions-Build nach dist/
npm run sim          # Kopfloser Renn-Test: Renndauer, Energie, Balance (z. B. npm run sim -- 50 schwer)
npx tsx scripts/trackinfo.ts             # Prüfung aller Strecken (engste Kurve, Abstand der Teile)
npx tsx scripts/trackinfo.ts alpen       # Karte und Kurvenprofil einer Strecke (zum Platzieren von Objekten)
npx tsx scripts/elemstats.ts             # Statistik je Strecke: Rundenzeit, Stürze, Abkürzungen …
npx tsx scripts/nettest.ts 60            # Mehrspieler-Abgleich ohne Netzwerk (Verzögerung in ms je Richtung)
npx tsx scripts/diag.ts                  # Details eines Rennens pro Tier
```

Testhilfen im Browser: `?fps`, `?test` (Autopilot fürs eigene Tier), `?timescale=5`; `window.__game` (state, session, startRace(), advance(sekunden) spult ohne Bildschirm-Takt vor, usePower() löst die eigene Superkraft aus, startCup(), finishNow(), nextCupRace()).

## Regeln

- **Alle Zahlenwerte** (Tempo, Dauer, Reichweiten, KI) in `src/config/balance.ts`. Alle Texte in `src/config/texts.ts` (Deutsch, Schweizer Schreibweise «ss», nie «ß»).
- **Simulation strikt getrennt** von Darstellung/Eingabe: `src/game/` importiert nie `three` oder DOM. Jedes Tier wird nur über ein `Input`-Objekt gesteuert (Mensch, KI, später Netz). Feste Rate 60 Hz, Darstellung interpoliert (`prevX` usw.).
- Simulation deterministisch halten (kein `Math.random` in `src/game/`, stattdessen `mulberry32`) – wichtig für Mehrspieler.
- Strecken als Daten (`src/tracks/*.ts`): Kontrollpunkte + Objektlisten mit `s` (Anteil der Runde) und `d` (Meter, positiv = links).
- Leistung: Instancing für wiederholte Objekte, eingefärbte zusammengefügte Meshes (`render/geo.ts`), Grafikstufen hoch/mittel/niedrig.
- `localStorage` nur in `src/storage.ts`, immer in try/catch.
- Neue Dateien/Assets mit Herkunft und Lizenz in `CREDITS.md`.
- Keine Platzhalter, die so tun, als wären sie fertig. Was fehlt, steht unten im Phasenstand.
- Nach Änderungen: `npm run build` und `npm run sim`; sichtbare Änderungen im Browser prüfen.
- Am Ende jeder Phase: Git-Commit, Zusammenfassung, Testanleitung (PC + Handy), auf OK warten.

## Struktur

```
src/config     balance.ts (Zahlen), texts.ts (Texte)
src/game       Simulation: track.ts, simulation.ts, elements.ts (Streckenelemente), powers.ts, ai.ts, types.ts, rng.ts
src/animals    animals.ts (Daten), models.ts (3D-Modelle + Animation)
src/tracks     Streckendaten (bauernhof.ts …), types.ts
src/render     renderer.ts, trackView.ts, trackElements.ts, decor.ts, landmarks.ts, weather.ts, effects.ts,
               raceView.ts, ceremony.ts, geo.ts, textures.ts
src/input      input.ts (Tastatur, Touch, Gamepad)
src/ui         hud.ts, menus.ts, style.css
src/net        Mehrspieler: peer.ts (PeerJS), mp.ts (Lobby/Ablauf), raceSync.ts (Vorhersage/Abgleich), sync.ts, protocol.ts
src/audio      (Phase 5) Musik und Töne
scripts        simrace.ts, diag.ts, trackinfo.ts
```

## Stand der Phasen

- [x] **Phase 1 – Grundgerüst und Fahrgefühl** (abgenommen; danach Runden auf ~35 s verkürzt, Rundenzeit-Anzeige mit Bestzeit)
  - Vite + TypeScript + Three.js, Simulation 60 Hz mit Interpolation, Input-Objekte
  - Strecke Bauernhof (Hürden, Heuballen, Matsch, 2 Ladestationen, Stall, Silo, Teich, Traktor, Tribüne, Windrad, Hühner)
  - Lenni und Aramis mit Lauf-/Sprung-/Stolper-/Jubelanimation
  - Steuerung PC (Tastatur, Gamepad) und Touch, Auto-Lauf, Verfolgerkamera
  - Kontrollpunkte, 3 Runden, Countdown, Ergebnisliste, Bestzeiten, Pause, Optionen
  - Energie mit Ladestationen, 7 Computergegner (Stufen leicht/mittel/schwer wählbar)
- [x] **Phase 2 – Tiere, Superkräfte und Items** (abgeschlossen, wartet auf Abnahme)
  - Alle 10 Tiere mit eigenem Modell (Pferd, Katze, Husky, Hamster), Werten, Icon und Superkraft (`src/game/powers.ts`)
  - Icon-Punkte mit Aufholhilfe, 4 Items aus Item-Kisten, Effekte (gestoppt, rutschen, verlangsamt, geschützt)
  - Sichtbare Effekte in `src/render/effects.ts`, HUD mit Superkraft-Anzeige, Item-Einblendung, Superkraft-Taste
  - Tierwahl mit drehbarer 3D-Vorschau (`src/ui/preview.ts`)
  - Computergegner nutzen Kräfte und Items (leicht/mittel/schwer), Balance-Test aller Tiere (`npm run sim`)
- [x] **Phase 3 – Strecken, Cup und Menüs** (abgeschlossen, wartet auf Abnahme)
  - Wünsche umgesetzt: Ray gescheckt, Rundenzeit oben, mehr Energieverbrauch, Runden 39–45 s, Auto-Lauf an (+ Bremse)
  - Alle 8 Strecken mit eigener Stimmung, Wetter und je einer Abkürzung; Baukasten in `src/game/elements.ts`
  - Cup-Modus (Pfoten-/Hufeisen-Cup) mit Punkten, Zwischenwertung und Siegerehrung (`src/render/ceremony.ts`)
  - Menüs: Einzelrennen, Cup, Optionen, Steuerung; Bestzeiten und bestes Cup-Ergebnis gespeichert
- [x] **Phase 4 – Mehrspieler** (abgeschlossen, wartet auf Abnahme)
  - Vorab: Hilfe & Tipps (Regeln, Tiere, Strecken-FAQ), Springen während Superkräften, Rampen-Darstellung
  - Raumcode, Lobby (Name, Tierwahl, Bereit, Ping, Einstellungen des Gastgebers), bis 3 Personen + Computer
  - Gastgeber rechnet, 20 Schnappschüsse/s, Client-Vorhersage mit Korrektur, Einzelrennen und Cup
  - Abbruch: Computer übernimmt, Wiedereinstieg mit Code; Gastgeber weg → Meldung für alle
  - Getestet: `scripts/nettest.ts` und zwei Browser-Tabs auf einem PC (Lobby, Rennen, Cup, Abbruch, Wiedereinstieg)
- [ ] **Phase 5** – Ton/Musik, Leistungsoptimierung Handy, Veröffentlichung (GitHub Pages)

Noch nicht vorhanden (bewusst): Musik/Töne (auch für Superkräfte; Lautstärke-Optionen erst mit Ton), TURN-Server (nur vorbereitet), Hochformat-Steuerung (Hinweis «Bitte Gerät drehen» ist da).
Mehrspieler: Das Fenster des Gastgebers muss sichtbar bleiben (Browser drosseln Hintergrund-Tabs).
Bekannt: Lianen im Dschungel sind nur Kulisse (kein Spielelement). Leistung auf älteren Handys noch nicht gemessen (Phase 5).
