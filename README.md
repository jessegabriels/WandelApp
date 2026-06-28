# WandelApp — prototype

Een offline-first webapp (PWA) waarmee je en je vrienden wandelroutes kunnen vastleggen, er foto's aan toevoegen, een review en score geven, en op het einde van het jaar een ranking maken.

Gebouwd als **Progressive Web App**: één codebase die zowel op Android (Chrome) als iPhone (Safari) draait, installeerbaar op het beginscherm, en zonder app store te distribueren — precies wat past bij een besloten vriendengroep.

## Wat zit erin

- **Kaart** met al je wandelingen (route + fotomarkers), op OpenStreetMap.
- **Opnemen**: volgt je route live via GPS, toont afstand, tijd en aantal punten.
- **Foto's toevoegen** tijdens of na de wandeling. Het **originele bestand wordt bewaard, zonder hercompressie** → geen kwaliteitsverlies. Er wordt alleen een kleine thumbnail apart gemaakt voor de lijstweergave. Bevat een foto GPS-data (EXIF), dan wordt die als locatie gebruikt; anders je huidige positie.
- **Review + score** (1–5 sterren) per wandeling.
- **Ranking** per jaar, gesorteerd op score (🥇🥈🥉).
- **Offline**: de app en bekeken kaartgebieden blijven werken zonder verbinding. Alle data staat lokaal in de browser (IndexedDB).

## Lokaal testen

GPS, service worker en "installeren" vereisen HTTPS of `localhost`. Open dus niet rechtstreeks via `file://`, maar start een lokale server:

```bash
cd WandelApp
python3 -m http.server 8000
# open http://localhost:8000 in je browser
```

## Op de telefoon zetten

De app moet via **HTTPS** bereikbaar zijn. Gratis opties: Netlify, Vercel, Cloudflare Pages of GitHub Pages — sleep de map erin en je krijgt een URL. Deel die URL met je vrienden.

- **Android (Chrome):** open de URL → menu → "App installeren" / "Toevoegen aan startscherm".
- **iPhone (Safari):** open de URL → Deel-knop → "Zet op beginscherm".

Daarna start de app fullscreen, met eigen icoon, en werkt ze offline.

## Belangrijke beperkingen (eerlijk)

Dit is een werkend prototype, geen afgewerkt product. Een paar zaken om te weten:

1. **Delen werkt via de zelf-gehoste server** (map `server/`). Met accounts zien jullie elkaars wandelingen, pins en events op één gedeelde kaart. Zonder server draait de app nog steeds lokaal (alleen je eigen data). Zie `server/README.md` voor installatie en HTTPS-toegang.
2. **iOS GPS op de achtergrond.** Op iPhone stopt een webapp met GPS-volgen zodra het scherm uitgaat of je de app verlaat. Houd tijdens het opnemen je scherm aan. (Dit is een beperking van PWA's op iOS, niet van de code.)
3. **Offline kaarttegels.** Alleen gebieden die je *online* hebt bekeken, worden gecachet en zijn daarna offline beschikbaar. Een volledige regio vooraf downloaden zit nog niet in deze versie. Tip: bekijk je geplande route thuis even op de kaart vóór je vertrekt.
4. **Back-up.** Omdat alles lokaal in de browser staat, gaat data verloren als je de browserdata wist of de app verwijdert. Een export/backup-functie is een logische volgende toevoeging.

## Mogelijke volgende stappen

- **Delen tussen vrienden**: ✅ gebouwd via de zelf-gehoste backend in `server/` (accounts, gedeelde wandelingen/pins, events met RSVP, hybride foto's). Nog te doen: in de browser uittesten en bijschaven.
- **Offline regio downloaden**: een functie om een kaartgebied vooraf op te slaan.
- **Foto-backup / export** naar een bestand of cloud.
- **Eventueel een native app** (bijv. met Capacitor, hergebruikt deze code) als je achtergrond-GPS op iOS écht nodig hebt.

## Bestanden

| Bestand | Functie |
|---|---|
| `index.html` | Structuur en schermen |
| `styles.css` | Vormgeving (mobiel-eerst) |
| `app.js` | Alle logica: opslag, kaart, GPS, foto's, reviews, ranking |
| `sw.js` | Service worker: offline-cache van app en kaarttegels |
| `manifest.json` | App-metadata voor installatie |
| `icons/` | App-iconen |

## Technische noot

Leaflet (de kaartbibliotheek) wordt van een CDN (`unpkg.com`) geladen en door de service worker gecachet voor offline gebruik. Bij de allereerste keer openen is dus internet nodig; daarna werkt de app offline. Wie volledige onafhankelijkheid van het CDN wil, kan `leaflet.js` en `leaflet.css` lokaal in de map plaatsen en de verwijzingen in `index.html` aanpassen.
