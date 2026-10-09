# Animals Run – Spielkonzept

> Dieses Dokument enthält den vollständigen ursprünglichen Auftrag (unten) sowie die während der Entwicklung getroffenen Entscheide (ganz am Schluss).

## Deine Rolle und der Auftrag

Du bist ein erfahrener Game-Entwickler für 3D-Browserspiele. Baue mit mir das Spiel **«Animals Run»**: ein Tier-Rennspiel im Stil von Mario Kart. Tiere laufen auf Parcours mit Hindernissen um die Wette, sammeln Icons für ihre Superkräfte, allgemeine Items und Energie. Gespielt wird allein gegen Computergegner oder zu dritt auf verschiedenen Geräten.

Das Spiel ist ein privates Familienprojekt: keine Werbung, kein Tracking, keine Anmeldung, keine Käufe.

**Arbeitsweise:**

1. Lege zuerst `docs/GAME_DESIGN.md` an und übernimm diesen gesamten Auftrag dort als Spielkonzept. Lege zusätzlich eine `CLAUDE.md` an mit Projektregeln, Befehlen und dem aktuellen Stand der Phasen. Halte beide Dateien laufend aktuell.
2. Erstelle dann einen kurzen Plan für Phase 1 und beginne sofort.
3. Arbeite **strikt in den Phasen unten**. Jede Phase endet mit einem spielbaren Stand. Am Ende jeder Phase: Git-Commit, kurze Zusammenfassung, Anleitung zum Testen (am PC und am Handy), dann auf mein OK warten.
4. Wenn etwas unklar ist oder nicht wie beschrieben machbar ist, triff eine vernünftige Entscheidung, halte sie in `docs/GAME_DESIGN.md` unter «Entscheide» fest und sag es mir.
5. Alle Zahlenwerte (Tempo, Dauer, Reichweiten) gehören in **eine zentrale Konfigurationsdatei** (`src/config/balance.ts`), damit ich sie später einfach anpassen kann.

---

## Technik

- **Browserspiel** für PC und Handy. Kein App-Store, keine Installation.
- **Vite + TypeScript + Three.js.** Physik als eigene, einfache Arcade-Physik (kein schweres Physik-Framework): Die Tiere bewegen sich entlang der Strecke mit Lenkung, Sprung, Schwerkraft und einfachen Kollisionen.
- **Mehrspieler** über WebRTC mit **PeerJS** (siehe Abschnitt Mehrspieler). So bleibt das Spiel eine rein statische Website ohne eigenen Server.
- **Hosting:** als statische Seite, die auf GitHub Pages oder Netlify läuft. Schreibe eine `README.md` mit Schritt-für-Schritt-Anleitung (für jemanden ohne Profi-Kenntnisse).
- **Architektur von Anfang an mehrspielerfähig:** Spiel-Logik (Simulation) strikt getrennt von Darstellung und Eingabe. Jedes Tier wird über ein Eingabe-Objekt gesteuert (`{ vorwaerts, links, rechts, springen, superkraft }`), egal ob Mensch, Computergegner oder Mitspieler im Netz. Feste Simulationsrate (z. B. 60 Hz), Darstellung interpoliert.
- **Leistung:** Muss auf einem durchschnittlichen Handy flüssig laufen (Ziel 60 fps, mindestens 30 fps). Low-Poly-Modelle, Instancing für wiederholte Objekte (Bäume, Zäune, Steine), begrenzte Pixel-Ratio, Grafikstufen «Hoch / Mittel / Niedrig» im Menü.
- **Speichern:** Bestzeiten, Cup-Ergebnisse und Einstellungen lokal im Browser (`localStorage`, in `try/catch`).
- **Sprache der Oberfläche:** Deutsch mit Schweizer Schreibweise («ss» statt «ß»). Alle Texte zentral in einer Datei.

---

## Grafikstil

