import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs";

const state = {
  fileName: "",
  fileType: "",
  mode: "basic",
  pages: [],
  docTokenCounts: new Map(),
  linkedNorms: new Set(),
  colorByNorm: new Map(),
  activeNorm: null,
  filters: [{ id: 1, enabled: true, text: "" }],
  nextFilterId: 2,
};

const palette = [
  "#f28a35",
  "#5a7cf0",
  "#35a970",
  "#d95f5f",
  "#9b63d3",
  "#2c9daf",
  "#c2762f",
  "#4f8f4b",
  "#c14b7d",
  "#6f78d8",
];

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have",
  "how", "i", "if", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this",
  "to", "was", "were", "what", "when", "where", "which", "who", "why", "with", "would",
  "tell", "does", "do", "about", "say", "document", "please",
]);

const dropOverlay = document.querySelector("#drop-overlay");
const docMeta = document.querySelector("#doc-meta");
const docView = document.querySelector("#document-view");
const questionInput = document.querySelector("#question-input");
const questionTokens = document.querySelector("#question-tokens");
const linkedSummary = document.querySelector("#linked-summary");
const pageRanking = document.querySelector("#page-ranking");
const modeToggle = document.querySelector("#mode-toggle");
const modeHint = document.querySelector("#mode-hint");
const basicMode = document.querySelector("#basic-mode");
const advancedMode = document.querySelector("#advanced-mode");
const addFilterButton = document.querySelector("#add-filter");
const filterList = document.querySelector("#filter-list");
const tokenTitle = document.querySelector("#token-title");
const fileInput = document.querySelector("#file-input");

let dragDepth = 0;

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.classList.add("is-visible");
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    dropOverlay.classList.remove("is-visible");
  }
});

window.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove("is-visible");
  const [file] = event.dataTransfer?.files || [];
  if (file) {
    await loadFile(file);
  }
});

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (file) {
    await loadFile(file);
  }
});

questionInput.addEventListener("input", () => {
  updateQuestion();
});

modeToggle.addEventListener("click", () => {
  state.mode = state.mode === "basic" ? "advanced" : "basic";
  syncModeUI();
  updateQuestion();
});

addFilterButton.addEventListener("click", () => {
  state.filters.push({ id: state.nextFilterId, enabled: true, text: "" });
  state.nextFilterId += 1;
  renderFilterList();
});

filterList.addEventListener("input", (event) => {
  const input = event.target.closest(".filter-input");
  if (!input) return;
  const id = Number(input.dataset.filterId);
  const filter = state.filters.find((item) => item.id === id);
  if (!filter) return;
  filter.text = input.value;
  updateQuestion();
});

filterList.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".filter-check");
  if (!checkbox) return;
  const id = Number(checkbox.dataset.filterId);
  const filter = state.filters.find((item) => item.id === id);
  if (!filter) return;
  filter.enabled = checkbox.checked;
  updateQuestion();
});

filterList.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-remove");
  if (!button) return;
  const id = Number(button.dataset.filterId);
  if (state.filters.length === 1) return;
  state.filters = state.filters.filter((item) => item.id !== id);
  renderFilterList();
  updateQuestion();
});

docView.addEventListener("mouseover", (event) => {
  const token = event.target.closest("[data-norm]");
  if (!token) return;
  if (!state.linkedNorms.has(token.dataset.norm)) return;
  setActiveNorm(token.dataset.norm);
});

docView.addEventListener("mouseout", (event) => {
  const token = event.target.closest("[data-norm]");
  if (!token) return;
  if (state.activeNorm === token.dataset.norm) {
    setActiveNorm(null);
  }
});

docView.addEventListener("click", (event) => {
  const token = event.target.closest("[data-norm]");
  if (!token) return;
  const norm = token.dataset.norm;
  if (!state.linkedNorms.has(norm)) return;
  setActiveNorm(state.activeNorm === norm ? null : norm);
});

questionTokens.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-norm]");
  if (!chip) return;
  const norm = chip.dataset.norm;
  if (!state.linkedNorms.has(norm)) return;
  setActiveNorm(state.activeNorm === norm ? null : norm);
});

linkedSummary.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-norm]");
  if (!chip) return;
  const norm = chip.dataset.norm;
  setActiveNorm(state.activeNorm === norm ? null : norm);
});

pageRanking.addEventListener("click", (event) => {
  const item = event.target.closest("[data-page-num]");
  if (!item) return;
  const pageNum = Number(item.dataset.pageNum);
  jumpToPage(pageNum);
});

async function loadFile(file) {
  const name = file.name.toLowerCase();
  clearState();
  state.fileName = file.name;
  state.fileType = "";
  docMeta.textContent = `Loading ${file.name}...`;
  renderTurtleState({ spinning: true, message: `Parsing ${file.name}...` });

  try {
    if (name.endsWith(".pdf")) {
      state.fileType = "pdf";
      await parsePdf(file);
    } else if (name.endsWith(".txt")) {
      state.fileType = "txt";
      await parseTxt(file);
    } else {
      throw new Error("Unsupported file type. Use .pdf or .txt.");
    }
    renderDocument();
    updateQuestion();
    const tokenCount = [...state.docTokenCounts.values()].reduce((sum, n) => sum + n, 0);
    docMeta.textContent = `${state.fileName} • ${state.pages.length} page(s) • ${tokenCount} tokens`;
  } catch (error) {
    docMeta.textContent = `${state.fileName} • failed to parse`;
    renderTurtleState({ spinning: false, message: error.message });
  }
}

