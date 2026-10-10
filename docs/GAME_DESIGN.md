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

Item-Kisten in Reihen auf der Strecke, 2–3 Reihen pro Runde. Jede Kiste zeigt ihr Item (siehe Entscheid 57); versteckte Kisten im Laub sind Überraschungen: Wer zurückliegt, erhält eher hilfreiche Items, wer vorne liegt, eher die Falle.

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

### Phase 2

13. **Icon-Punkte und Aufholhilfe.** Pro Runde gibt es 3 normale Icon-Punkte. Dazu kommen bis zu 9 zusätzliche Punkte, die gleichmässig über die Runde verteilt sind. Platz 1 sieht keine davon, Platz 8 alle (`ICONS.extraByPlace`), also rund viermal so viele Icons. Jedes Tier sieht nur seine eigenen Icons; ein eingesammeltes Icon erscheint für dieses Tier nach 10 s wieder.
14. **Superkräfte** sind so umgesetzt wie beschrieben. Zusätzlich gilt:
    - Wer gestoppt wird, ist danach 1 s lang geschützt, damit man nicht mehrfach hintereinander getroffen wird.
    - Furiels Sprung-Attacke landet automatisch beim Ziel. Gibt es kein Ziel in Reichweite, wird sie zu einem grossen Sprung mit Schub.
    - Rays Äpfel fallen seitlich versetzt, damit sie die Bahn wirklich blockieren. Ray selbst rutscht auf den eigenen Äpfeln nicht aus.
    - Tiras «Spürnase» zeigt die Knochenspur entlang der Ideallinie. Abkürzungen gibt es erst ab Phase 3; dann führt die Spur dorthin.
    - Die Hamsterkugel ist nicht unverwundbar (das steht so nicht im Auftrag), rollt aber durch Hindernisse und Fallen.
15. **Schub und Kurven:** Während eines Schubs (Turbo, Superkraft) hat ein Tier mehr Kurvenhaftung (`PHYSICS.boostGrip`). Sonst würde der Schub in Kurven nichts bringen, besonders bei Pferden.
16. **Items:** Die Kisten stehen in 3 Reihen pro Runde und erscheinen nach 3 s wieder. Die Wahrscheinlichkeiten je Platz stehen in `ITEMS.odds`.
17. **Computergegner:**
    - **Leicht** löst die Superkraft nach einer zufälligen Wartezeit aus.
    - **Mittel** wartet auf passende Momente (z. B. Gegner in Reichweite) und springt dem Erdbeben in 45 % der Fälle aus.
    - **Schwer** handelt taktisch (z. B. Erdbeben erst bei mindestens 3 Gegnern), springt dem Erdbeben fast immer aus und weicht Äpfeln und Matschfallen aus.
    - Zusätzlich gibt es eine leichte Aufholhilfe: +0,8 % Tempo pro Platz Rückstand auf den besten Menschen (`AI.rubberBandPerPlace`).
18. **Balance-Test** (`npm run sim -- 150`, Stufe mittel, Bauernhof): Alle Tiere liegen im Schnitt zwischen Platz 3,8 und 5,1. Aramis gewinnt mit 23 % etwas häufiger. Die Feinabstimmung erfolgt, sobald alle Strecken da sind (Phase 3/5).
19. **Strecke** nochmals leicht gekürzt (500 m), weil Superkräfte und Items die Runden verlängern. Median-Runde: ca. 35 s.
20. **Töne** für die Superkräfte folgen mit dem gesamten Ton in Phase 5.

### Phase 3

21. **Wünsche nach Phase 2:**
    - Ray ist braun-weiss-schwarz gescheckt.
    - Die Rundenzeit wird oben im Bild angezeigt.
    - Die Energie nimmt stärker ab: Ein voller Tank reicht ca. 38 s bei vollem Tempo.
    - Auto-Lauf ist standardmässig an.
    - Runden dauern je nach Strecke ca. 39–45 s (Median der Computergegner auf «Mittel»).