- **Hochwertige, farbenfrohe Comic- bzw. Low-Poly-3D-Grafik**, stimmig wie ein modernes Kart-Spiel. Nicht fotorealistisch.
- Weiches Licht, Schatten, Himmel/Skybox pro Strecke, Partikel (Staub, Spritzwasser, Schnee, Laub), Geschwindigkeitslinien beim Turbo.
- **3D-Modelle:** Verwende frei nutzbare Modelle mit CC0-Lizenz (z. B. Quaternius, Kenney, Poly Pizza), wenn passende animierte Tiermodelle verfügbar sind. Gibt es für ein Tier kein passendes Modell, baue ein stilisiertes Low-Poly-Modell selbst aus Grundformen und animiere es per Code (Laufzyklus, Sprung, Schwimmen, Jubeln, Ausgebremst-Sein).
- Die Tiere werden **nach den Beschreibungen unten eingefärbt**, damit man sie wiedererkennt (Fellfarbe, Mähne, Abzeichen).
- Jede verwendete Datei mit Herkunft und Lizenz in `CREDITS.md` aufführen. Keine geschützten Figuren, Marken oder Logos nachbilden (auch nicht von Mario Kart).

---

## Steuerung

Einfach halten, nur vier Funktionen:

| Funktion | PC | Handy (Querformat, Touch-Tasten) |
|---|---|---|
| Vorwärts laufen | Pfeil hoch oder W | Taste rechts unten «Lauf» |
| Lenken links / rechts | Pfeiltasten oder A / D | Tasten ◀ ▶ links unten |
| Springen | Leertaste | Taste «Sprung» |
| Superkraft auslösen | E oder Shift | Taste «Superkraft» (leuchtet, wenn bereit) |
| Pause | Esc | Pause-Symbol oben |

- Lässt man «Vorwärts» los, läuft das Tier aus und bleibt stehen. Kein Rückwärts.
- **Option «Auto-Lauf»** im Menü (vor allem fürs Handy): Das Tier läuft selbständig vorwärts, man lenkt nur.
- Gamepad-Unterstützung ist willkommen, aber nicht Pflicht.
- **Allgemeine Items wirken sofort beim Einsammeln** (keine zusätzliche Taste).
- Fällt ein Tier von der Strecke oder in Lava/tiefes Loch, wird es nach kurzer Zeit (ca. 1,5 s) am letzten Kontrollpunkt wieder eingesetzt.

---

## Rennablauf

- **8 Tiere pro Rennen:** die menschlichen Spieler, aufgefüllt mit Computergegnern.
- **3 Runden** pro Rennen, ein Rennen dauert **rund 4 Minuten** (eine Runde ca. 75–85 s). Streckenlänge entsprechend abstimmen.
- Startaufstellung, Countdown «3 – 2 – 1 – Los!», Kontrollpunkte gegen Abkürzen, Rundenzähler, Zielflagge, Ergebnisliste mit Zeiten.
- **Anzeige während des Rennens (HUD):** Platz, Runde x/3, Rennzeit, Energiebalken, Superkraft-Anzeige (Tier-Icon und 0/3 gesammelte Icons), kurz eingeblendetes Item, Minikarte mit allen Tieren.

### Energie

- Jedes Tier hat **Energie von 0 bis 100**. Sie sinkt beim Laufen langsam, beim Schwimmen und Bergauflaufen schneller.
- **Unter 30 Energie wird das Tier langsamer**, bei 0 deutlich langsamer (z. B. −35 % Tempo), aber es bleibt nie stehen.
- **Pro Runde 1–2 Ladestationen** (Blitz-Icons, ⚡) auf der Strecke. Einsammeln füllt die Energie stark auf. Die Blitze erscheinen nach einigen Sekunden wieder.
- Abstimmung: Wer keine Ladestation verpasst, kommt ohne Leistungseinbruch durch. Wer zwei hintereinander verpasst, merkt es deutlich.

### Superkräfte und persönliche Icons