function clearState() {
  state.fileType = "";
  state.pages = [];
  state.docTokenCounts = new Map();
  state.linkedNorms = new Set();
  state.colorByNorm = new Map();
  state.activeNorm = null;
}

async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;

    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => item.str).join(" ");
    state.pages.push({
      pageNum,
      previewSrc: canvas.toDataURL("image/png"),
      rawText: text,
      parts: tokenizeText(text, state.docTokenCounts),
    });
  }
}

async function parseTxt(file) {
  const text = await file.text();
  state.pages.push({
    pageNum: 1,
    previewSrc: null,
    rawText: text,
    parts: tokenizeText(text, state.docTokenCounts),
  });
}

function tokenizeText(text, countsMap) {
  const parts = [];
  const chunks = text.match(/(\p{L}[\p{L}\p{N}'-]*|\p{N}+|\s+|[^\s])/gu) || [];
  for (const chunk of chunks) {
    if (/^\s+$/u.test(chunk)) {
      parts.push({ type: "space", text: chunk });
      continue;
    }
    if (/^(\p{L}[\p{L}\p{N}'-]*|\p{N}+)$/u.test(chunk)) {
      const norm = normalize(chunk);
      countsMap.set(norm, (countsMap.get(norm) || 0) + 1);
      parts.push({ type: "token", text: chunk, norm });
      continue;
    }
    parts.push({ type: "punct", text: chunk });
  }
  return parts;
}

function normalize(token) {
  return token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function getColor(norm) {
  if (!state.colorByNorm.has(norm)) {
    const index = state.colorByNorm.size % palette.length;
    state.colorByNorm.set(norm, palette[index]);
  }
  return state.colorByNorm.get(norm);
}

function renderDocument() {
  if (state.pages.length === 0) {
    renderTurtleState({
      spinning: false,
      message: "Drop a PDF or TXT file to render tokenized content here.",
    });
    return;
  }

  docView.innerHTML = "";
  for (const page of state.pages) {
      const pageEl = document.createElement("article");
      pageEl.className = "page";
      pageEl.dataset.pageNum = String(page.pageNum);
      pageEl.innerHTML = `<h3>Page ${page.pageNum}</h3>`;

    const pageText = document.createElement("div");
    pageText.className = "page-text";

    if (page.previewSrc) {
      const img = document.createElement("img");
      img.src = page.previewSrc;
      img.alt = `PDF page ${page.pageNum} preview`;
      img.className = "page-preview";
      pageEl.append(img);
    }

    for (const part of page.parts) {
      if (part.type === "space") {
        pageText.append(document.createTextNode(part.text));
        continue;
      }
      if (part.type !== "token") {
        const punct = document.createElement("span");
        punct.textContent = part.text;
        pageText.append(punct);
        continue;
      }
      const token = document.createElement("span");
      token.className = "token";
      token.dataset.norm = part.norm;
      token.textContent = part.text;
      pageText.append(token);
    }

    pageEl.append(pageText);
    docView.append(pageEl);
  }
}

function renderTurtleState({ spinning, message }) {
  const spinClass = spinning ? " turtle--spin" : "";
  docView.innerHTML = `
    <div class="empty-state">
      <img class="turtle${spinClass}" src="turtle.png" alt="Turtle mascot" />
      <p>${message}</p>
    </div>
  `;
}

function updateQuestion() {
  state.activeNorm = null;
  const questionParts = getActiveQueryTokenParts();

  const uniqueQuestionNorms = [];
  const seen = new Set();
  for (const part of questionParts) {
    if (!part.norm || seen.has(part.norm)) continue;
    seen.add(part.norm);
    uniqueQuestionNorms.push(part.norm);
  }

  state.linkedNorms = new Set(
    uniqueQuestionNorms.filter((norm) => state.docTokenCounts.has(norm) && !stopWords.has(norm)),
  );

  renderQuestionTokens(uniqueQuestionNorms);
  renderLinkedSummary();
  applyLinkStyles();
  renderPageRanking();
}

function getActiveQueryTokenParts() {
  if (state.mode === "basic") {
    const question = questionInput.value.trim();
    return tokenizeText(question, new Map()).filter((part) => part.type === "token");
  }

  const parts = [];
  for (const filter of state.filters) {
    if (!filter.enabled) continue;
    const tokens = tokenizeText(filter.text.trim(), new Map()).filter((part) => part.type === "token");
    parts.push(...tokens);
  }
  return parts;
}

function renderQuestionTokens(norms) {
  questionTokens.innerHTML = "";
  if (norms.length === 0) {
    const emptyCopy = state.mode === "basic"
      ? "Start typing a question."
      : "Enable filters and type filter terms.";
    questionTokens.innerHTML = `<span class="token-chip">${emptyCopy}</span>`;
    return;
  }

  for (const norm of norms) {
    const chip = document.createElement("span");
    chip.className = "token-chip";
    chip.dataset.norm = norm;
    chip.textContent = norm;
    if (state.linkedNorms.has(norm)) {
      chip.classList.add("token-chip--linked");
      chip.style.setProperty("--token-color", getColor(norm));
    }
    questionTokens.append(chip);
  }
}

function renderLinkedSummary() {
  linkedSummary.innerHTML = "";
  if (state.linkedNorms.size === 0) {
    linkedSummary.innerHTML = `<span class="token-chip">No overlaps yet.</span>`;
    return;
  }

  const entries = [...state.linkedNorms].sort((a, b) => {
    const aCount = state.docTokenCounts.get(a) || 0;
    const bCount = state.docTokenCounts.get(b) || 0;
    return bCount - aCount;
  });

  for (const norm of entries) {
    const count = state.docTokenCounts.get(norm) || 0;
    const chip = document.createElement("span");
    chip.className = "token-chip token-chip--linked";
    chip.dataset.norm = norm;
    chip.style.setProperty("--token-color", getColor(norm));
    chip.textContent = `${norm} (${count})`;
    linkedSummary.append(chip);
  }
}

function applyLinkStyles() {
  const tokens = docView.querySelectorAll(".token[data-norm]");
  for (const token of tokens) {
    const norm = token.dataset.norm;
    token.classList.remove("token--linked", "token--active");
    token.style.removeProperty("--token-color");
    if (!state.linkedNorms.has(norm)) continue;
    token.classList.add("token--linked");
    token.style.setProperty("--token-color", getColor(norm));
  }
  refreshActiveStyles();
}

function renderPageRanking() {
  pageRanking.innerHTML = "";
  if (state.pages.length === 0) {
    pageRanking.innerHTML = `<span class="token-chip">Load a file first.</span>`;
    return;
  }
  if (state.linkedNorms.size === 0) {
    pageRanking.innerHTML = `<span class="token-chip">No ranked pages yet.</span>`;
    return;
  }

  const ranked = state.pages
    .map((page) => {
      let score = 0;
      for (const part of page.parts) {
        if (part.type === "token" && state.linkedNorms.has(part.norm)) {
          score += 1;
        }
      }
      return { pageNum: page.pageNum, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.pageNum - b.pageNum);

  if (ranked.length === 0) {
    pageRanking.innerHTML = `<span class="token-chip">No matching pages.</span>`;
    return;
  }

  for (const entry of ranked) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-rank-item";
    button.dataset.pageNum = String(entry.pageNum);
    button.innerHTML = `
      <span>Page ${entry.pageNum}</span>
      <span class="page-rank-score">${entry.score} hit${entry.score === 1 ? "" : "s"}</span>
    `;
    pageRanking.append(button);
  }
}

function jumpToPage(pageNum) {
  const target = docView.querySelector(`.page[data-page-num="${pageNum}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.remove("page--focus");
  void target.offsetWidth;
  target.classList.add("page--focus");
}

function syncModeUI() {
  const isAdvanced = state.mode === "advanced";
  basicMode.classList.toggle("is-hidden", isAdvanced);
  advancedMode.classList.toggle("is-hidden", !isAdvanced);
  modeHint.textContent = isAdvanced ? "Advanced mode" : "Basic mode";
  modeToggle.textContent = isAdvanced ? "Basic mode" : "Advanced mode";
  tokenTitle.textContent = isAdvanced ? "Active Filter Tokens" : "Question Tokens";
}

function renderFilterList() {
  filterList.innerHTML = "";
  for (const filter of state.filters) {
    const row = document.createElement("div");
    row.className = "filter-row";
    row.innerHTML = `
      <label class="filter-toggle">
        <input class="filter-check" data-filter-id="${filter.id}" type="checkbox" ${filter.enabled ? "checked" : ""} />
        Use
      </label>
      <input
        class="filter-input"
        data-filter-id="${filter.id}"
        type="text"
        placeholder="Filter phrase..."
        value="${escapeHtml(filter.text)}"
      />
      <button
        class="filter-remove"
        data-filter-id="${filter.id}"
        type="button"
        ${state.filters.length === 1 ? "disabled" : ""}
      >
        Remove
      </button>
    `;
    filterList.append(row);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

syncModeUI();
renderFilterList();
updateQuestion();

function setActiveNorm(norm) {
  state.activeNorm = norm;
  refreshActiveStyles();
}

function refreshActiveStyles() {
  const activeNorm = state.activeNorm;
  const all = document.querySelectorAll("[data-norm]");
  for (const node of all) {
    node.classList.remove("token--active");
    if (!activeNorm || node.dataset.norm !== activeNorm) continue;
    node.classList.add("token--active");
  }
}
