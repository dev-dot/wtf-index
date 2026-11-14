// Mehrwertsteuer in der Gastronomie (Deutschland) und der Weitergabe-Check.
// Speisen im Lokal: 19 % → 5 % (2. Hj. 2020) → 7 % (2021–2023) → 19 % (2024–2025) → 7 % (seit 1.1.2026, dauerhaft).
// Getränke: 19 %, nur im 2. Halbjahr 2020 16 % (allgemeine Senkung).
// Speisen zum Mitnehmen lagen immer beim ermäßigten Satz – deshalb ist der Döner (oft Mitnahme) ausgenommen.

export const VAT_PERIODS = [
  { from: "2019-01-01", to: "2020-06-30", food: 19, drink: 19, label: "vor Corona" },
  { from: "2020-07-01", to: "2020-12-31", food: 5,  drink: 16, label: "Corona-Senkung" },
  { from: "2021-01-01", to: "2023-12-31", food: 7,  drink: 19, label: "Corona-Ermäßigung" },
  { from: "2024-01-01", to: "2025-12-31", food: 19, drink: 19, label: "wieder 19 %" },
  { from: "2026-01-01", to: "2099-12-31", food: 7,  drink: 19, label: "dauerhaft 7 %" },
];
// Indizes, für die der Check sinnvoll ist (Speisen, die man im Lokal isst)
export const VAT_FOOD_ITEMS = ["pizza", "spaetzle", "maultaschen"];

export function vatOn(iso, kind = "food") {
  const p = VAT_PERIODS.find(x => iso >= x.from && iso <= x.to) || VAT_PERIODS[VAT_PERIODS.length - 1];
  return kind === "drink" ? p.drink : p.food;
}

// Vergleich zweier Preise (älter → neuer) eines Gerichts im Lokal.
// Nur sinnvoll, wenn sich der Steuersatz dazwischen geändert hat.
export function passThrough(from, to) {
  const r0 = vatOn(from.validFrom), r1 = vatOn(to.validFrom);
  if (r0 === r1) return null;
  const expected = from.price * (1 + r1 / 100) / (1 + r0 / 100); // gleicher Nettopreis, neuer Steuersatz
  const net0 = from.price / (1 + r0 / 100), net1 = to.price / (1 + r1 / 100);
  const netPct = (net1 - net0) / net0 * 100;
  let verdict;
  if (r1 < r0) verdict = to.price <= expected + 0.05 ? "voll" : to.price < from.price - 0.05 ? "teilweise" : "nein";
  else verdict = to.price >= expected - 0.05 ? "voll" : to.price > from.price + 0.05 ? "teilweise" : "nein";
  return { r0, r1, expected, net0, net1, netPct, verdict, cut: r1 < r0 };
}

export const VAT_SOURCES = [
  { label: "IHK Dresden: Dauerhafte Steuersenkung auf Speisen seit 1. Januar in Kraft", url: "https://www.ihk.de/dresden/servicenavigation/presse-publikationen/meldungen/dauerhafte-steuersenkung-auf-speisen-seit-1-januar-in-kraft-6929266" },
  { label: "IHK Frankfurt: Reduzierter Mehrwertsteuersatz auf Speisen ab 1. Januar 2026", url: "https://www.frankfurt-main.ihk.de/branchenthemen/portal-gastronomie-tourismus-und-gesundheitswirtschaft/wichtige-informationen-zum-gaststaettengewerbe/news-fuer-die-gastronomie/reduzierter-mehrwertsteuersatz-6847546" },
  { label: "Grant Thornton: Umsatzsteuererhöhung Gastronomie zum 1.1.2024", url: "https://www.grantthornton.de/themen/2023/umsatzsteuererhoehung-gastronomie/" },
  { label: "ZDF heute: Steuersenkung für Gastro-Betriebe – kommt sie bei den Gästen an?", url: "https://www.zdfheute.de/wirtschaft/steuersenkung-gastrobranche-dehoga-verbraucher-erwartungen-100.html" },
];