- Jedes Tier hat ein **persönliches Icon** (siehe Tabelle). Auf der Strecke gibt es Icon-Punkte; jedes Tier sieht und sammelt dort **sein eigenes Icon** (im Mehrspieler sieht jeder Spieler sein eigenes).
- **3 Icons = Superkraft geladen.** Es kann höchstens eine Ladung gespeichert werden. Ausgelöst wird mit der Superkraft-Taste.
- **Aufholhilfe:** Je weiter hinten ein Tier liegt, desto mehr zusätzliche Icons erscheinen auf seiner Laufbahn (Platz 1: nur die normalen Icon-Punkte; Platz 8: deutlich mehr, z. B. drei- bis viermal so viele). Werte in `balance.ts`.
- Jede Superkraft hat einen gut sichtbaren Effekt und einen eigenen Sound. Getroffene Tiere zeigen eine kurze «Ausgebremst»-Animation (Sterne über dem Kopf).

### Allgemeine Items (genau 4)

Item-Kisten (Pfoten-Symbol) in Reihen auf der Strecke, 2–3 Reihen pro Runde. Wer zurückliegt, erhält eher hilfreiche Items, wer vorne liegt, eher die Falle.

| Item | Wirkung |
|---|---|
| ⚡ **Turbo-Pfote** | ca. 2,5 s deutlich schneller |
| 🐌 **Schneckenwolke** | alle Tiere vor dir werden ca. 3 s langsamer |
| 🛡️ **Schutzschild** | ca. 5 s unverwundbar gegen Superkräfte, Items und Hindernisse |
| 💩 **Matschfalle** | wird hinter dir abgelegt; wer hineinläuft, wird ca. 1,5 s stark gebremst |

---

## Die 10 Tiere

### Grundwerte nach Tierart (Skala 1–5)

| Tierart | Tempo | Beschleunigung | Sprung | Schwimmen | Wendigkeit |
|---|---|---|---|---|---|
| Pferde | 5 | 3 | 5 | 3 | 2 |
| Katzen | 3 | 5 | 4 | 1 | 5 |
| Hund (Husky) | 4 | 4 | 3 | 5 | 3 |
| Hamster | 2 | 5 | 2 | 2 | 5 |

- Katzen mögen kein Wasser und sind dort langsam, springen aber hoch und sind sehr wendig.
- Der Hamster ist klein: Er passt durch enge Lücken und kleine Abkürzungen, die für andere zu eng sind.
- Kleine Unterschiede innerhalb der Pferde: Athena (Tinker) ist robust und wird bei Zusammenstössen weniger weggestossen. Helja (Fjordpferd) ist trittsicher und rutscht auf Eis und Matsch weniger.
- Die Werte müssen so abgestimmt sein, dass **jedes Tier gewinnen kann**. Lege dafür einen einfachen Test an (Computergegner gegeneinander auf allen Strecken, Durchschnittsplatz pro Tier), damit keines klar über- oder unterlegen ist.

### Aussehen, Icon und Superkraft

