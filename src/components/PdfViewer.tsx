import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
// PDF.js ships its worker as an ES module; Vite turns this import into a local asset URL.
// @ts-ignore Vite's ?url loader is resolved by the bundler.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./PdfViewer.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DEFAULT_ZOOM = 4 / 3;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;
const STORE_PREFIX = "octave:pdf-view:";
const SAVE_DELAY = 180;

type StoredView = {
  zoom: number;
  scrollTop: number;
  scrollLeft: number;
};

type PdfBundle = {
  path: string;
  document: PDFDocumentProxy;
};

type ItemGeometry = {
  str: string;
  fontName: string;
  fontSize: number;
  baseline: number;
};

type CopyPiece = {
  text: string;
  element: HTMLElement;
  order: number;
  page: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  fontSize: number;
  baseline: number;
  family: string;
  bold: boolean;
  italic: boolean;
  operator?: "sum";
};

type CopyLine = {
  page: string;
  pieces: CopyPiece[];
  baseline: number;
  fontSize: number;
  top: number;
  bottom: number;
};

function storageKey(path: string) {
  return `${STORE_PREFIX}${encodeURIComponent(path)}`;
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function readStoredView(path: string): StoredView {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(path)) ?? "null") as Partial<StoredView> | null;
    return {
      zoom: clampZoom(finite(value?.zoom, DEFAULT_ZOOM)),
      scrollTop: Math.max(0, finite(value?.scrollTop, 0)),
      scrollLeft: Math.max(0, finite(value?.scrollLeft, 0)),
    };
  } catch {
    return { zoom: DEFAULT_ZOOM, scrollTop: 0, scrollLeft: 0 };
  }
}

function isCancellation(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortException" || error.name === "RenderingCancelledException";
}

function geometryFor(item: unknown): ItemGeometry | null {
  if (!item || typeof item !== "object" || !("str" in item)) return null;
  const candidate = item as {
    str: string;
    fontName: string;
    transform: number[];
  };
  const transform = candidate.transform;
  return {
    str: candidate.str,
    fontName: candidate.fontName,
    fontSize: Math.hypot(transform?.[2] ?? 0, transform?.[3] ?? 0),
    baseline: transform?.[5] ?? 0,
  };
}

function annotateTextLayer(page: PDFPageProxy, layer: TextLayer, items: ItemGeometry[]) {
  layer.textDivs.forEach((span, index) => {
    const item = items[index];
    if (!item) return;
    span.dataset.pdfFontSize = String(item.fontSize);
    span.dataset.pdfBaseline = String(item.baseline);
    span.dataset.pdfFontName = item.fontName;
    span.dataset.pdfSourceText = item.str;
    span.dataset.pdfOrder = String(index);

    try {
      const font = page.commonObjs.get(item.fontName) as {
        name?: string;
        bold?: boolean;
        black?: boolean;
        italic?: boolean;
      };
      span.dataset.pdfFontFamily = font.name ?? "";
      span.dataset.pdfBold = String(Boolean(font.bold || font.black));
      span.dataset.pdfItalic = String(Boolean(font.italic));
      if (item.str === "P" && /cmex/i.test(font.name ?? "")) {
        span.dataset.pdfMathOperator = "sum";
        span.textContent = "∑";
      }
    } catch {
      // The canvas render normally resolves fonts first. The visible text layer
      // remains fully usable if a malformed PDF does not expose font metadata.
    }
  });
}

const accentMarks: Record<string, string> = {
  "´": "\u0301",
  "`": "\u0300",
  "¨": "\u0308",
  "~": "\u0303",
  "^": "\u0302",
};

function normalizePdfText(value: string) {
  return value
    .replace(/([´`¨~^])([AEIOUaeiouNnı])/g, (_match, mark: string, letter: string) => {
      const normalizedLetter = letter === "ı" ? "i" : letter;
      return `${normalizedLetter}${accentMarks[mark]}`;
    })
    .normalize("NFC");
}

function normalizeAccentRuns(pieces: CopyPiece[]) {
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    let value = piece.element.textContent ?? piece.text;
    const next = pieces[index + 1];
    const pending = /([´`¨~^])$/.exec(value);
    const leading = next && /^([AEIOUaeiouNnı])/.exec(next.element.textContent ?? next.text);
    if (pending && leading) {
      value = value.slice(0, -1);
      const nextValue = next.element.textContent ?? next.text;
      next.element.textContent = normalizePdfText(`${pending[1]}${leading[1]}`) + nextValue.slice(leading[1].length);
      next.text = next.element.textContent;
    }
    piece.element.textContent = normalizePdfText(value);
    piece.text = piece.element.textContent;
  }
}

