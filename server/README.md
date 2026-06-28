# WandelApp — zelf-gehoste backend

Een lichte server (Node.js + Express) die je op je eigen Windows-thuisserver draait. Hij regelt accounts, gedeelde wandelingen, foto-thumbnails, gepinde locaties en events met RSVP. Er is geen externe dienst of database-installatie nodig: de data staat in één JSON-bestand en de foto-thumbnails als bestanden op schijf.

## Wat de server doet

- **Accounts** met gebruikersnaam + wachtwoord (wachtwoorden gehasht met bcrypt, sessies via JWT).
- **Wandelingen** gedeeld binnen de groep: iedereen die een account heeft, ziet elkaars wandelingen.
- **Reviews + score per persoon**; de ranking gebruikt het gemiddelde.
- **Foto's hybride**: een kleine versie (thumbnail) wordt geüpload en gedeeld; het origineel blijft op het toestel van de maker (geen kwaliteitsverlies, minder opslag op de server).
- **Gepinde locaties** met foto's.
- **Events**: iemand plant een wandeling met datum/tijd; anderen reageren met *ga mee / misschien / niet*.

## Vereisten

- Node.js LTS (versie 18 of 20 aanbevolen) op de Windows-server. Download via https://nodejs.org. Controleer met `node -v`.

## Installeren en starten

Open PowerShell in de map `server`:

```powershell
cd C:\Users\PC-Jesse\Claude\Projects\WandelApp\server
npm install
npm start
```

De server draait nu op `http://localhost:3000` en serveert zowel de API als de app zelf (de bestanden uit de bovenliggende map). Test in een browser: `http://localhost:3000`.

Wil je een andere poort of een vast JWT-geheim:

```powershell
$env:PORT=8080; $env:JWT_SECRET="een-lang-willekeurig-geheim"; npm start
```

## Waar staat de data

- `server/data/db.json` — alle accounts, wandelingen, reviews, pins, events en RSVP's.
- `server/uploads/` — de foto-thumbnails.
- `server/data/jwt-secret` — automatisch gegenereerd geheim voor de sessies.

**Back-up** = simpelweg de mappen `data/` en `uploads/` kopiëren. Wis je die, dan zijn de accounts en gedeelde data weg (de originele foto's op de toestellen blijven uiteraard staan).

## Toegang van buitenaf — HTTPS is verplicht

Dit is het belangrijkste punt. Een PWA met GPS en offline-werking werkt alleen via een **beveiligde verbinding (HTTPS)** of via `localhost`. Je vrienden benaderen de server tijdens een wandeling van buitenaf, dus een gewoon `http://`-adres met je IP volstaat niet: de browser blokkeert dan de locatiebepaling en de offline-functie.

Drie manieren om dit veilig op te lossen, van eenvoudig naar meer werk:

### Optie A — Cloudflare Tunnel (aanbevolen)

Gratis, geen poorten openzetten in je router, en je krijgt automatisch een HTTPS-adres dat naar je thuisserver wijst.

1. Maak een gratis Cloudflare-account en (optioneel) koppel een domeinnaam.
2. Installeer `cloudflared` op de Windows-server (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
3. Start een tunnel naar je lokale server:
   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```
   Je krijgt een `https://...trycloudflare.com`-adres (voor een vast adres koppel je een tunnel aan je domein).
4. Deel dat HTTPS-adres met je vrienden.

### Optie B — Tailscale (privé, geen publieke blootstelling)

Goede keuze voor een besloten vriendengroep. Iedereen installeert Tailscale; jullie zitten dan in één privénetwerk. Met *Tailscale Serve / HTTPS* (MagicDNS-certificaat) krijg je een geldig HTTPS-adres zonder dat de server publiek op internet staat. Zie https://tailscale.com.

### Optie C — Eigen domein + reverse proxy (Caddy)

Heb je een domeinnaam en wil je poorten openzetten (poort 443): zet [Caddy](https://caddyserver.com) ervoor. Caddy regelt automatisch een gratis Let's Encrypt-certificaat. Voorbeeld-`Caddyfile`:

```
wandelapp.jouwdomein.be {
    reverse_proxy localhost:3000
}
```

## De server laten doordraaien

Sluit je PowerShell, dan stopt de server. Om hem permanent te laten draaien op Windows kun je `pm2` gebruiken:

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start server.js --name wandelapp
pm2 save
pm2-startup install
```

## Veiligheid — belangrijk

- **Registratie is afgeschermd met een uitnodigingscode.** Alleen wie de code kent, kan een account aanmaken. De server toont de code bij het opstarten in de console; je kunt ook een eigen code kiezen via de omgevingsvariabele `INVITE_CODE`. Deel die code enkel met je vrienden.
- Gebruik bij voorkeur een eigen, vast `JWT_SECRET` en `INVITE_CODE` (zie hierboven).

## API in het kort

Alle endpoints onder `/api`, met `Authorization: Bearer <token>` na het inloggen.

| Methode | Pad | Functie |
|---|---|---|
| POST | `/api/register`, `/api/login` | account maken / inloggen |
| GET | `/api/me`, `/api/users` | eigen profiel / groepsleden |
| GET/POST | `/api/walks` | wandelingen ophalen / aanmaken |
| GET/DELETE | `/api/walks/:id` | detail / verwijderen (eigenaar) |
| PUT | `/api/walks/:id/review` | review + score (per persoon) |
| GET/POST | `/api/pins` | pins ophalen / aanmaken |
| POST | `/api/photos` | thumbnail uploaden (multipart) |
| GET/POST | `/api/events` | events ophalen / aanmaken |
| POST | `/api/events/:id/rsvp` | reageren (going/maybe/declined) |

## Hoe het samenwerkt met de app

De server serveert de app zelf. Open dus `http://localhost:3000` (of je HTTPS-adres) en je krijgt het inlogscherm. Na registratie (met de uitnodigingscode) of inloggen:

- Je opgenomen wandelingen, pins, foto-thumbnails en reviews worden naar de server gesynchroniseerd zodra je verbinding hebt. De originele foto's blijven op je toestel (hybride).
- De kaart, lijst en ranking tonen de wandelingen van de hele groep. Offline val je terug op je eigen lokaal opgeslagen data, en de sync loopt automatisch verder zodra je weer online bent.
- Het Events-tabblad werkt rechtstreeks met de server (plannen + RSVP).

## Verificatie

De backend is end-to-end getest (registratie met/zonder geldige code, inloggen, wandelingen, foto-upload, pins, events met RSVP, en cascade-verwijdering). De frontend-onderdelen (inlogscherm, events, synchronisatie) zijn syntactisch geverifieerd maar moeten nog in de browser uitgetest worden.