| Tier | Aussehen | Icon | Superkraft |
|---|---|---|---|
| **Lenni** (Pferd) | Fuchs: rotbraunes Fell, Mähne und Schweif rotbraun | 🥕 Rübe | **Turbo-Galopp:** der stärkste reine Tempo-Schub im Spiel, ca. +60 % für 4 s |
| **Furiel** (Pferd) | Schimmel: sehr hell, weiss mit leichtem Grauton, Mähne hellgrau-weiss | ⚖️ Waage | **Sprung-Attacke:** springt auf das nächste Tier vor sich (Reichweite ca. 25 m) und bremst es ca. 2 s aus; Furiel erhält danach einen kleinen Schub |
| **Ray** (Pferd) | braunes Fell, weisser Fleck im Nacken, Mähne und Schweif schwarz | 🍎 Apfel | **Apfel-Regen:** lässt über 3 s fünf Äpfel hinter sich fallen; wer darauf tritt, rutscht weg und dreht sich (ca. 1,2 s) |
| **Athena** (Pferd, Tinker) | kräftiger Körperbau, gescheckt schwarz-weiss-braun mit viel Braun, Mähne schwarz-weiss, üppige Mähne und langer Fesselbehang | 🩹 Pflaster | **Schutzpflaster:** ca. 5 s unverwundbar (gegen Superkräfte, Items, Hindernisse) und Energie sofort auf 100 |
| **Helja** (Pferd, Fjordpferd) | Falbe: cremig gelbbraunes Fell, typische Stehmähne mit dunklem Mittelstreifen (innen schwarz, aussen hell), dunkler Aalstrich über den Rücken, kompakter Körperbau | 🌪️ Wirbelsturm | **Wirbelsturm:** dreht sich ca. 3 s wie ein Tornado; jedes Tier im Umkreis von ca. 8 m wird ca. 1,5 s gestoppt |
| **Aramis** (Katze) | braun-schwarz getigert, Bauch weiss | 🐭 Maus | **Mäusejagd:** eine Maus rennt voraus, Aramis jagt ihr ca. 5 s automatisch auf der Ideallinie hinterher (ca. +35 % Tempo) und weicht Hindernissen selbst aus |
| **Simba** (Katze) | rot getigert (orange) | 🥫 Katzenfutter | **Erdbeben:** nach kurzer Vorwarnung (Boden zittert ca. 0,5 s) werden alle Tiere am Boden im Umkreis von ca. 40 m für ca. 1,5 s gestoppt. **Wer in diesem Moment in der Luft ist, entkommt.** |
| **Shadow** (Katze) | schwarz mit weissen Stellen im Fell und im Gesicht | 🎵 Musiknote | **Miau-Schrei:** sichtbare Schallwellen nach vorne (Kegel, ca. 30 m); alle Tiere darin werden ca. 2 s gestoppt |
| **Tira** (Hund, Husky) | schwarzer Husky, Schnauze weiss, Pfoten weiss | 🦴 Knochen | **Spürnase:** eine Knochenspur zeigt den Weg zur nächsten Abkürzung, und Tira buddelt sich ca. 4 s unterirdisch voran (etwas schneller, unverwundbar, unter Hindernissen und Wasser hindurch) |
| **Gonzi** (Hamster) | beige-gräulich | 🎡 Hamsterrad | **Hamsterkugel:** rollt ca. 5 s in einer Hamsterkugel (ca. +20 % Tempo), rollt über alle Hindernisse, durchs Wasser ohne Tempoverlust und schubst andere Tiere zur Seite |

- Die drei Stopp-Kräfte unterscheiden sich bewusst: Helja wirkt rundherum auf kurze Distanz, Simba auf alle am Boden (Gegenmittel: springen), Shadow nur nach vorne.
- Das Schutzschild-Item und Athenas Schutzpflaster schützen gegen alle Stopp-Kräfte.
- Tierauswahl mit drehbarer 3D-Vorschau, Name, Tierart, Werte als Balken, Icon und kurzem Text zur Superkraft.

---

## Hindernisse und Streckenelemente

Baukasten, aus dem die Strecken zusammengesetzt werden:

- **Hürden** (überspringen, sonst Tempoverlust), Steine, Baumstämme, Heuballen, Zäune
- **Wassergraben** (überspringen oder durchwaten) und **Schwimmabschnitte** (Tempo hängt vom Wert «Schwimmen» ab; im tiefen Wasser kein Sprung)
- **Reifen** zum Durchspringen (Belohnung: kurzer Schub)
- **Sprungschanzen** und Abkürzungen, die nur mit gutem Sprung erreichbar sind
- **Matsch** (bremst), **Eis** (rutschig), **Sand** (etwas langsamer)
- **Bewegte Hindernisse:** rollende Baumstämme, Schaukelbrücken, Windräder, sich öffnende Tore
- **Umwelteffekte:** Sandsturm (schlechte Sicht), Lawine, Geysire als Schanzen, Lavaspalten
- Jede Strecke hat **1–2 Abkürzungen** (teils nur für kleine Tiere oder mit Spürnase sichtbar).