function selectedText(span: HTMLElement, selection: Selection) {
  let result = "";
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);
    if (!range.intersectsNode(span)) continue;
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (range.intersectsNode(node)) {
        const value = node.textContent ?? "";
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : value.length;
        result += value.slice(start, end);
      }
      node = walker.nextNode();
    }
  }
  return result;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function inferFontFlags(span: HTMLElement, style: CSSStyleDeclaration) {
  const identity = `${span.dataset.pdfFontFamily ?? ""} ${span.dataset.pdfFontName ?? ""} ${style.fontFamily}`.toLowerCase();
  const weight = Number.parseInt(style.fontWeight, 10);
  return {
    bold:
      span.dataset.pdfBold === "true" ||
      Number.isFinite(weight) && weight >= 600 ||
      /(?:bold|black|demi|semi|cmbx)/.test(identity),
    italic:
      span.dataset.pdfItalic === "true" ||
      style.fontStyle === "italic" ||
      style.fontStyle.startsWith("oblique") ||
      /(?:italic|oblique|slant|cmti|cmsl)/.test(identity),
  };
}

function copyPieceFor(span: HTMLElement, text: string): CopyPiece {
  const rect = span.getBoundingClientRect();
  const style = getComputedStyle(span);
  const fontSize = finite(Number.parseFloat(style.fontSize), finite(Number(span.dataset.pdfFontSize), 12));
  const zoomedBaseline = finite(Number(span.dataset.pdfBaseline), rect.bottom) *
    finite(Number(span.closest<HTMLElement>(".octave-pdf-page")?.dataset.zoom), 1);
  const flags = inferFontFlags(span, style);
  return {
    text,
    element: span,
    order: finite(Number(span.dataset.pdfOrder), 0),
    page: span.closest<HTMLElement>(".octave-pdf-page")?.dataset.page ?? "0",
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    fontSize,
    baseline: zoomedBaseline,
    family: span.dataset.pdfFontFamily || style.fontFamily,
    operator: span.dataset.pdfMathOperator === "sum" ? "sum" : undefined,
    ...flags,
  };
}

function selectedPieces(root: HTMLElement, selection: Selection): CopyPiece[] {
  const pieces: CopyPiece[] = [];
  root.querySelectorAll<HTMLElement>(".octave-pdf-text-layer span[role='presentation']").forEach((span) => {
    const text = selectedText(span, selection);
    if (!text) return;
    pieces.push(copyPieceFor(span, text));
  });
  return pieces;
}

