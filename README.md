# 🐾 Animals Run

Ein Tier-Rennspiel im Browser: Pferde, Katzen, ein Husky und ein Hamster laufen auf Parcours mit Hindernissen um die Wette. Läuft am PC und am Handy, ohne Installation, ohne Werbung, ohne Anmeldung.

> **Stand:** Phase 2 von 5 – Strecke «Bauernhof», alle 10 Tiere mit Superkräften, Items, 7 Computergegner. Details in `CLAUDE.md`.

## Steuerung

| Funktion | PC | Handy (Querformat) |
|---|---|---|
| Vorwärts laufen | Pfeil hoch oder W | Taste «Lauf» rechts unten |
| Lenken | Pfeiltasten oder A / D | Tasten ◀ ▶ links unten |
| Springen | Leertaste | Taste «Sprung» |
| Superkraft | E oder Shift | Taste «Superkraft» (leuchtet, wenn bereit) |
| Pause | Esc | Pause-Symbol oben rechts |

Tipp: Lässt du «Vorwärts» los, läuft dein Tier aus. Pferde sind schnell, müssen aber in engen Kurven kurz bremsen. Katzen sind wendiger. Hol dir die Blitze ⚡, sonst geht dir die Energie aus! Sammle 3 Icons deines Tiers, dann ist die Superkraft geladen. Die Pfoten-Kisten geben ein Item, das sofort wirkt.
Mit der Option **Auto-Lauf** läuft dein Tier von selbst, du lenkst nur.

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

## Veröffentlichen (damit es über eine Internetadresse spielbar ist)

Das Spiel ist eine reine statische Website. Zuerst wird sie «gebaut»:

```bash
npm run build
```

Danach liegt die fertige Website im Ordner **`dist`**.

### Variante A: Netlify (am einfachsten)

1. Auf https://app.netlify.com ein kostenloses Konto erstellen.
2. «Add new site» → «Deploy manually» wählen.
3. Den Ordner `dist` per Maus in das Fenster ziehen.
4. Fertig – Netlify zeigt die Adresse (z. B. `https://animals-run-123.netlify.app`). Unter «Site settings» lässt sich der Name ändern.

Für ein Update: `npm run build` und den neuen `dist`-Ordner wieder hineinziehen.

### Variante B: GitHub Pages

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

(In Phase 5 wird dafür noch eine automatische Veröffentlichung eingerichtet.)

### Hinweis zum Mehrspieler (ab Phase 4)

Mehrspieler verbindet die Geräte direkt miteinander (WebRTC). Im Heim-WLAN klappt das zuverlässig. Manche Mobilfunknetze blockieren direkte Verbindungen; dafür lässt sich später ein sogenannter TURN-Server ergänzen.

---

## Für Entwickler

- `npm run build` – Typprüfung und Build
- `npm run sim` – kopfloser Renn-Test (Renndauer, Energie, Balance)
- Alle Spielwerte: `src/config/balance.ts` · Alle Texte: `src/config/texts.ts`
- Testhilfen im Browser: `?fps`, `?test`, `?timescale=5`

Lizenzen und Herkunft: siehe `CREDITS.md`.