---

## Die 8 Strecken

| Nr. | Strecke | Jahreszeit / Ort | Besonderheiten | Cup |
|---|---|---|---|---|
| 1 | **Bauernhof** | Frühling | Einsteigerstrecke: Heuballen, Zäune, Matschpfützen, Hühner am Rand | Pfoten-Cup |
| 2 | **Reitturnier** | Sommer | Springplatz mit Oxern, Wassergraben, Reifen, Steilwand, Zuschauertribüne | Pfoten-Cup |
| 3 | **Sandstrand** | Sommer | längerer Schwimmabschnitt, Wellen, Sandburgen, Steg | Pfoten-Cup |
| 4 | **Herbstwald** | Herbst | rollende Baumstämme, Laubhaufen mit versteckten Items, Bachüberquerung | Pfoten-Cup |
| 5 | **Wüste** | – | Sanddünen-Sprünge, Kakteen, Oase, Sandsturm in Runde 2 und 3 | Hufeisen-Cup |
| 6 | **Alpen** | Winter | Eisflächen, Schneebälle, Holzbrücke, Lawine in Runde 3 | Hufeisen-Cup |
| 7 | **Dschungel** | Regenzeit | Lianen, Fluss mit Strömung, Hängebrücke, Wasserfall | Hufeisen-Cup |
| 8 | **Vulkaninsel bei Nacht** | – | Lavaspalten, Geysire als Schanzen, glühende Felsen (Finale) | Hufeisen-Cup |

- Jede Strecke: eigene Stimmung (Licht, Himmel, Partikel), 1–2 Energie-Ladestationen pro Runde, 2–3 Reihen Item-Kisten, Icon-Punkte, 1–2 Abkürzungen.
- Schwierigkeit steigt von Strecke 1 bis 8.
- Alle Strecken sind von Anfang an spielbar (nichts freischalten).
- Strecken als Daten beschreiben (Streckenverlauf als Spline plus Liste von Objekten), damit neue Strecken einfach hinzukommen.

---

## Spielmodi

1. **Einzelrennen:** Strecke, Tier und Schwierigkeit wählen.
2. **Cup:** 4 Strecken hintereinander (Pfoten-Cup oder Hufeisen-Cup). Punkte pro Rennen: 15 – 12 – 10 – 8 – 6 – 4 – 2 – 1. Zwischenwertung nach jedem Rennen, am Schluss **Siegerehrung auf dem Podest** mit Pokal-Animation.
3. **Mehrspieler:** Einzelrennen oder Cup mit bis zu 3 Personen auf verschiedenen Geräten (siehe unten).

### Computergegner, drei Stufen

| Stufe | Verhalten |
|---|---|
| **Leicht** | langsamer, ungenaue Linie, springt oft zu spät, setzt Superkräfte selten und ungezielt ein |
| **Mittel** | gute Linie, nutzt Ladestationen und Superkräfte sinnvoll |
| **Schwer** | nahezu Ideallinie, nutzt Abkürzungen, setzt Superkräfte taktisch ein (z. B. Simba-Erdbeben, wenn viele Gegner nahe am Boden sind), springt Simbas Erdbeben aus |

Die Computergegner folgen der Ideallinie der Strecke mit Abweichung je nach Stufe, weichen Hindernissen aus und nutzen dieselben Regeln wie die Spieler (kein Schummeln, ausser einer leichten, einstellbaren Aufholhilfe).

---

## Mehrspieler (bis zu 3 Personen)

