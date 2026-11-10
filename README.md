# WTF-Index

**Was kostet Ausgehen in Stuttgart wirklich?** Der WTF-Index zeigt auf einer Karte, was Lokale für ein paar Klassiker verlangen, und markiert, wer im Vergleich zum Stuttgarter Median fair ist und wer ein „WTF?!“ verdient.

Die Preise stammen aus Speisekarten, Angaben des WTF-Teams und geprüften Besucher-Meldungen. Neueste Angabe gewinnt. Alle Angaben ohne Gewähr.

## Indizes und Regeln

| Index | Was zählt |
|---|---|
| Wasser | Mineral- oder Tafelwasser, Flasche **0,75 l** (0,5-l-Flaschen zählen nicht) |
| Bier 0,3 | Pils, Helles oder Export, **0,3 oder 0,33 l**, vom Fass, sonst Flasche, **kein Weizen** |
| Bier 0,5 | Pils, Helles oder Export, **0,5 l**, vom Fass, sonst Flasche, **kein Weizen** |
| Döner | Döner im Brot, normal, ohne Extras |
| Pizza Margherita | Standardgröße laut Karte, **nur Pizzerien** |
| Käsespätzle | Hauptgericht-Portion |

**Bewertung** pro Index, gemessen am Median aller Preise:

- **Fair:** unter 95 % des Medians
- **Geht so:** 95 bis 112 %
- **WTF?!:** über 112 %

## Projektaufbau

```
index.html                 Karte
admin.html                 Admin-Bereich
css/style.css              Design (hell und dunkel)
css/admin.css              Ergänzungen für den Admin-Bereich
js/app.js                  Karte, Ranking, Melde-Formular
js/admin.js                Meldungen freigeben, Lokale und Preise pflegen
js/backend.js              Datenzugriff: Supabase oder lokaler Modus
js/model.js                Indizes, Regeln, Datenformat
js/config.js               Öffentliche Konfiguration (Supabase, Kartenkacheln)
data/venues.json           Lokale und Preise (Startdaten / lokaler Modus)
data/stuttgart-boundary.json  Stadtgrenze (GADM, vereinfacht)
supabase/schema.sql        Tabellen und Zugriffsregeln
supabase/seed.sql          Startdaten aus data/venues.json (npm run seed)
```

Keine Build-Tools nötig: Die Seite ist rein statisch und läuft auf jedem Static-Hosting (Netlify, Vercel, GitHub Pages).

## Lokal starten

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen, den Admin-Bereich unter <http://localhost:8000/admin.html>.

Ohne Supabase läuft alles im **lokalen Modus**: Startdaten kommen aus `data/venues.json`, Änderungen und Meldungen bleiben im eigenen Browser. Im Admin-Bereich lassen sich die Änderungen als `venues.json` exportieren und ins Repository übernehmen.

## Admin-Bereich

`admin.html` (nicht verlinkt, `noindex`):

- **Meldungen:** offene Besucher-Meldungen mit Vergleich zum aktuellen Preis freigeben oder ablehnen
- **Lokale:** anlegen und bearbeiten, Standort per Adresssuche (OpenStreetMap Nominatim) oder Klick in die Karte setzen, Lokale ausblenden
- **Preise:** neuen Preis mit Quelle, Datum der Karte und Hinweis eintragen. Alte Preise bleiben als Verlauf erhalten, der neueste zählt.

## Supabase einrichten

1. Projekt auf [supabase.com](https://supabase.com) anlegen (Region EU).
2. Im SQL-Editor `supabase/schema.sql` und danach `supabase/seed.sql` ausführen.
3. Unter *Authentication → Users* einen Nutzer mit E-Mail und Passwort anlegen und ihn zum Admin machen:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'du@example.com' on conflict do nothing;
   ```
4. In `js/config.js` die Projekt-URL und den **anon**-Schlüssel eintragen.
5. Unter *Authentication → Providers* die öffentliche Registrierung abschalten, damit sich niemand selbst Konten anlegt.

Zugriffsregeln: Alle lesen aktive Lokale, Preise und freigegebene Meldungen. Alle dürfen Meldungen einreichen, die als `pending` ankommen. Schreiben und Freigeben dürfen nur Nutzer aus der Tabelle `admins`.

## Kartenkacheln

Standardmäßig nutzt die App die Kacheln von openstreetmap.org. Die sind für Entwicklung und wenig Traffic gedacht. Für den öffentlichen Betrieb in `js/config.js` einen Anbieter mit eigenem Schlüssel eintragen, z. B. MapTiler oder Stadia Maps.

## Neue Lokale und Preise

Im Betrieb über den Admin-Bereich. Im lokalen Modus stehen die Startdaten in `data/venues.json`. Pro Lokal:

```json
{
 "id": "r22",
 "name": "Beispiel-Lokal",
 "type": "Pizzeria",
 "district": "West",
 "address": "Musterstr. 1",
 "location": { "lat": 48.77, "lon": 9.16 },
 "source": { "label": "Hauskarte (PDF)", "url": null, "date": "2026-11-10", "stand": "10.11.2026" },
 "prices": { "pizza": { "price": 12.5 }, "bier": { "price": 4.8, "tap": "f" } },
 "notes": { "pizza": "Fior di Latte, Basilikum" }
}
```

- `tap`: `f` = vom Fass, `b` = Flasche
- `source.outdated: true` markiert alte Karten
- `wanted: ["doener"]` zeigt ein Lokal ohne Preis als „?“ im jeweiligen Index

## Offen

- Preisverlauf öffentlich anzeigen (Daten sind schon da)
- Hochladen von Speisekarten-PDFs im Admin-Bereich
- Impressum und Datenschutzerklärung (vor dem öffentlichen Start Pflicht)
