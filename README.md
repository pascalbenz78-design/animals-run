# 🐾 Animals Run

Ein Tier-Rennspiel im Browser: Pferde, Katzen, ein Husky und ein Hamster laufen auf Parcours mit Hindernissen um die Wette. Läuft am PC und am Handy, ohne Installation, ohne Werbung, ohne Anmeldung.

> **Stand:** Phase 5 von 5 – fertig: Ton und Musik, Mehrspieler bis 4 Personen, 8 Strecken, 2 Cups mit Siegerehrung, alle 10 Tiere mit Superkräften, Items, 7 Computergegner. Details in `CLAUDE.md`.

## Steuerung

| Funktion | PC | Handy (Querformat) |
|---|---|---|
| Vorwärts laufen | automatisch (Auto-Lauf) oder Pfeil hoch / W | automatisch (Auto-Lauf) oder Taste «Lauf» |
| Bremsen (mit Auto-Lauf) | Pfeil runter oder S | Taste «Bremse» rechts unten |
| Lenken | Pfeiltasten oder A / D | Tasten ◀ ▶ links unten |
| Springen | Leertaste | Taste «Sprung» |
| Superkraft | E oder Shift | Taste «Superkraft» (leuchtet, wenn bereit) |
| Pause | Esc | Pause-Symbol oben rechts |

Tipp: Lässt du «Vorwärts» los, läuft dein Tier aus. Pferde sind schnell, müssen aber in engen Kurven kurz bremsen. Katzen sind wendiger. Hol dir die Blitze ⚡, sonst geht dir die Energie aus! Sammle 3 Icons deines Tiers, dann ist die Superkraft geladen. Die Pfoten-Kisten geben ein Item, das sofort wirkt.
**Auto-Lauf** ist eingeschaltet: Dein Tier läuft von selbst, du lenkst nur und bremst vor engen Kurven. In den Optionen lässt er sich ausschalten.

**Spielmodi:** Einzelrennen auf einer der 8 Strecken (Bauernhof, Reitturnier, Sandstrand, Herbstwald, Wüste, Alpen, Dschungel, Vulkaninsel) oder Cup über 4 Strecken mit Punkten und Siegerehrung. Jede Strecke hat eine Abkürzung – manche nur für den Hamster, manche nur mit hohem Sprung, eine ist sogar versteckt.

---

## Zum Ausprobieren auf dem eigenen PC

Du brauchst einmalig **Node.js** (Version 20 oder neuer): https://nodejs.org → «LTS» herunterladen und installieren.

1. Eingabeaufforderung oder Terminal im Ordner `AnimalsRun` öffnen.
2. Einmalig die Bausteine installieren:
   ```bash
   npm install
   ```
3. Spiel starten:
   ```bash
   npm run dev
   ```
4. Im Browser öffnen: **http://localhost:5173**

### Auf dem Handy testen (im selben WLAN)

`npm run dev` zeigt neben «Local» auch eine Zeile **«Network»**, z. B. `http://192.168.1.23:5173`. Diese Adresse im Handy-Browser eingeben (Handy im selben WLAN wie der PC). Fragt Windows nach der Firewall, «Zugriff zulassen» für private Netzwerke wählen. Handy quer halten; oben rechts im Menü gibt es eine Vollbild-Taste.

---

## Als App auf den Startbildschirm legen

Spieladresse: https://pascalbenz78-design.github.io/animals-run/

- **Android (Chrome):** Seite öffnen → Menü ⋮ → «Zum Startbildschirm hinzufügen» bzw. «App installieren». Danach startet das Spiel mit dem Pfoten-Symbol im Vollbild und im Querformat.
- **iPhone/iPad (Safari):** Seite öffnen → Teilen-Symbol → «Zum Home-Bildschirm». Das Spiel öffnet dann ohne Browserleiste.

## Veröffentlichen (damit es über eine Internetadresse spielbar ist)

Das Spiel ist eine reine statische Website. Zuerst wird sie «gebaut»:

```bash
npm run build
```

Danach liegt die fertige Website im Ordner **`dist`**.

### Variante A: GitHub Pages (empfohlen – aktualisiert sich automatisch)

1. Auf https://github.com ein Repository anlegen (z. B. `animals-run`). Für kostenlose Konten muss es **öffentlich** sein.
2. Das Projekt hochladen:
   ```bash
   git remote add origin https://github.com/DEIN-NAME/animals-run.git
   git push -u origin main
   ```
3. Auf GitHub im Repository: **Settings → Pages → Source: «GitHub Actions»** wählen.
4. Unter **Actions** läuft «Auf GitHub Pages veröffentlichen» (1–2 Minuten). Danach ist das Spiel unter `https://DEIN-NAME.github.io/animals-run/` erreichbar.
5. Für ein Update genügt `git push` – die Seite wird automatisch neu gebaut.

### Variante B: Netlify (ohne GitHub)

1. Auf https://app.netlify.com ein kostenloses Konto erstellen.
2. «Add new site» → «Deploy manually» wählen.
3. Den Ordner `dist` per Maus in das Fenster ziehen.
4. Fertig – Netlify zeigt die Adresse (z. B. `https://animals-run-123.netlify.app`). Unter «Site settings» lässt sich der Name ändern.

Für ein Update: `npm run build` und den neuen `dist`-Ordner wieder hineinziehen.

### Variante C: GitHub Pages ohne Actions (von Hand)

1. Auf https://github.com ein Konto erstellen und ein neues Repository anlegen (z. B. `animals-run`).
2. Das Projekt hochladen:
   ```bash
   git remote add origin https://github.com/DEIN-NAME/animals-run.git
   git push -u origin main
   ```
3. Den Build-Ordner auf einen eigenen Zweig `gh-pages` veröffentlichen:
   ```bash
   npm run build
   npx gh-pages -d dist
   ```
4. Auf GitHub im Repository: **Settings → Pages → Branch: `gh-pages`** auswählen und speichern.
5. Nach ein bis zwei Minuten ist das Spiel unter `https://DEIN-NAME.github.io/animals-run/` erreichbar.


### Mehrspieler (bis 4 Personen)

1. Eine Person wählt **Mehrspieler → Rennen erstellen** und erhält einen **4-stelligen Raumcode**.
2. Die anderen wählen **Mehrspieler**, geben den Code ein und tippen **Beitreten**.
3. In der Lobby wählt jede Person ihr Tier (jedes Tier nur einmal) und tippt **Ich bin bereit**. Der Gastgeber wählt Einzelrennen oder Cup, Strecke und Stärke der Computergegner und startet mit **Los geht’s!**

Gut zu wissen:
- Die Geräte verbinden sich direkt (WebRTC). Ein öffentlicher Vermittlungsserver (PeerJS) hilft nur beim Verbinden – dafür braucht es Internet.
- **Im Heim-WLAN klappt es zuverlässig.** Manche Mobilfunknetze blockieren direkte Verbindungen; dafür kann später ein sogenannter TURN-Server ergänzt werden (`src/config/net.ts`).
- Das Fenster des Gastgebers muss sichtbar bleiben, sonst steht das Rennen für alle still.
- Bricht eine Verbindung ab, übernimmt ein Computer. Mit demselben Code (im selben Browser-Tab) kann man wieder einsteigen.
- **Zum Ausprobieren an einem PC:** zwei Browserfenster nebeneinander öffnen, in einem das Rennen erstellen, im anderen beitreten.

---

## Für Entwickler

- `npm run build` – Typprüfung und Build
- `npm run sim` – kopfloser Renn-Test (Renndauer, Energie, Balance)
- Alle Spielwerte: `src/config/balance.ts` · Alle Texte: `src/config/texts.ts`
- Testhilfen im Browser: `?fps`, `?test`, `?timescale=5`

Lizenzen und Herkunft: siehe `CREDITS.md`.
