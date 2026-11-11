// Kleine, sichere Textauszeichnung für Beiträge (kein HTML erlaubt):
//   Leerzeile = neuer Absatz · "## " = Zwischenüberschrift · "- " = Aufzählung
//   **fett** · _kursiv_ · [Linktext](https://…)
import { esc } from "./model.js";

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>");
}

export function renderBody(text) {
  return String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/).map(block => {
    const lines = block.split("\n");
    if (lines.every(l => /^\s*-\s+/.test(l))) return "<ul>" + lines.map(l => "<li>" + inline(l.replace(/^\s*-\s+/, "")) + "</li>").join("") + "</ul>";
    if (/^##\s+/.test(block)) return "<h2>" + inline(block.replace(/^##\s+/, "")) + "</h2>";
    return block.trim() ? "<p>" + lines.map(inline).join("<br>") + "</p>" : "";
  }).join("\n");
}