22. **Bremsen mit Auto-Lauf:** Am PC mit S / Pfeil runter. Am Handy wird die «Lauf»-Taste zur «Bremse»-Taste, damit man in engen Kurven trotzdem abbremsen kann.
23. **Baukasten für Strecken** (`src/tracks/types.ts`, Logik in `src/game/elements.ts`):
    - **Untergründe:** Matsch, Sand, Eis (rutschig, die Bewegungsrichtung folgt verzögert), seichtes Wasser, tiefes Wasser (Schwimmen, kein Sprung, mehr Energieverbrauch, optional mit Strömung), Lava und Löcher (Sturz, nach 1,5 s Wiedereinsetzen).
    - **Hürdenarten:** Hürde, Oxer, Steilwand (mit Lücke für den Hamster), Zaun, Baumstamm.
    - **Hindernisse:** Heuballen, Steine, Kakteen, Sandburgen, Schneebälle, Felsen, Baumstümpfe, glühende Felsen.
    - **Weitere Elemente:** Reifen (Schub), Schanzen, Dünen, Geysire (nur zeitweise aktiv), Tore (öffnen und schliessen), rollende Stämme, Windradflügel (knapp über dem Boden, überspringbar), Brücken (schaukelnd, über Wasser oder Schlucht), Lawinen (ab Runde 3), Wetter und Sandsturm (ab Runde 2).
24. **Abkürzungen:** Jede Strecke hat eine Abkürzung mit eigenem Weg abseits der Bahn.
    - **offen:** für alle Tiere.
    - **klein:** nur für den Hamster (Tunnel).
    - **sprung:** nur, wer über die Schanze bzw. den Geysir hoch genug springt.
    - **versteckt:** nicht auf der Minikarte; Tiras Knochenspur führt hin.

    Computergegner auf «Mittel» nehmen Abkürzungen in 50 % der Fälle, auf «Schwer» immer, auf «Leicht» nie. Zuerst durften auch Katzen durch die kleinen Abkürzungen; das machte sie zu stark und widerspricht dem Auftrag («für andere zu eng»).
25. **Bewegte Hindernisse fair:** Der Windradflügel fegt auf 0,7 m Höhe (überspringbar). Nach einem Treffer ist man 1,4 s geschützt. Wiedereingesetzt wird nie direkt vor Lava oder einem Loch (sonst kam man aus dem Stand nicht darüber).
26. **Schub-Haftung** ist neu ein fester Zuschlag für alle Tiere (+12 m/s² pro 100 % Schub) statt eines Faktors. Der Faktor bevorzugte die ohnehin wendigen Katzen.
27. **Balance** (`npm run sim -- 20`, alle 8 Strecken, Stufe «Mittel»): Alle Tiere liegen im Schnitt zwischen Platz 3,9 und 4,8. Dafür wurden Kurvenhaftung und Tempo leicht angepasst (Pferde etwas mehr Haftung, Hamster etwas mehr Tempo).
28. **Cup:** Gleiche Gegner in allen 4 Rennen. Punkte 15–12–10–8–6–4–2–1, Zwischenwertung nach jedem Rennen, Siegerehrung mit Podest, Pokal und Konfetti. Das beste Cup-Ergebnis wird gespeichert.
29. **Titelbild:** Im Hintergrund läuft ein Demo-Rennen auf einer zufälligen Strecke.
30. **Grafik ohne Bilddateien:** Alle Strecken, Wahrzeichen (Richterturm, Leuchtturm, Pyramiden, Chalet, Seilbahn, Tempel, Wasserfall, Vulkan …), Pflanzen und Tiere am Rand sind im Code erzeugt.
31. **Speicherversion v3:** Bestzeiten der bisherigen Strecken wurden zurückgesetzt, weil die Strecken geändert wurden.

### Nach Phase 3 (Wünsche)

32. **Hilfe & Tipps** im Hauptmenü: Spielregeln (inkl. Abkürzungsarten), Stärken und Eigenheiten aller Tiere mit Tipp zur Superkraft, Besonderheiten jeder Strecke (FAQ) mit Abkürzung. Der Streckentipp erscheint auch auf dem Ladebildschirm, der Tiertipp in der Tierwahl.
33. **Springen während Superkräften:** Bei der Mäusejagd zählt die eigene Sprungtaste immer; der Autopilot springt zusätzlich selbst über Spalten, Gräben und Stämme. Nicht springen kann man nur beim Schwimmen und beim Buddeln (Tira ist dann unter der Erde und unverwundbar).
34. **Rampen:** Tiere laufen sichtbar die Schanze/Düne hinauf und springen von oben ab (vorher liefen sie grafisch durch die Rampe).
35. **Steilwand-Tunnel** für alle Nicht-Pferde (Husky, Katzen, Hamster): Tira kam mit seinem Sprung nie über die Steilwand.

