// Öffentliche Konfiguration. Hier gehören nur Werte hin, die ohnehin im Browser landen
// (Supabase-URL und der öffentliche "anon"-Schlüssel sind dafür gedacht). Keine geheimen Schlüssel!
export const CONFIG = {
  // Supabase-Projekt für Besucher-Meldungen. Leer lassen = Demo-Modus (Meldungen nur im eigenen Browser).
  supabaseUrl: "https://gurymgslxttqjcvcspoy.supabase.co",
  supabaseAnonKey: "sb_publishable_dGy0073d5bKHmqB51xtr1A_nw4gqhyf",

  // Kartenkacheln. Für die Entwicklung reichen die OpenStreetMap-Kacheln.
  // Für den öffentlichen Betrieb einen Anbieter mit Schlüssel eintragen, z. B. MapTiler:
  // tileUrl: "https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=DEIN_KEY",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  tileMaxZoom: 19,
};
