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
index.html                 Seite
css/style.css              Design (hell und dunkel)
js/app.js                  Karte, Ranking, Melde-Formular
js/store.js                Besucher-Meldungen (Supabase oder Demo-Modus)
js/config.js               Öffentliche Konfiguration (Supabase, Kartenkacheln)
data/venues.json           Lokale und Speisekarten-Preise
data/stuttgart-boundary.json  Stadtgrenze (GADM, vereinfacht)
supabase/schema.sql        Tabelle und Zugriffsregeln für Meldungen
```

Keine Build-Tools nötig: Die Seite ist rein statisch und läuft auf jedem Static-Hosting (Netlify, Vercel, GitHub Pages).

## Lokal starten

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen. Ohne Supabase-Konfiguration läuft die App im **Demo-Modus**: Meldungen werden nur im eigenen Browser gespeichert.

## Besucher-Meldungen mit Supabase

1. Projekt auf [supabase.com](https://supabase.com) anlegen (Region EU).
2. `supabase/schema.sql` im SQL-Editor ausführen.
3. In `js/config.js` die Projekt-URL und den **anon**-Schlüssel eintragen.

Neue Meldungen kommen mit Status `pending` an und erscheinen erst, wenn jemand vom Team sie im Table Editor auf `approved` setzt.

## Kartenkacheln

Standardmäßig nutzt die App die Kacheln von openstreetmap.org. Die sind für Entwicklung und wenig Traffic gedacht. Für den öffentlichen Betrieb in `js/config.js` einen Anbieter mit eigenem Schlüssel eintragen, z. B. MapTiler oder Stadia Maps.

## Neue Lokale und Preise

Lokale stehen in `data/venues.json`. Pro Lokal:

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

- Admin-Bereich zum Freigeben von Meldungen und Pflegen von Preisen
- Preisverlauf pro Lokal
- Impressum und Datenschutzerklärung (vor dem öffentlichen Start Pflicht)