function groupLines(pieces: CopyPiece[]) {
  const lines: CopyLine[] = [];
  const assigned = new Set<CopyPiece>();

  // Large operators and their limits frequently have baselines that overlap
  // the preceding prose line. Extract each compact formula first, anchored by
  // horizontal proximity, so it cannot be split across unrelated paragraphs.
  for (const operator of pieces.filter((piece) => piece.operator === "sum")) {
    const candidates = pieces.filter((piece) =>
      piece !== operator &&
      piece.order > operator.order &&
      piece.page === operator.page &&
      piece.left >= operator.left - 2 &&
      piece.left <= operator.right + operator.fontSize * 5.5 &&
      Math.abs(piece.baseline - operator.baseline) <= operator.fontSize * 1.55);
    const expression = candidates.filter((piece) =>
      piece.fontSize >= operator.fontSize * 0.86 && piece.left >= operator.right - operator.fontSize * 0.45);
    if (!expression.length) continue;
    const formula = [operator, ...candidates];
    formula.forEach((piece) => assigned.add(piece));
    const expressionBaseline = median(expression.map((piece) => piece.baseline));
    lines.push({
      page: operator.page,
      pieces: formula,
      baseline: expressionBaseline,
      fontSize: Math.max(...expression.map((piece) => piece.fontSize)),
      top: Math.min(...formula.map((piece) => piece.top)),
      bottom: Math.max(...formula.map((piece) => piece.bottom)),
    });
  }

  for (const piece of pieces) {
    if (assigned.has(piece)) continue;
    let best: CopyLine | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      if (line.page !== piece.page) continue;
      const distance = Math.abs(line.baseline - piece.baseline);
      const tolerance = Math.max(line.fontSize, piece.fontSize) * 0.38;
      if (distance <= tolerance && distance < bestDistance) {
        best = line;
        bestDistance = distance;
      }
    }
    if (!best) {
      lines.push({
        page: piece.page,
        pieces: [piece],
        baseline: piece.baseline,
        fontSize: piece.fontSize,
        top: piece.top,
        bottom: piece.bottom,
      });
      continue;
    }
    best.pieces.push(piece);
    best.top = Math.min(best.top, piece.top);
    best.bottom = Math.max(best.bottom, piece.bottom);
    if (piece.fontSize >= best.fontSize * 0.8) {
      best.baseline = (best.baseline + piece.baseline) / 2;
      best.fontSize = Math.max(best.fontSize, piece.fontSize);
    }
  }

  // A strict baseline tolerance prevents paragraph jumps, but genuine
  // super/subscripts have intentionally shifted baselines. Attach only small,
  // horizontally adjacent runs to a larger line after prose lines are stable.
  for (const scriptLine of [...lines]) {
    if (scriptLine.pieces.some((piece) => piece.operator === "sum")) continue;
    const candidate = lines
      .filter((line) =>
        line !== scriptLine &&
        line.page === scriptLine.page &&
        scriptLine.fontSize < line.fontSize * 0.86 &&
        Math.abs(scriptLine.baseline - line.baseline) <= line.fontSize * 0.95)
      .map((line) => {
        const scriptLeft = Math.min(...scriptLine.pieces.map((piece) => piece.left));
        const scriptRight = Math.max(...scriptLine.pieces.map((piece) => piece.right));
        const lineLeft = Math.min(...line.pieces.map((piece) => piece.left));
        const lineRight = Math.max(...line.pieces.map((piece) => piece.right));
        const horizontalGap = Math.max(0, lineLeft - scriptRight, scriptLeft - lineRight);
        return { line, horizontalGap, score: Math.abs(scriptLine.baseline - line.baseline) + horizontalGap * 0.15 };
      })
      .filter(({ line, horizontalGap }) => horizontalGap <= line.fontSize * 3.5)
      .sort((a, b) => a.score - b.score)[0]?.line;
    if (!candidate) continue;
    candidate.pieces.push(...scriptLine.pieces);
    candidate.top = Math.min(candidate.top, scriptLine.top);
    candidate.bottom = Math.max(candidate.bottom, scriptLine.bottom);
    lines.splice(lines.indexOf(scriptLine), 1);
  }

  return lines.sort((a, b) => {
    const pageDelta = Number(a.page) - Number(b.page);
    const aVisualTop = median(a.pieces.filter((piece) => piece.operator !== "sum").map((piece) => piece.top)) || a.top;
    const bVisualTop = median(b.pieces.filter((piece) => piece.operator !== "sum").map((piece) => piece.top)) || b.top;
    return pageDelta || aVisualTop - bVisualTop || Math.min(...a.pieces.map((piece) => piece.left)) - Math.min(...b.pieces.map((piece) => piece.left));
  });
}

