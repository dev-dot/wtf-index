# WTF-Index

**Was kostet Ausgehen in Stuttgart wirklich?** Der WTF-Index zeigt auf einer Karte, was Lokale für ein paar Klassiker verlangen, und markiert, wer im Vergleich zum Stuttgarter Median fair ist und wer ein „WTF?!“ verdient.

Die Preise stammen aus Speisekarten, Angaben des WTF-Teams und geprüften Besucher-Meldungen. Neueste Angabe gewinnt. Alle Angaben ohne Gewähr.

## Auswahl der Lokale

Der WTF-Index ist **kuratiert**: Aufgenommen werden nur Restaurants und Imbisse, in denen das Essen gut schmeckt. Neue Lokale (auch Vorschläge von Besuchern) bleiben im Admin-Bereich ausgeblendet, bis jemand vom Team dort gegessen und sie freigeschaltet hat. Der Index zeigt also, was *gutes* Essen in Stuttgart kostet, und ist kein vollständiger Marktüberblick.

## Journalistischer Anspruch

Der WTF-Index versteht sich als journalistisch-redaktionelles Angebot (Verantwortliche nach § 18 Abs. 2 MStV im Impressum):

- **So arbeiten wir** (`methodik.html`): Auswahl, Unabhängigkeit, Preiserhebung, Bewertung, Stellungnahmen, Korrekturen
- **WTF-Report** (`beitraege.html`): redaktionelle Beiträge, im Admin-Bereich unter „Beiträge“ geschrieben
- **Das sagt das Lokal:** Stellungnahmen und Gegendarstellungen der Lokale, im Info-Fenster sichtbar
- **Sichtbare Korrekturen** an Preisen und Beiträgen statt stiller Änderungen
- Aufnahme und Bewertung sind nicht käuflich

## Indizes und Regeln

| Index | Was zählt |
|---|---|
| Wasser | Mineral- oder Tafelwasser, Flasche **0,75 l** (0,5-l-Flaschen zählen nicht) |
| Bier 0,3 | Pils, Helles oder Export, **0,3 oder 0,33 l**, vom Fass, sonst Flasche, **kein Weizen** |
| Bier 0,5 | Pils, Helles oder Export, **0,5 l**, vom Fass, sonst Flasche, **kein Weizen** |
| Döner | Döner im Brot, normal, ohne Extras |
| Pizza Margherita | Standardgröße laut Karte, **nur Pizzerien** |
| Käsespätzle | Hauptgericht-Portion |
| Maultaschen | Hauptgericht, geschmälzt oder mit Zwiebelschmelze, mit Kartoffelsalat oder Salat |

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
supabase/migrations/       Änderungen für eine bestehende Datenbank
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
- **Speisekarten:** von Besuchern hochgeladene Karten (PDF/Fotos) ansehen, Preise eintragen, als erledigt markieren. Fehlt das Lokal noch, lässt es sich direkt anlegen.
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

Bei einer schon eingerichteten Datenbank kommen Änderungen als Dateien in `supabase/migrations/`. Jede einmal im SQL-Editor ausführen, in der Reihenfolge der Dateinamen:

1. `2026-11-10_maultaschen.sql`
2. `2026-11-11_menu_uploads.sql`
3. `2026-11-11_hinweise_loeschfrist.sql`
4. `2026-11-12_redaktion.sql`

Zugriffsregeln: Alle lesen aktive Lokale, Preise und freigegebene Meldungen. Alle dürfen Meldungen einreichen, die als `pending` ankommen. Schreiben und Freigeben dürfen nur Nutzer aus der Tabelle `admins`.

## Datenschutz

- Schriften, Leaflet und die Supabase-Bibliothek liegen in `vendor/` (keine Anfragen an Google oder CDNs).
- Kein Tracking, keine Cookies außer der Anmelde-Sitzung im Admin-Bereich.
- Hochgeladene Speisekarten werden gelöscht, sobald sie erledigt oder abgelehnt sind, spätestens nach 30 Tagen. Das passiert beim Öffnen des Admin-Bereichs.
- Hinweise und Meldungen nach dem DSA kommen über das Formular „Hinweis“ (Link „Preis falsch? Für Gastronomen“ auf der Karte) in den Admin-Reiter „Hinweise“.

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
- Preise aus hochgeladenen Speisekarten automatisch vorschlagen
- Impressum und Datenschutzerklärung: Entwürfe liegen bei (`impressum.html`, `datenschutz.html`). Platzhalter in [eckigen Klammern] ausfüllen und rechtlich prüfen lassen.