- **Ablauf:** Ein Spieler wählt «Mehrspieler → Rennen erstellen» und erhält einen **4-stelligen Raumcode**. Die anderen wählen «Beitreten» und geben den Code ein. In der Lobby wählt jeder sein Tier (jedes Tier nur einmal pro Rennen), der Ersteller wählt Einzelrennen oder Cup, Strecke(n) und Schwierigkeit der Computergegner. Start, sobald alle «Bereit» gedrückt haben. Freie Plätze bis 8 füllen Computergegner.
- **Technik:** WebRTC über PeerJS (Datenkanäle). Das Gerät des Erstellers ist der **Host** und rechnet das Rennen verbindlich (Positionen, Kollisionen, Items, Superkräfte, Computergegner). Die anderen Geräte senden nur ihre Eingaben. Der Host verschickt den Spielzustand ca. 20-mal pro Sekunde; die anderen Geräte zeigen die Tiere geglättet (Interpolation) und berechnen die eigene Bewegung sofort vor (Client-Vorhersage mit Korrektur), damit sich die Steuerung direkt anfühlt.
- Die Peer-ID des Hosts wird aus dem Raumcode abgeleitet (mit festem Präfix für das Spiel), damit kein eigener Server nötig ist.
- **Verbindungsabbruch:** Ein Mitspieler, der die Verbindung verliert, wird durch einen Computergegner ersetzt und kann wieder beitreten. Verliert der Host die Verbindung, endet das Rennen für alle mit einer verständlichen Meldung.
- Verbindungsanzeige (Ping) in der Lobby. Verständliche Fehlermeldungen auf Deutsch, z. B. wenn ein Code nicht existiert.
- Im Heim-WLAN muss es zuverlässig funktionieren. Weise in der README darauf hin, dass manche Mobilfunknetze direkte Verbindungen blockieren können, und baue die Verbindung so, dass später ein TURN-Server ergänzt werden kann.
- **Testbarkeit:** Mehrspieler muss sich auf einem einzigen PC mit zwei Browserfenstern testen lassen.

---

## Menüs und Bildschirme

Titelbild mit Logo «Animals Run» und laufenden Tieren im Hintergrund → Hauptmenü (Einzelrennen, Cup, Mehrspieler, Optionen, Steuerung) → Tierwahl → Streckenwahl bzw. Cup-Wahl → Ladebildschirm mit Streckenvorschau → Countdown → Rennen → Ergebnis → (Cup: Zwischenwertung, Siegerehrung).

- Pause-Menü: Weiter, Neustart, Optionen, Zurück zum Menü.
- **Optionen:** Lautstärke Musik, Lautstärke Effekte, Stumm, Grafikqualität, Auto-Lauf, Steuerungshilfe ein/aus.
- Grosse, gut lesbare Schaltflächen, die auch am Handy leicht zu treffen sind. Am Handy Hinweis «Bitte Gerät drehen», wenn es im Hochformat gehalten wird; Vollbild-Schaltfläche.

---

## Ton und Musik

- **Hintergrundmusik:** eine eigene, fröhliche Melodie pro Strecke (passend zur Stimmung) sowie Musik fürs Menü und die Siegerehrung.
- **Tiergeräusche:** Wiehern, Miauen, Bellen bzw. Heulen (Husky), Fiepen (Hamster), z. B. beim Start, beim Auslösen der Superkraft und beim Jubeln im Ziel.
- **Effekte:** Hufgetrappel und Pfotenschritte je nach Untergrund, Platschen im Wasser, Einsammeln von Icons, Items und Blitzen, Countdown, Zieleinlauf.
- Quellen: lizenzfreie Dateien (CC0, z. B. Kenney-Audio oder CC0-Sounds) oder im Browser per Web Audio selbst erzeugt. Alles in `CREDITS.md` aufführen.
- Ton startet erst nach der ersten Berührung bzw. dem ersten Tastendruck (Browser-Regel).

---

## Phasen