function stabilizeTextLayer(container: HTMLElement, layer: TextLayer) {
  const pieces = layer.textDivs
    .filter((span) => span.isConnected && Boolean(span.textContent))
    .map((span) => copyPieceFor(span, span.textContent ?? ""));
  const lines = groupLines(pieces);
  const fragment = document.createDocumentFragment();

  lines.forEach((line, lineIndex) => {
    line.pieces.sort((a, b) => a.left - b.left || b.baseline - a.baseline || a.order - b.order);
    normalizeAccentRuns(line.pieces);

    const previousLine = lines[lineIndex - 1];
    const nextLine = lines[lineIndex + 1];
    const topBoundary = previousLine && previousLine.page === line.page
      ? Math.max(line.top - line.fontSize * 0.45, (previousLine.bottom + line.top) / 2)
      : line.top - Math.min(3, line.fontSize * 0.3);
    const bottomBoundary = nextLine && nextLine.page === line.page
      ? Math.min(line.bottom + line.fontSize * 0.45, (line.bottom + nextLine.top) / 2)
      : line.bottom + Math.min(3, line.fontSize * 0.3);

    line.pieces.forEach((piece, pieceIndex) => {
      const span = piece.element;
      const rect = span.getBoundingClientRect();
      const previous = line.pieces[pieceIndex - 1];
      const next = line.pieces[pieceIndex + 1];
      // Scripts intentionally keep their narrow horizontal box; overlapping
      // upper/lower limits must not steal the base expression's pointer target.
      const script = piece.fontSize < line.fontSize * 0.86;
      const leftBoundary = script
        ? rect.left
        : previous ? (previous.right + rect.left) / 2 : rect.left - 2;
      const rightBoundary = script
        ? rect.right
        : next ? (rect.right + next.left) / 2 : rect.right + 2;
      const scaleX = rect.width / Math.max(1, span.offsetWidth);
      const scaleY = rect.height / Math.max(1, span.offsetHeight);
      span.classList.add("octave-pdf-selection-run");
      span.dataset.pdfLine = String(lineIndex);
      span.style.setProperty("--pdf-hit-left", `${Math.max(0, rect.left - leftBoundary) / Math.max(0.01, scaleX)}px`);
      span.style.setProperty("--pdf-hit-right", `${Math.max(0, rightBoundary - rect.right) / Math.max(0.01, scaleX)}px`);
      span.style.setProperty("--pdf-hit-top", `${Math.max(0, rect.top - topBoundary) / Math.max(0.01, scaleY)}px`);
      span.style.setProperty("--pdf-hit-bottom", `${Math.max(0, bottomBoundary - rect.bottom) / Math.max(0.01, scaleY)}px`);
      fragment.append(span);
    });
    const lineBreak = document.createElement("br");
    lineBreak.setAttribute("role", "presentation");
    lineBreak.dataset.pdfLineBreak = String(lineIndex);
    fragment.append(lineBreak);
  });

  const end = document.createElement("div");
  end.className = "octave-pdf-end-of-content";
  end.setAttribute("aria-hidden", "true");
  fragment.append(end);
  container.replaceChildren(fragment);
}

function appendStyledPiece(parent: HTMLElement, piece: CopyPiece, line: CopyLine) {
  let target: HTMLElement = document.createElement("span");
  target.textContent = piece.text;
  if (piece.family) target.style.fontFamily = piece.family;
  target.style.fontSize = `${piece.fontSize}px`;

  const isScript = piece.fontSize < line.fontSize * 0.86 &&
    Math.abs(piece.baseline - line.baseline) > line.fontSize * 0.12;
  if (isScript) {
    const script = document.createElement(piece.baseline > line.baseline ? "sup" : "sub");
    script.dataset.pdfMath = "true";
    script.append(target);
    target = script;
  }
  if (piece.italic) {
    const emphasis = document.createElement("em");
    emphasis.append(target);
    target = emphasis;
  }
  if (piece.bold) {
    const strong = document.createElement("strong");
    strong.append(target);
    target = strong;
  }
  parent.append(target);
}

type SumFormula = { latex: string; upper: string; lower: string; expression: string; punctuation: string };

function sumFormulaForLine(line: CopyLine): SumFormula | null {
  const operator = line.pieces.find((piece) => piece.operator === "sum");
  if (!operator) return null;
  const expressionPieces = line.pieces.filter((piece) =>
    piece !== operator && piece.fontSize >= line.fontSize * 0.86 && piece.left >= operator.right - line.fontSize * 0.45);
  if (!expressionPieces.length) return null;
  const expressionBaseline = median(expressionPieces.map((piece) => piece.baseline));
  const scripts = line.pieces.filter((piece) => piece !== operator && piece.fontSize < line.fontSize * 0.86);
  const join = (pieces: CopyPiece[]) => normalizePdfText(
    pieces.sort((a, b) => a.left - b.left || a.order - b.order).map((piece) => piece.text).join(""),
  ).replace(/\s+/g, "").trim();
  const upper = join(scripts.filter((piece) => piece.baseline > expressionBaseline));
  const lower = join(scripts.filter((piece) => piece.baseline < expressionBaseline));
  let expression = normalizePdfText(
    expressionPieces.sort((a, b) => a.left - b.left || a.order - b.order).map((piece) => piece.text).join(""),
  )
    .replace(/\s+([),.;:])/g, "$1")
    .replace(/([\p{L}\p{N}])\s+\(/gu, "$1(")
    .trim();
  const punctuationMatch = /([.,;:])$/.exec(expression);
  const punctuation = punctuationMatch?.[1] ?? "";
  if (punctuation) expression = expression.slice(0, -1);
  if (!upper || !lower || !expression) return null;
  return { latex: `\\sum_{${lower}}^{${upper}} ${expression}`, upper, lower, expression, punctuation };
}