### Phase 4

36. **Verbindung:** WebRTC über PeerJS. Der öffentliche PeerJS-Server (0.peerjs.com) vermittelt nur den Verbindungsaufbau; die Spieldaten laufen direkt zwischen den Geräten. Die Peer-ID des Gastgebers ist `animalsrun-v1-` + Raumcode (4 Zeichen ohne verwechselbare Zeichen wie 0/O, 1/I). Ist ein Code schon vergeben, wird automatisch ein neuer gewählt. ICE-Server (STUN, später TURN) stehen in `src/config/net.ts`.
37. **Gastgeber rechnet verbindlich** (Positionen, Kollisionen, Items, Superkräfte, Computergegner). Mitspieler senden nur ihre Eingaben (60-mal pro Sekunde, als Bitfeld). Der Gastgeber schickt 20-mal pro Sekunde einen Schnappschuss des ganzen Rennzustands samt Ereignissen.
38. **Client-Vorhersage mit Korrektur:** Mitspieler rechnen das Rennen mit ihrer eigenen Eingabe sofort weiter. Bei jedem Schnappschuss wird der Zustand übernommen, die noch nicht bestätigten eigenen Eingaben werden nachgerechnet, kleine Abweichungen in der Darstellung sanft ausgeglichen. Test `npx tsx scripts/nettest.ts 60`: gleiches Ergebnis auf beiden Geräten, Korrekturen im Schnitt wenige Millimeter; auch bei 250 ms Verzögerung je Richtung gleiches Ergebnis.
39. **Mitspieler rechnen höchstens 0,75 s voraus.** Stockt der Gastgeber (z. B. Fenster im Hintergrund), warten sie, statt davonzulaufen. Darum muss das Fenster des Gastgebers sichtbar bleiben (Hinweis in der Lobby).
40. **Pause im Mehrspieler** hält das Rennen nicht an (es zeigt nur das Menü); «Neustart» gibt es dort nicht.
41. **Verbindungsabbruch:** Ein Computer übernimmt das Tier des Mitspielers. Wer im selben Browser-Tab mit demselben Code wieder beitritt, übernimmt sein Tier wieder (erkannt über ein Kennzeichen im Tab). Neue Mitspieler können während eines laufenden Rennens nicht beitreten. Verliert der Gastgeber die Verbindung, kommen alle mit einer Meldung ins Menü.
42. **Cup im Mehrspieler:** Der Gastgeber führt den Cup (Punkte, nächstes Rennen, Siegerehrung) und schickt die Wertung an alle. Nach dem Rennen kann der Gastgeber alle in die Lobby zurückholen.

### Nach Phase 4 (Wünsche)

43. **Gonzi und die Sprünge:** Die Sprungwerte liegen enger beieinander (Hamster 1,30 m statt 1,05 m, Husky 1,33 m, Katzen 1,40 m, Pferde unverändert 1,54 m). Das Zeitfenster für einen fehlerfreien Sprung über den Oxer wächst für Gonzi von 0,13 s auf 0,37 s (`npx tsx scripts/jumpwindow.ts`).
44. **Sprunghilfe für alle:** Wer bis 0,15 s vor der Landung springt, springt bei der Landung sofort wieder. Stangen, die man um höchstens 10 cm streift, zählen nicht als Fehler.
45. **Strecken-Info vor dem Start** bleibt stehen, bis man «Los geht’s!» tippt; im Hintergrund ist die Startaufstellung zu sehen. Im Mehrspieler tippt jede Person «Ich bin bereit»; der Gastgeber startet, sobald alle bereit sind (spätestens nach 60 s). Die Mitspieler rechnen erst los, wenn der Gastgeber gestartet hat.
46. **Weniger «Ausgebremst»** (für alle Tiere gleich), gemessen mit `npx tsx scripts/stuns.ts`: von 2,5 auf 1,7 Mal pro Tier und Rennen. Massnahmen: 2 statt 3 normale Icon-Punkte pro Runde (weniger Superkräfte insgesamt), Aufholhilfe 3-mal statt 4-mal so viele Icons auf Platz 8, 6 Sekunden Schutz nach einem Treffer, Computergegner zünden Stopp-Kräfte nur, wenn mehrere Tiere in Reichweite sind. Die Dauer und Reichweite der Kräfte blieben wie im Auftrag.