### Phase 1: Grundgerüst und Fahrgefühl
- Projekt aufsetzen (Vite, TypeScript, Three.js), `README.md`, `CLAUDE.md`, `docs/GAME_DESIGN.md`, `src/config/balance.ts`.
- Strecke 1 **Bauernhof**, zunächst einfach gestaltet.
- Zwei Tiere: **Lenni** und **Aramis**, mit Lauf- und Sprunganimation.
- Steuerung PC und Touch, Verfolgerkamera, Springen, Hürden, Kontrollpunkte, 3 Runden, Countdown, Ergebnisliste.
- Energie mit Ladestationen.
- 7 Computergegner (Stufe Mittel).
- Architektur bereits mit Eingabe-Objekten und getrennter Simulation (für Mehrspieler).
- **Abnahme:** Ein komplettes Rennen ist am PC und am Handy flüssig spielbar und dauert ungefähr 4 Minuten.

### Phase 2: Alle Tiere, Superkräfte und Items
- Alle 10 Tiere mit Aussehen, Grundwerten, Icons und Superkräften.
- Icon-Sammeln (3 = geladen), Aufholhilfe, Superkraft-Taste.
- Die 4 allgemeinen Items mit Item-Kisten.
- Tierauswahl-Bildschirm mit 3D-Vorschau.
- Computergegner nutzen Superkräfte und Items; drei Schwierigkeitsstufen.
- Balance-Test aller Tiere.
- **Abnahme:** Jede Superkraft ist sichtbar, verständlich und fair.

### Phase 3: Alle Strecken, Cup und Menüs
- Strecken 2 bis 8 mit allen Streckenelementen, Stimmung und Abkürzungen; Strecke 1 grafisch fertig ausbauen.
- Cup-Modus mit Punkten, Zwischenwertung und Siegerehrung.
- Alle Menüs, Optionen, Pause, Bestzeiten.
- **Abnahme:** Beide Cups sind komplett spielbar.

### Phase 4: Mehrspieler
- Lobby mit Raumcode, Tierwahl, Bereit-Status.
- Host-Simulation, Zustandsübertragung, Interpolation, Client-Vorhersage, Verbindungsabbrüche.
- Mehrspieler für Einzelrennen und Cup.
- **Abnahme:** Drei Geräte im selben WLAN fahren gemeinsam ein Rennen ohne spürbare Verzögerung.

### Phase 5: Ton, Feinschliff und Veröffentlichung
- Musik, Tiergeräusche und Effekte.
- Leistungsoptimierung auf dem Handy, Grafikstufen.
- Letzte Balance-Runde, Fehlerbehebung.
- Veröffentlichung auf GitHub Pages (oder Netlify) nach Anleitung in der README.
- **Abnahme:** Das Spiel ist über eine Internetadresse auf PC und Handy spielbar, auch zu dritt.

---

## Qualitätsregeln

- Nach jeder Phase selbst testen: Spiel im Browser starten, ein Rennen durchspielen lassen (z. B. automatisiert mit Playwright und Computergegnern auf allen Plätzen), Konsole auf Fehler prüfen, Bildrate messen.
- Keine Platzhalter-Funktionen, die so tun, als wären sie fertig. Was noch fehlt, steht im Stand der Phasen in `CLAUDE.md`.
- Code verständlich gliedern (z. B. `src/game`, `src/render`, `src/input`, `src/net`, `src/ui`, `src/audio`, `src/tracks`, `src/animals`) und kurz kommentieren.
- Alle Texte im Spiel auf Deutsch mit «ss».

Beginne jetzt mit `docs/GAME_DESIGN.md`, `CLAUDE.md` und dem Plan für Phase 1.

---

## Entscheide

Hier stehen Entscheide, die während der Entwicklung getroffen wurden (mit Begründung).

### Phase 1

