# HikeLog

HikeLog is een app waarmee jij en je vrienden wandelingen vastleggen, er foto's en video's aan toevoegen, routes plannen en opnemen, events organiseren met aanwezigheid (RSVP), en wandelingen beoordelen met een score — met op het einde een jaarranking van de mooiste wandelingen.

De app bestaat uit twee delen:

- **De app (frontend)** — een Progressive Web App (PWA): één website die op Android én iPhone werkt, installeerbaar op je beginscherm, en die offline blijft werken. Geschreven in gewone HTML/CSS/JavaScript met de kaartbibliotheek Leaflet (OpenStreetMap).
- **De server (backend)** — een lichte Node.js-server die je zelf host (bijvoorbeeld op een thuis-pc). Die regelt accounts, deelt data tussen vrienden, en bewaart de foto's/video's. De server serveert ook de app zelf.

---

## Inhoud

1. [Snel starten](#snel-starten)
2. [Kernbegrippen](#kernbegrippen)
3. [Inloggen en accounts](#inloggen-en-accounts)
4. [De vijf tabbladen, knop voor knop](#de-vijf-tabbladen-knop-voor-knop)
5. [De mediaviewer](#de-mediaviewer)
6. [Het profielscherm](#het-profielscherm)
7. [Foto's en video's: kwaliteit en opslag](#fotos-en-videos-kwaliteit-en-opslag)
8. [Routes: tekenen, importeren, exporteren, opnemen](#routes-tekenen-importeren-exporteren-opnemen)
9. [Offline werken en synchronisatie](#offline-werken-en-synchronisatie)
10. [De server: installeren, draaien, beheren](#de-server-installeren-draaien-beheren)
11. [Toegang van buitenaf en HTTPS](#toegang-van-buitenaf-en-https)
12. [Bestanden en mappen](#bestanden-en-mappen)
13. [API-overzicht](#api-overzicht)
14. [Beperkingen](#beperkingen)

---

## Snel starten

1. Installeer [Node.js](https://nodejs.org) (versie 18, 20 of nieuwer).
2. Open een terminal in de map `server` en draai eenmalig `npm install`, daarna `node server.js`.
3. De console toont het adres (`http://localhost:3000`) en een **uitnodigingscode**.
4. Open `http://localhost:3000` in je browser, registreer met die code, en je bent binnen.
5. (Optioneel) Laad testdata met `node seed.js` in een tweede terminal.

Details staan verderop in [De server](#de-server-installeren-draaien-beheren).

---

## Kernbegrippen

HikeLog draait rond twee soorten items, die allebei in de ranking kunnen komen:

- **Wandeling** — een losse, opgenomen of geïmporteerde route. Hoort bij één persoon (de maker). Iedereen in de groep mag een wandeling een score en review geven.
- **Event** — een geplande groepswandeling met een datum/tijd, waarvoor mensen aangeven of ze meegaan (RSVP). De organisator kan een route vooraf tekenen of achteraf live opnemen, en sluit het event af zodra het is uitgevoerd. **Alleen wie meeging** (‘Ga mee’ koos) kan een afgehandeld event scoren.

**Groepsmodel.** Iedereen die een account aanmaakt met de uitnodigingscode zit in dezelfde groep en ziet elkaars wandelingen, pins en events.

**Score en ranking.** Een score gaat van 1 tot 5 sterren. De ranking gebruikt de **gemiddelde** score (over alle reviewers) en toont wandelingen én afgehandelde events door elkaar.

**Kleur per persoon.** Elke gebruiker heeft een eigen kleur (automatisch toegekend, zelf aanpasbaar in het profiel). Je gepinde locaties krijgen jouw kleur, zodat de groep ziet wie wat plaatste.

---

## Inloggen en accounts

Bij het openen van de app verschijnt het **inlogscherm** zolang je niet bent aangemeld. Na één keer inloggen blijf je ingelogd (ook offline), tot je afmeldt.

Het scherm heeft twee tabbladen:

- **Inloggen** — velden *Gebruikersnaam* en *Wachtwoord*, knop **Inloggen**.
- **Registreren** — velden *Gebruikersnaam*, *Weergavenaam* (de naam die je vrienden zien), *Wachtwoord* (minstens 6 tekens) en *Uitnodigingscode*, knop **Account aanmaken**.

De **uitnodigingscode** schermt registratie af: alleen wie de code kent, kan een account maken. Hij staat in de serverconsole bij het opstarten, of je stelt er zelf één in (zie [De server](#de-server-installeren-draaien-beheren)). De code is alleen nodig om te registreren, niet om in te loggen.

**Wachtwoord vergeten?** De serverbeheerder kan het resetten met `node reset-password.js` (zie verderop).

In de **bovenbalk** zie je rechts:

- je **weergavenaam** — klik erop om je [profiel](#het-profielscherm) te openen;
- een klein **bolletje** dat je verbinding toont (groen = online, rood = offline; offline wordt je data lokaal bewaard);
- de knop **Afmelden**.

---

## De vijf tabbladen, knop voor knop

Onderaan (op een telefoon) of links (op een breed scherm) staat de navigatie met vijf tabbladen.

### 🗺️ Kaart

De hoofdkaart toont:

- je **huidige locatie** als een blauwe, pulserende stip die meebeweegt terwijl je wandelt;
- **gepinde locaties** als gekleurde druppels (in de kleur van wie ze plaatste) — klik erop om de plek met foto's te openen;
- **fotomarkers** (📷) van je eigen foto's met locatie — klik erop om de bijbehorende wandeling te openen.

De kaart toont **bewust geen afgelegde routes**: die zou de kaart vol maken. De route van een wandeling bekijk je in het detail van die wandeling.

Rechtsonder staat de knop **📍 (Locatie pinnen)**. Hoe het werkt:

1. Tik op de **📍-knop** — hij wordt rood (actief) en er verschijnt de melding "Tik op de kaart om een locatie te pinnen".
2. Tik op de plek op de kaart die je wil pinnen.
3. Geef de plek een naam.
4. De pin wordt opgeslagen en het detailscherm opent, waar je er foto's/video's aan kunt toevoegen.

### ⏺️ Opnemen

Hier neem je een wandeling live op met GPS.

- Bovenaan zie je drie tellers: **afstand (km)**, **tijd** en het aantal opgenomen **punten**.
- Een statusregel toont de GPS-nauwkeurigheid; bij een geplande route toont hij "Nog ~X km tot het einde".
- **▶ Start** — begint de opname. De kaart opent en je route wordt live getekend (rood).
- **■ Stop & opslaan** — stopt de opname. Je geeft de wandeling een naam; ze wordt opgeslagen en het detail opent zodat je meteen kunt beoordelen.
- **📷 Foto toevoegen** — voegt tijdens (of na) de wandeling foto's **of video's** toe. Deze worden aan de wandeling gekoppeld; toegevoegde items verschijnen als miniaturen onder de knoppen.

Houd tijdens het opnemen je scherm aan voor een vloeiende route (zie [Beperkingen](#beperkingen)).

### 📋 Lijst

Toont al je wandelingen als kaartjes met omslagfoto, naam, datum, afstand, aantal foto's, de maker en (indien beoordeeld) de gemiddelde score.

- **📥 GPX importeren** — kies een `.gpx`-bestand (bv. gedownload van Komoot, RouteYou of Wandelknooppunten). De route wordt als nieuwe wandeling toegevoegd.
- Klik op een kaartje om de **wandeling-detailweergave** te openen (zie hieronder).

#### Wandeling-detail

- Titel en gegevens: datum, afstand, duur, de maker.
- Een **mini-kaart** met de route en fotomarkers.
- Een **galerij** van foto's/video's (video's hebben een ▶-markering). Klik op een item om de [mediaviewer](#de-mediaviewer) te openen.
- **Jouw score** — klik op de sterren (1–5) om te scoren.
- **Review** — een tekstveld voor je beoordeling. Onder *Reviews van de groep* zie je ieders score en tekst.
- **📅 Plan event met deze route** — opent het event-aanmaakscherm met deze route al ingevuld (zie [Routes](#routes-tekenen-importeren-exporteren-opnemen)).
- **⬇ GPX** — exporteert de route als `.gpx`-bestand om te bewaren of te delen.
- **Review opslaan** — bewaart je score en review.
- **Verwijderen** — verwijdert de wandeling (alleen de eigenaar ziet deze knop).

### 📅 Events

Toont alle geplande en afgehandelde events als kaartjes met een statuslabel (**Gepland** of **Afgehandeld**, met gemiddelde score), datum, organisator, aantal deelnemers dat meegaat, afstand, en jouw eigen RSVP.

- **➕ Nieuw event plannen** — opent het aanmaakscherm.
- Klik op een kaartje voor de **event-detailweergave**.

#### Event aanmaken

- *Titel* en *Wanneer* (datum + tijd) zijn verplicht; *Omschrijving* is optioneel.
- **Route uitstippelen** — tik punten op de kaartje om de route te tekenen. De lengte wordt live berekend. Knoppen: **↶ Ongedaan** (laatste punt weg), **✕ Wissen** (alles weg), **🧭 Volg paden** (laat de lijn echte wandelpaden volgen — vereist een routerings-API-sleutel, in te stellen in je profiel).
- **Plannen** — slaat het event op. Je gaat zelf automatisch mee.

#### Event-detail

Bovenaan staan de titel met statuslabel, de datum, organisator, afstand en (indien afgehandeld) de gemiddelde score, plus de omschrijving en — als er een route is — een mini-kaart.

Knoppen, afhankelijk van de situatie:

- **▶ Start wandeling met deze route** — verschijnt bij een gepland event met route. Laadt de route en brengt je naar het opnamescherm om ze live te volgen.
- **📍 Route nu opnemen (GPS)** — alleen voor de organisator als er nog geen route is. Start een GPS-opname; de afgelegde weg wordt de route van het event.
- **✓ Markeer als uitgevoerd** — alleen voor de organisator. Sluit het event af; daarna kunnen deelnemers scoren.
- **📅 Opnieuw plannen** / **⬇ GPX** — verschijnen bij een event met route: plan een nieuw event met dezelfde route, of exporteer de route als GPX.
- **Ga je mee?** met de knoppen **✅ Ga mee**, **🤔 Misschien**, **❌ Niet** — alleen zichtbaar zolang het event *niet* is afgehandeld. Daarna kun je je RSVP niet meer wijzigen.
- **Jouw score** (sterren) + **review** + **Review opslaan** — alleen zichtbaar bij een afgehandeld event én als je had aangeduid dat je meeging. Wie niet meeging, ziet de melding dat enkel deelnemers kunnen scoren.
- **Reviews van de groep** en **Wie gaan er?** — lijsten met respectievelijk de scores/reviews en de RSVP-status van elk groepslid.
- **Event verwijderen** — alleen de organisator.

### 🏆 Ranking

Toont de gecombineerde ranglijst van **afgehandelde events** (📅) en **losse wandelingen** (🥾), gesorteerd op gemiddelde score, met 🥇🥈🥉 voor de top drie. Met de **jaarkiezer** bovenaan bekijk je een bepaald jaar. Klik op een item om het bijbehorende detail te openen.

---

## De mediaviewer

Klik je in een galerij op een foto of video, dan opent de **viewer**: een schermvullende weergave *in de app* (geen nieuw tabblad).

- **Foto's** worden in volle kwaliteit getoond; tik op de foto om in/uit te zoomen.
- **Video's** spelen af met de gewone bediening (afspelen, pauzeren, volume, volledig scherm).
- **‹ ›** — bladeren naar de vorige/volgende media van die wandeling of pin (ook met de pijltjestoetsen).
- **⬇ Download** — bewaart het bestand op je toestel.
- **📤 Deel** — deelt het bestand via de deelfunctie van je telefoon (WhatsApp, mail, …). Op een desktop die delen niet ondersteunt, wordt het automatisch een download.
- **✕** of een tik buiten de media (of de Esc-toets) sluit de viewer.

Is een video te groot om te delen (zie hieronder) en bekijk je ze op een ander toestel, dan toont de viewer het posterbeeld met de melding dat de video op het toestel van de maker staat.

---

## Het profielscherm

Open je via een klik op je naam in de bovenbalk.

- **Weergavenaam** — pas aan hoe je vrienden je zien.
- **Mijn kleur** — kies je eigen kleur (gebruikt voor je pins en routes). Knop **Profiel opslaan**.
- **Meldingen** — knop **Meldingen aanzetten / uitzetten**: ontvang een melding wanneer iemand een nieuw event plant. Zie de sectie [Meldingen](#meldingen-web-push).
- **Wachtwoord wijzigen** — velden *Huidig wachtwoord* en *Nieuw wachtwoord* (min. 6 tekens), knop **Wachtwoord wijzigen**.
- **Routes op wandelpaden (optioneel)** — plak hier een gratis API-sleutel van [OpenRouteService](https://openrouteservice.org) en klik **Sleutel bewaren**. Daarna laat de knop *🧭 Volg paden* (bij het tekenen van een route) de lijn echte wandelpaden volgen. Zonder sleutel teken je routes met rechte lijnen tussen je punten.

---

## Foto's en video's: kwaliteit en opslag

Bij elke foto/video bewaart de app:

- een kleine **thumbnail** (voorvertoning) voor de lijst en de kaartmarkers;
- het **volledige origineel** (foto in volle kwaliteit, of de videofile), dat naar de server gaat zodat iedereen het in de viewer in volle kwaliteit kan bekijken en downloaden.

Je eigen origineel blijft ook **lokaal op je toestel** staan, zodat je het offline in volle kwaliteit hebt.

**Grote video's.** Er geldt een instelbare maximumgrootte voor uploads (standaard **250 MB**). Een video binnen die grens wordt geüpload, gedeeld en vloeiend gestreamd. Een video die groter is, blijft **alleen op jouw toestel**; je vrienden zien dan wel het posterbeeld met een melding. Je past de grens aan met de omgevingsvariabele `MAX_UPLOAD_MB` (zie [De server](#de-server-installeren-draaien-beheren)) — handig voor dronebeelden in zeer hoge kwaliteit.

> Let op: volledige originelen en video's laten de schijfruimte op je server sneller oplopen en kosten mobiele data bij het bekijken.

---

## Routes: tekenen, importeren, exporteren, opnemen

Een route is een reeks GPS-punten. Je krijgt er op vier manieren een:

- **Live opnemen** — via het tabblad *Opnemen* (een wandeling), of via *Route nu opnemen* in een event (de organisator).
- **Tekenen** — bij het aanmaken van een event tik je punten op de kaart. Met een ORS-sleutel volgt de lijn echte wandelpaden (*Volg paden*).
- **Importeren** — *Lijst → 📥 GPX importeren* leest een `.gpx`-bestand in als nieuwe wandeling.
- **Hergebruiken** — *Plan event met deze route* (in een wandeling- of event-detail) maakt een nieuw event met dezelfde route.

**Exporteren en delen** doe je met de **⬇ GPX**-knop in een wandeling- of event-detail: je krijgt een `.gpx`-bestand dat je kunt bewaren of doorsturen, en dat in elke wandel-app te openen is.

---

## Offline werken en synchronisatie

HikeLog is **offline-eerst**: opnemen, foto's toevoegen en pinnen werkt zonder verbinding (alles wordt lokaal bewaard in de browser).

- **Pushen.** Zodra je weer online bent, stuurt de app je wandelingen, pins, reviews en media naar de server.
- **Lezen.** De gedeelde weergaves (kaart, lijst, ranking, events) halen de groepsdata live van de server. Ben je offline, dan val je terug op je eigen lokaal opgeslagen data.
- **Conflicten.** De aanpak is bewust eenvoudig gehouden: de client genereert de ID's en de laatste wijziging wint (last-write-wins).

---

## Meldingen (web push)

Wanneer iemand een nieuw event plant, krijgen de andere groepsleden een melding op hun toestel, ook als de app dicht is — zodat ze kunnen doorgeven of ze meegaan.

- **Aanzetten** doe je per gebruiker via *Profiel → Meldingen aanzetten*. De browser vraagt eenmalig toestemming.
- De melding gaat naar iedereen behalve de maker van het event. Tik je erop, dan opent meteen het betreffende event zodat je je RSVP kunt geven.
- Het is volledig **zelf-gehost** met VAPID-sleutels: de server genereert die bij de eerste start zelf (bewaard in `server/data/vapid.json`). Er is geen externe pushdienst-account nodig. Je kunt eigen sleutels meegeven via de omgevingsvariabelen `VAPID_PUBLIC` en `VAPID_PRIVATE`.

Voorwaarden: meldingen vereisen **HTTPS** (zie [Toegang van buitenaf](#toegang-van-buitenaf-en-https)). Op **Android** en desktop (Chrome, Edge, Firefox) werkt het in de browser; op de **iPhone** moet de app eerst op het beginscherm geïnstalleerd zijn en is iOS 16.4 of nieuwer vereist.

## De server: installeren, draaien, beheren

De server staat in de map `server`. Hij gebruikt SQLite voor de database (één bestand, geen aparte database-installatie) en bewaart de media als bestanden op schijf. Er is geen externe dienst nodig.

### Installeren en starten

```powershell
cd server
npm install      # eenmalig (gebruik npm.cmd install als PowerShell npm blokkeert)
node server.js   # of: npm start
```

Bij het opstarten toont de console het adres, de opslagmotor en de uitnodigingscode:

```
HikeLog-server draait op http://localhost:3000  (opslag: ...)
Uitnodigingscode voor registratie: ...
```

De server bedient ook de app zelf, dus open gewoon `http://localhost:3000`.

> **Opslagmotor.** De server gebruikt `better-sqlite3` als die installeert, en valt anders automatisch terug op het ingebouwde `node:sqlite` (Node 22.5+/24). Beide gebruiken hetzelfde databasebestand.

### Instellingen (omgevingsvariabelen, allemaal optioneel)

| Variabele | Standaard | Wat het doet |
|---|---|---|
| `PORT` | 3000 | Poort waarop de server luistert |
| `JWT_SECRET` | automatisch | Geheim voor de inlogsessies (wordt anders gegenereerd en bewaard) |
| `INVITE_CODE` | automatisch | Registratiecode (wordt anders gegenereerd en getoond) |
| `MAX_UPLOAD_MB` | 250 | Maximale uploadgrootte per bestand (foto/video) in MB |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | automatisch | Sleutels voor web push-meldingen (worden anders gegenereerd en bewaard) |
| `CLIENT_DIR` | bovenliggende map | Map met de frontend |

Voorbeeld (eigen code en grotere videolimiet):

```powershell
$env:INVITE_CODE="onzewandelclub"; $env:MAX_UPLOAD_MB=500; node server.js
```

### Beheerscripts

- **`node seed.js`** — vult de database met testdata: dummygebruikers (sven, lotte, tom — wachtwoord `wandel123`), enkele afgehandelde events met routes en scores, en losse wandelingen. Alle bestaande gebruikers worden als deelnemer ingesteld zodat je zelf kunt scoren. Herhaalbaar (oude testdata wordt vervangen).
- **`node reset-password.js`** — toont de lijst gebruikers; met `node reset-password.js <gebruiker> <nieuw-wachtwoord>` zet je een nieuw wachtwoord.

### Back-up en blijven draaien

- **Back-up** = de mappen `server/data` (database + geheimen) en `server/uploads` (media) kopiëren.
- Wil je dat de server na een herstart vanzelf opstart, gebruik dan bijvoorbeeld `pm2` (zie `server/README.md`).

---

## Toegang van buitenaf en HTTPS

Een PWA met GPS en offline-werking werkt alleen via een **beveiligde verbinding (HTTPS)** of via `localhost`. Voor toegang van buitenaf (je vrienden onderweg) volstaat een gewoon `http://`-adres met je IP dus niet. Drie aanbevolen oplossingen, van eenvoudig naar meer werk:

- **Cloudflare Tunnel** — gratis, geen poorten openzetten, geeft automatisch een HTTPS-adres naar je thuisserver.
- **Tailscale** — een privénetwerk tussen jullie toestellen, met geldig HTTPS, zonder de server publiek bloot te stellen.
- **Eigen domein + Caddy** — Caddy regelt automatisch een gratis Let's Encrypt-certificaat (vereist poort 443 en een domeinnaam).

De volledige stappen staan in `server/README.md`.

---

## Bestanden en mappen

**Frontend (projectroot):**

| Bestand | Functie |
|---|---|
| `index.html` | Structuur: alle schermen, het inlogscherm, de mediaviewer, scripts |
| `styles.css` | Volledige vormgeving (mobiel-eerst, plus zijbalk op breed scherm) |
| `app.js` | Kernlogica: kaart, GPS-opname, pins, wandelingdetail, ranking, GPX, opstart/inloggate |
| `api.js` | Verbinding met de server + het inlog-/registratiescherm en sessiebeheer |
| `sync.js` | Synchronisatie: pushen naar de server en lezen van groepsdata (met offline-fallback) |
| `events.js` | Het Events-tabblad: plannen, route tekenen, RSVP, afsluiten, scoren |
| `profile.js` | Het profielscherm (naam, kleur, wachtwoord, ORS-sleutel) |
| `viewer.js` | De in-app mediaviewer (foto/video, bladeren, download, delen) |
| `manifest.json` | App-metadata voor installatie als PWA |
| `sw.js` | Service worker: offline-cache van de app en de kaarttegels |
| `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png` | App-iconen |

**Backend (`server/`):**

| Bestand | Functie |
|---|---|
| `server.js` | De webserver en alle API-endpoints |
| `db.js` | Database-laag (SQLite) met schema en migraties |
| `seed.js` | Testdata laden |
| `reset-password.js` | Wachtwoord van een gebruiker resetten |
| `package.json` | Afhankelijkheden en startscript |
| `README.md` | Uitgebreide hosting-handleiding (HTTPS, back-up, …) |
| `data/` | Database, JWT-geheim, uitnodigingscode, push-sleutels (niet in versiebeheer) |
| `uploads/` | Opgeslagen thumbnails, foto's en video's (niet in versiebeheer) |

**Lokale opslag in de browser:** wandelingen, pins en media in IndexedDB; je sessietoken, profiel en ORS-sleutel in localStorage.

---

## API-overzicht

Alle endpoints zitten onder `/api`. Behalve registreren/inloggen vereist alles een ingelogde sessie (`Authorization: Bearer <token>`).

| Methode | Pad | Functie |
|---|---|---|
| POST | `/api/register` | Account aanmaken (met uitnodigingscode) |
| POST | `/api/login` | Inloggen |
| GET | `/api/me` | Eigen profiel |
| PUT | `/api/me` | Weergavenaam en kleur wijzigen |
| PUT | `/api/me/password` | Wachtwoord wijzigen |
| GET | `/api/users` | Groepsleden (met kleur) |
| GET | `/api/push/key` | Publieke VAPID-sleutel voor web push |
| POST | `/api/push/subscribe` / `/api/push/unsubscribe` | Meldingen aan-/afmelden |
| GET / POST | `/api/walks` | Wandelingen ophalen / aanmaken |
| GET / DELETE | `/api/walks/:id` | Detail / verwijderen (eigenaar) |
| PUT | `/api/walks/:id/review` | Score + review op een wandeling |
| GET / POST | `/api/pins` | Pins ophalen / aanmaken |
| GET / DELETE | `/api/pins/:id` | Detail / verwijderen (eigenaar) |
| POST | `/api/photos` | Foto/video uploaden (thumbnail + origineel) |
| GET / POST | `/api/events` | Events ophalen / aanmaken |
| GET / DELETE | `/api/events/:id` | Detail / verwijderen (organisator) |
| POST | `/api/events/:id/rsvp` | RSVP (ga mee / misschien / niet) |
| PUT | `/api/events/:id/complete` | Event als uitgevoerd markeren (organisator) |
| PUT | `/api/events/:id/route` | Route instellen (organisator) |
| PUT | `/api/events/:id/review` | Score + review op een afgehandeld event (deelnemers) |
| GET | `/api/health` | Status + maximale uploadgrootte |

---

## Beperkingen

- **GPS met scherm uit.** Een webapp kan met het scherm volledig uit niet betrouwbaar de GPS blijven volgen; bij het terugkeren ontstaat dan een rechte lijn. Houd je scherm aan tijdens het opnemen. Echte achtergrond-tracking vereist een native app (bv. via Capacitor).
- **Offline kaarttegels.** Alleen kaartgebieden die je eerder online bekeek, zijn offline beschikbaar. Bekijk je route dus thuis even vooraf.
- **HTTPS vereist** voor GPS, installatie, meldingen en offline-werking bij gebruik van buitenaf (zie hierboven).
- **Meldingen op iPhone** werken alleen als de app op het beginscherm is geïnstalleerd (iOS 16.4+); elke gebruiker moet meldingen eenmalig toestaan.
- **Pad-snapping** (*Volg paden*) en het opnieuw afspelen van zeer grote video's hangen af van respectievelijk een ORS-sleutel en de ingestelde uploadlimiet.
- **Bestaande media van vóór deze versie** heeft mogelijk geen volledig origineel op de server; daarvan toont de viewer de thumbnail als terugval.

---

*HikeLog is een zelf-gehoste hobbyapp voor een besloten vriendengroep. Veel wandelplezier.*