### Phase 5

47. **Ton ohne Dateien:** Musik, Tierstimmen und Effekte werden im Browser mit Web Audio erzeugt (Oszillatoren und gefiltertes Rauschen). Keine Lizenzfragen, kein Download. Jede Strecke hat eine eigene Melodie (Tonart, Tempo, Akkordfolge, Instrument), dazu Menü- und Siegerehrungsmusik; in der letzten Runde wird die Musik lebhafter.
48. **Tierstimmen:** Wiehern, Miauen, Bellen und beim Jubeln Heulen (Husky), Fiepen (Hamster) – beim Start (eigenes Tier), bei jeder Superkraft und im Ziel. Jede Superkraft hat zusätzlich einen eigenen Klang.
49. **Räumlicher Ton:** Geräusche anderer Tiere werden leiser, je weiter weg sie sind, und kommen von links/rechts. Schritte und Hufe klingen je nach Untergrund (Weg, Sand, Matsch, Eis, Wasser) – laut nur für das eigene Tier.
50. **Optionen:** Lautstärke Musik, Lautstärke Effekte, Stumm. Ton startet erst nach der ersten Berührung bzw. dem ersten Tastendruck.
51. **Leistung:** Die Auflösung passt sich im Rennen automatisch an (sinkt bis 60 %, wenn es unter 45 fps fällt, steigt wieder bei über 57 fps). Auf «mittel» werfen nur das eigene Tier und die Hindernisse echte Schatten. Das ganze Spiel ist ca. 0,9 MB gross (komprimiert 0,25 MB).
52. **Letzte Balance-Runde:** Furiels Schub nach der Sprung-Attacke hält 2,5 s (statt 1,5 s), Rays Äpfel treffen etwas breiter. Alle Tiere liegen im Schnitt innerhalb von 1,3 Plätzen (`npm run sim -- 20`, alle Strecken, Stufe «Mittel»).
53. **Veröffentlichung:** GitHub Pages mit automatischer Veröffentlichung bei jedem Push (`.github/workflows/deploy.yml`) oder Netlify (`netlify.toml`). Pfade sind relativ (`base: './'`), damit das Spiel auch in einem Unterordner läuft.

### Nach der Veröffentlichung

54. **Lianen (Dschungel):** Vor den drei Matschfeldern hängen Lianen an einem Ast quer über der Bahn. Wer hineinspringt (ab 0,4 m Höhe), schwingt mit Schub (×1,25 für 1,2 s) hoch über den Matsch. Für alle Tiere gleich; die Computergegner nutzen sie ab Stufe «Mittel».
55. **Wellen (Sandstrand):** An zwei Stellen rollen in Abständen (6,5 s bzw. 7 s) Wellen vom Meer (rechts) quer über die Bahn. Man sieht und hört sie heranrollen. Wer am Boden getroffen wird, wird 2,4 m zur Seite gespült und gebremst (72 % Tempo), aber nicht gestoppt. Drüberspringen schützt.
56. **Intro:** Nach dem ersten Tippen auf das Titelbild läuft ein Intro (ca. 15 s): Trommelwirbel, und das ganze Rudel stürmt an der Kamera vorbei (Fanfare). Danach fährt die Kamera die Reihe ab und stellt jedes Tier mit Name, Tierart und Superkraft vor (jedes Tier ruft), zum Schluss springt das Logo mit Beckenschlag herein. Man kann es jederzeit überspringen (Taste, Tippen oder «Überspringen»); in den Optionen lässt es sich ausschalten («Intro beim Start»). Das Intro startet erst nach dem ersten Tippen, weil der Browser vorher keinen Ton erlaubt.
57. **Item-Kisten zeigen ihr Item** (⚡ 🐌 🛡️ 💩, in passender Farbe), damit man das gewünschte gezielt anlaufen kann. Jede Reihe zeigt zu Beginn alle vier Items; eine eingesammelte Kiste erscheint nach 3 s mit einem Item wieder, das in der Reihe gerade fehlt. Die im Laub versteckten Kisten bleiben eine Überraschung und werden wie bisher je nach Platz ausgelost (hinten eher hilfreich). Computergegner laufen je nach Platz das passende Item an. Mehrspieler-Protokoll Version 3 (die Kisten-Items werden mitgeschickt).