1. **Tiermodelle selbst gebaut.** Lenni und Aramis sind stilisierte Low-Poly-Modelle aus Grundformen, per Code animiert (Galopp/Laufzyklus, Sprung, Sterne beim Ausbremsen, Jubeln). Grund: keine Downloads nötig, Farben lassen sich exakt nach Beschreibung setzen, und es entstehen nur wenige Draw-Calls. CC0-Modelle (Quaternius, Kenney) können später ausgetauscht werden.
2. **Lenkung über «Bodenhaftung».** Die Drehrate ist höchstens *Haftung ÷ Tempo* (Wert `grip` in `balance.ts`, abhängig von «Wendigkeit»). Pferde haben einen grösseren Kurvenradius und müssen in engen Kurven kurz «Vorwärts» loslassen; Katzen kommen fast ohne Abbremsen durch. So zählt Wendigkeit spürbar, und beide Tierarten können gewinnen (Simulation: Lenni 57 % / Aramis 43 % Siege bei 30 Rennen).
3. **Computergegner in Phase 1.** Da es erst zwei Tiere gibt, laufen mehrere Lennis und Aramis mit (angezeigt als «Lenni 2», «Aramis 3» …). Ab Phase 2 kommt jedes Tier nur einmal pro Rennen vor.
4. **Ladestationen** bestehen aus zwei Reihen Blitze quer über die Bahn (6 + 4 Blitze), die nach 3 s wieder erscheinen. Bei 8 Tieren hat so jedes eine faire Chance; wer zwei Stationen verpasst, fällt unter 30 Energie.
5. **Schwierigkeitsstufen** sind bereits wählbar (Linientreue, Sprung-Timing, Tempo, Blitz-Suche). Das Spezialverhalten von «Schwer» (Abkürzungen, taktische Superkräfte, Erdbeben ausspringen) folgt mit den Superkräften und Abkürzungen in Phase 2/3.
6. **Streckenlänge.** Strecken werden über `targetLength` auf die gewünschte Rundenlänge skaliert. ~~Bauernhof 1250 m, Runde ≈ 80 s, Rennen ≈ 4 Min.~~ **Geändert auf Wunsch:** Runden dauern neu **ca. 35 s** (Bauernhof 560 m, kompakter neu ausgelegt), ein Rennen mit 3 Runden also knapp 2 Minuten. Dies ersetzt die Vorgabe «rund 4 Minuten» und gilt als Richtwert für alle Strecken. Energieverbrauch entsprechend verdoppelt (1,6 pro Sekunde), Kurvenhaftung neu abgestimmt.
7. **Startaufstellung.** Der Spieler startet auf Platz 5 (einstellbar: `RACE.playerGridPosition`).
8. **Banden.** Der Bauernhof ist komplett eingezäunt, man kann nicht herunterfallen. Das Wiedereinsetzen am letzten Kontrollpunkt (nach 1,5 s) ist in der Simulation vorhanden und wird ab Strecken mit Löchern/Wasser/Lava genutzt.
9. **Keine externen Schriften oder Dienste.** Kein Google Fonts o. Ä. (kein Tracking); es wird eine runde System-Schrift verwendet.
10. **Superkraft-Taste** ist in Phase 1 ausgeblendet (Superkräfte kommen in Phase 2), damit nichts so tut, als wäre es fertig. Ton und Musik folgen in Phase 5.
12. **Rundenzeit-Anzeige:** Beim Überqueren der Ziellinie erscheinen für 3,5 s die Rundenzeit, die eigene Bestzeit auf dieser Strecke (Runden-Rekord) und der Abstand dazu; bei einem neuen Rekord zusätzlich die bisherige Bestzeit. Rekorde gelten pro Strecke (unabhängig vom Tier) und werden sofort gespeichert. Alte Bestzeiten der 80-s-Strecke wurden verworfen.
11. **Testhilfen** in der Adresse: `?fps` (Bildrate), `?test` (Computer steuert auch das eigene Tier), `?timescale=5` (Simulation schneller). Dazu der kopflose Renn-Test `npm run sim`.