function createMathMl(formula: SumFormula) {
  const namespace = "http://www.w3.org/1998/Math/MathML";
  const element = (name: string, text?: string) => {
    const node = document.createElementNS(namespace, name);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const math = element("math");
  math.setAttribute("display", "inline");
  const semantics = element("semantics");
  const row = element("mrow");
  const sum = element("munderover");
  sum.append(element("mo", "∑"), element("mrow", formula.lower), element("mrow", formula.upper));
  row.append(sum, element("mrow", formula.expression));
  const annotation = element("annotation", formula.latex);
  annotation.setAttribute("encoding", "application/x-tex");
  semantics.append(row, annotation);
  math.append(semantics);
  return math;
}

function plainTextForLines(lines: CopyLine[]) {
  return lines.map((line) => {
    const formula = sumFormulaForLine(line);
    if (formula) return `$${formula.latex}$${formula.punctuation}`;
    line.pieces.sort((a, b) => a.left - b.left || b.baseline - a.baseline || a.order - b.order);
    return normalizePdfText(line.pieces.map((piece) => piece.text).join(""));
  }).join("\n");
}

function richSelectionPayload(root: HTMLElement, selection: Selection) {
  const pieces = selectedPieces(root, selection);
  if (!pieces.length) return { html: "", plain: "" };
  const lines = groupLines(pieces);
  const allSizes = Array.from(root.querySelectorAll<HTMLElement>(".octave-pdf-text-layer span[role='presentation']"))
    .map((span) => finite(Number.parseFloat(getComputedStyle(span).fontSize), 0))
    .filter((size) => size > 0);
  const bodySize = median(allSizes) || median(pieces.map((piece) => piece.fontSize)) || 12;
  const fragment = document.createElement("div");

  lines.forEach((line, index) => {
    const ratio = line.fontSize / bodySize;
    const tag = ratio >= 1.65 ? "h1" : ratio >= 1.35 ? "h2" : ratio >= 1.16 ? "h3" : "p";
    const block = document.createElement(tag);
    block.style.margin = "0";
    block.style.fontSize = `${line.fontSize}px`;
    line.pieces.sort((a, b) => a.left - b.left || b.baseline - a.baseline);
    const formula = sumFormulaForLine(line);
    if (formula) {
      block.append(createMathMl(formula));
      if (formula.punctuation) block.append(document.createTextNode(formula.punctuation));
    } else {
      line.pieces.forEach((piece) => appendStyledPiece(block, piece, line));
    }

    const previous = lines[index - 1];
    if (previous && previous.page === line.page && tag === "p" && previous.fontSize / bodySize < 1.16) {
      const gap = line.top - previous.bottom;
      if (gap <= Math.max(previous.fontSize, line.fontSize) * 0.72) {
        const previousBlock = fragment.lastElementChild;
        if (previousBlock?.tagName === "P") {
          previousBlock.append(document.createElement("br"), ...Array.from(block.childNodes));
          return;
        }
      }
    }
    fragment.append(block);
  });
  return { html: fragment.innerHTML, plain: plainTextForLines(lines) };
}

export function PdfViewer({ path, active }: { path: string; active: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const loadingTaskRef = useRef<ReturnType<typeof getDocument> | null>(null);
  const renderTasksRef = useRef<RenderTask[]>([]);
  const textLayersRef = useRef<TextLayer[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const pendingRestoreRef = useRef(readStoredView(path));
  const zoomRef = useRef(pendingRestoreRef.current.zoom);
  const [zoom, setZoom] = useState(pendingRestoreRef.current.zoom);
  const [bundle, setBundle] = useState<PdfBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  zoomRef.current = zoom;

  const persistView = useCallback((immediate = false, override?: StoredView) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const value: StoredView = override ?? {
      zoom: zoomRef.current,
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
    };
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const commit = () => {
      try {
        localStorage.setItem(storageKey(path), JSON.stringify(value));
      } catch {
        // Storage can be unavailable in private/restricted browser contexts.
      }
      saveTimerRef.current = null;
    };
    if (immediate) commit();
    else saveTimerRef.current = window.setTimeout(commit, SAVE_DELAY);
  }, [path]);

  const cancelRendering = useCallback(() => {
    renderTasksRef.current.forEach((task) => task.cancel());
    textLayersRef.current.forEach((layer) => layer.cancel());
    renderTasksRef.current = [];
    textLayersRef.current = [];
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => persistView();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      persistView(true);
    };
  }, [persistView]);

  useEffect(() => {
    persistView(false, pendingRestoreRef.current);
  }, [zoom, persistView]);

  useEffect(() => {
    const stored = readStoredView(path);
    pendingRestoreRef.current = stored;
    zoomRef.current = stored.zoom;
    setZoom(stored.zoom);
    setBundle(null);
    setError("");
    setLoading(true);
    cancelRendering();

    let disposed = false;
    const loadingTask = getDocument({
      url: `/api/assets?path=${encodeURIComponent(path)}`,
      fontExtraProperties: true,
    });
    loadingTaskRef.current = loadingTask;
    loadingTask.promise.then((document) => {
      if (disposed) {
        return;
      }
      setBundle({ path, document });
    }).catch((reason: unknown) => {
      if (!disposed && !isCancellation(reason)) {
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      cancelRendering();
      if (loadingTaskRef.current === loadingTask) loadingTaskRef.current = null;
      void loadingTask.destroy().catch(() => undefined);
    };
  }, [path, cancelRendering]);

  useEffect(() => {
    if (!bundle || bundle.path !== path || !pagesRef.current) return;
    const pagesHost = pagesRef.current;
    cancelRendering();
    const hadVisiblePages = Boolean(pagesHost.querySelector(".octave-pdf-page"));
    if (!hadVisiblePages) setLoading(true);
    setError("");
    let disposed = false;
    const staging = document.createElement("div");
    staging.className = "octave-pdf-render-staging";
    staging.setAttribute("aria-hidden", "true");
    pagesHost.append(staging);

    const renderPage = async (page: PDFPageProxy, pageNumber: number) => {
      if (disposed) return;
      const viewport = page.getViewport({ scale: zoom });
      const pageHost = document.createElement("section");
      pageHost.className = "octave-pdf-page";
      pageHost.dataset.page = String(pageNumber);
      pageHost.dataset.zoom = String(zoom);
      pageHost.setAttribute("aria-label", `Página ${pageNumber}`);
      pageHost.style.width = `${viewport.width}px`;
      pageHost.style.height = `${viewport.height}px`;
      pageHost.style.setProperty("--total-scale-factor", String(viewport.scale));

      const canvas = document.createElement("canvas");
      canvas.className = "octave-pdf-canvas";
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      pageHost.append(canvas);

      const textHost = document.createElement("div");
      textHost.className = "octave-pdf-text-layer";
      textHost.setAttribute("aria-label", `Texto de la página ${pageNumber}`);
      pageHost.append(textHost);
      staging.append(pageHost);

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("No se pudo inicializar el canvas del PDF.");
      const textContent = await page.getTextContent({
        includeMarkedContent: true,
        disableNormalization: true,
      });
      if (disposed) return;
      const items = textContent.items.map(geometryFor).filter((item): item is ItemGeometry => item !== null);
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textHost,
        viewport,
      });
      textLayersRef.current.push(textLayer);
      const renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      renderTasksRef.current.push(renderTask);
      try {
        await Promise.all([renderTask.promise, textLayer.render()]);
        if (!disposed) {
          annotateTextLayer(page, textLayer, items);
          stabilizeTextLayer(textHost, textLayer);
        }
      } finally {
        // Only pending work belongs in the cancellation registries. Calling
        // RenderTask.cancel() after its promise resolved re-enters PDF.js'
        // completion callback and can surface a spurious cancellation.
        renderTasksRef.current = renderTasksRef.current.filter((task) => task !== renderTask);
        textLayersRef.current = textLayersRef.current.filter((candidate) => candidate !== textLayer);
      }
    };

    const renderDocument = async () => {
      try {
        const pages = await Promise.all(
          Array.from({ length: bundle.document.numPages }, (_, index) => bundle.document.getPage(index + 1)),
        );
        if (disposed) return;
        // map invokes renderPage in page order, so placeholders are appended in
        // deterministic order even though canvas renders finish concurrently.
        const results = await Promise.allSettled(pages.map((page, index) => renderPage(page, index + 1)));
        if (disposed) return;
        const failure = results.find((result): result is PromiseRejectedResult =>
          result.status === "rejected" && !isCancellation(result.reason));
        if (failure) {
          setError(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
          setLoading(false);
          staging.remove();
          return;
        }
        // Commit the fully rendered document in one DOM operation. The prior
        // canvases stay visible while PDF.js rasterizes the new scale, avoiding
        // the black flash caused by clearing the page host up front.
        pagesHost.replaceChildren(...Array.from(staging.children));
        setLoading(false);
        requestAnimationFrame(() => {
          const scroller = scrollerRef.current;
          const stored = pendingRestoreRef.current;
          if (!scroller || !stored) return;
          scroller.scrollTo({ left: stored.scrollLeft, top: stored.scrollTop, behavior: "instant" });
          pendingRestoreRef.current = { zoom: zoomRef.current, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
        });
      } catch (reason) {
        if (!disposed && !isCancellation(reason)) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      }
    };
    void renderDocument();

    return () => {
      disposed = true;
      cancelRendering();
      staging.remove();
    };
  }, [bundle, path, zoom, cancelRendering]);

  const changeZoom = useCallback((nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const next = clampZoom(nextZoom);
    const scroller = scrollerRef.current;
    const ratio = next / zoomRef.current;
    if (Math.abs(ratio - 1) < 0.001) return;
    const bounds = scroller?.getBoundingClientRect();
    const viewportX = bounds && anchor ? anchor.clientX - bounds.left : (scroller?.clientWidth ?? 0) / 2;
    const viewportY = bounds && anchor ? anchor.clientY - bounds.top : (scroller?.clientHeight ?? 0) / 2;
    pendingRestoreRef.current = {
      zoom: next,
      scrollTop: ((scroller?.scrollTop ?? 0) + viewportY) * ratio - viewportY,
      scrollLeft: ((scroller?.scrollLeft ?? 0) + viewportX) * ratio - viewportX,
    };
    // Give immediate visual feedback while the sharp canvases render in a
    // hidden staging layer. Each preview is based on its own rendered zoom, so
    // repeated wheel events cannot accumulate a stale transform.
    pagesRef.current?.querySelectorAll<HTMLElement>(":scope > .octave-pdf-page").forEach((page) => {
      const renderedZoom = finite(Number(page.dataset.zoom), zoomRef.current);
      page.style.transform = `scale(${next / renderedZoom})`;
      page.style.transformOrigin = "top center";
    });
    zoomRef.current = next;
    setZoom(next);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !active) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const factor = Math.exp(-event.deltaY * 0.002);
      changeZoom(zoomRef.current * factor, { clientX: event.clientX, clientY: event.clientY });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [active, changeZoom]);

  const fitWidth = useCallback(async () => {
    const scroller = scrollerRef.current;
    if (!bundle || bundle.path !== path || !scroller) return;
    const firstPage = await bundle.document.getPage(1);
    const naturalWidth = firstPage.getViewport({ scale: 1 }).width;
    const availableWidth = Math.max(1, scroller.clientWidth - 34);
    changeZoom(availableWidth / naturalWidth);
  }, [bundle, path, changeZoom]);

  const onCopy = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !event.currentTarget.contains(selection.anchorNode)) return;
    const payload = richSelectionPayload(event.currentTarget, selection);
    if (!payload.html) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", payload.plain);
    event.clipboardData.setData("text/html", payload.html);
  }, []);

  return (
    <div
      className={`octave-pdf-viewer${active ? " active" : ""}`}
      aria-hidden={!active}
      onCopy={onCopy}
    >
      <div className="octave-pdf-controls" role="toolbar" aria-label="Zoom del PDF">
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => changeZoom(zoom / ZOOM_STEP)} aria-label="Alejar" title="Alejar">
          <Minus size={15} aria-hidden="true" />
        </button>
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => void fitWidth()} aria-label="Ajustar al ancho" title="Ajustar al ancho">
          <Maximize2 size={14} aria-hidden="true" />
        </button>
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => changeZoom(zoom * ZOOM_STEP)} aria-label="Acercar" title="Acercar">
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
      <div ref={scrollerRef} className="octave-pdf-scroll" tabIndex={active ? 0 : -1} aria-label="Documento PDF">
        <div ref={pagesRef} className="octave-pdf-pages" />
      </div>
      {loading && <div className="octave-pdf-loading" role="status" aria-label="Cargando PDF" />}
      {error && <div className="octave-pdf-error" role="alert">{error}</div>}
    </div>
  );
}
