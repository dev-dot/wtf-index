// Öffentliche Beitragsseite: Liste (beitraege.html) und einzelner Beitrag (beitraege.html#adresse)
import { createBackend } from "./backend.js";
import { renderBody } from "./markup.js";
import { esc, venueMatchName } from "./model.js";

// Namen der erwähnten Lokale im Text hervorheben und mit der Karte verlinken (nur in Textknoten).
function linkVenues(root, vs) {
  const names = vs.map(v => ({ v, n: venueMatchName(v) })).filter(x => x.n.length >= 4).sort((a, b) => b.n.length - a.n.length);
  if (!names.length) return;
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(" + names.map(x => escRe(x.n)).join("|") + ")", "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest("a") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!re.test(node.nodeValue)) continue; re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    node.nodeValue.split(re).forEach((part, i) => {
      if (i % 2 === 0) { if (part) frag.appendChild(document.createTextNode(part)); return; }
      const hit = names.find(x => x.n.toLowerCase() === part.toLowerCase());
      const a = document.createElement("a");
      a.href = "./#v-" + hit.v.id; a.className = "venue-link"; a.textContent = part; a.title = hit.v.name + " auf der Karte";
      frag.appendChild(a);
    });
    node.replaceWith(frag);
  }
}

const main = document.getElementById("main");
const fmtDay = ms => new Date(ms).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
let articles = [], venues = [];

function listView() {
  document.title = "WTF-Report · WTF-Index";
  main.innerHTML = '<h1>WTF-Report</h1><p class="lead-text">Was gutes Essen in Stuttgart kostet und warum. Einordnungen der Redaktion zu den Zahlen auf der Karte.</p>' +
    (articles.length
      ? '<ul class="article-list">' + articles.map(a =>
          '<li><a href="#' + esc(a.slug) + '"><span class="date">' + fmtDay(a.publishedAt) + "</span><b>" + esc(a.title) + "</b>" +
          (a.teaser ? "<span>" + esc(a.teaser) + "</span>" : "") + "</a></li>").join("") + "</ul>"
      : '<p class="muted">Der erste Beitrag ist in Arbeit.</p>');
}

function articleView(a) {
  document.title = a.title + " · WTF-Report";
  const vs = (a.venueIds || []).map(id => venues.find(v => v.id === id)).filter(Boolean);
  main.innerHTML = '<p><a href="#">← Alle Beiträge</a></p><article class="article">' +
    "<h1>" + esc(a.title) + '</h1><p class="muted">' + esc([a.author, fmtDay(a.publishedAt)].filter(Boolean).join(" · ")) + "</p>" +
    (a.teaser ? '<p class="teaser">' + esc(a.teaser) + "</p>" : "") +
    '<div class="body">' + renderBody(a.body) + "</div>" +
    (vs.length ? '<aside class="mentioned"><b>Lokale in diesem Beitrag</b>' + vs.map(v => {
      const st = v.statement ? '<div class="statement"><b>Das sagt das Lokal</b>' + esc(v.statement) + "</div>" : "";
      return '<div><a class="venue-link" href="./#v-' + esc(v.id) + '">' + esc(v.name) + '</a> <span class="muted">' + esc(v.district || "") + "</span>" + st + "</div>";
    }).join("") + "</aside>" : "") +
    (a.correction ? '<p class="correction"><b>Korrektur:</b> ' + esc(a.correction) + "</p>" : "") +
    "</article>";
  linkVenues(main.querySelector(".body"), vs);
  window.scrollTo(0, 0);
}

function route() {
  const slug = decodeURIComponent(location.hash.slice(1));
  const a = slug && articles.find(x => x.slug === slug);
  if (a) articleView(a);
  else { listView(); if (slug) main.insertAdjacentHTML("afterbegin", '<p class="muted">Diesen Beitrag gibt es nicht (mehr).</p>'); }
}

(async () => {
  try {
    const backend = await createBackend();
    const [list, data] = await Promise.all([backend.listArticles(), backend.loadAll()]);
    articles = list.filter(a => a.status === "published" && a.publishedAt && a.publishedAt <= Date.now());
    venues = data.venues;
  } catch (e) {
    console.error(e);
    main.innerHTML = '<h1>WTF-Report</h1><p class="muted">Die Beiträge sind gerade nicht erreichbar. Bitte später noch einmal versuchen.</p>';
    return;
  }
  route();
  window.addEventListener("hashchange", route);
})();
