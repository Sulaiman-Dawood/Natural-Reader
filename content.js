// Natural Reader page helper. It is injected only when reading starts, never on its own.
// It collects the text to read (the selection, or the page's main content) and remembers where
// every character came from, so the sentence being read can be underlined. The underline uses
// the CSS Custom Highlight API, so the page's own HTML is never changed.
(() => {
  if (window.__naturalReader) return;

  const MAX_CHARS = 20000;
  const HIGHLIGHT = "natural-reader";
  const PAGE_SKIP =
    "nav,footer,aside,script,style,noscript,template,button,select,textarea,svg,math," +
    "[aria-hidden='true'],[role='navigation'],[role='banner'],[role='complementary'],[role='contentinfo']";
  const ALWAYS_SKIP = "script,style,noscript,template,select,textarea";
  const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,figcaption,dt,dd,div";

  // The text being read, as pieces: text[start + i] came from node.nodeValue[offsets[i]].
  let map = [];
  // True while this frame's text is being read: clicks on it then jump the reading there.
  let active = false;

  // Builds the text to read: whitespace collapsed, one line per block, and a map back to the page.
  function textBuilder() {
    let text = "", lastBlock = null;
    const pieces = [];
    const endLine = () => {
      if (text.endsWith(" ")) {
        text = text.slice(0, -1);
        const last = pieces[pieces.length - 1];
        last.offsets.pop();
        if (!last.offsets.length) pieces.pop();
      }
      if (text && !text.endsWith("\n")) text += "\n";
    };
    return {
      add(node, from, to) {
        const el = node.parentElement;
        const block = el.closest(BLOCKS) || el;
        if (block !== lastBlock) endLine();
        lastBlock = block;
        const src = node.nodeValue, offsets = [];
        let out = "";
        for (let i = from; i < to; i++) {
          if (/\s/.test(src[i])) {
            const prev = out ? out[out.length - 1] : text[text.length - 1];
            if (prev === undefined || prev === " " || prev === "\n") continue;
            out += " ";
          } else {
            out += src[i];
          }
          offsets.push(i);
        }
        if (out) {
          pieces.push({ start: text.length, node, offsets });
          text += out;
        }
      },
      finish() {
        endLine();
        text = text.replace(/\n$/, "");
        if (text.length > MAX_CHARS) {
          let cut = text.lastIndexOf("\n", MAX_CHARS);
          if (cut < MAX_CHARS / 2) cut = MAX_CHARS;
          text = text.slice(0, cut);
          while (pieces.length && pieces[pieces.length - 1].start >= cut) pieces.pop();
          const last = pieces[pieces.length - 1];
          if (last) last.offsets.length = Math.min(last.offsets.length, cut - last.start);
        }
        return { text, pieces };
      }
    };
  }

  const visible = (el) => el.getClientRects().length > 0;

  function pageText() {
    if (!document.body) return { text: "", pieces: [] };
    const candidates = [...document.querySelectorAll("article,main,[role='main']")];
    let root = document.body;
    if (candidates.length) {
      const best = candidates.reduce((a, b) => (b.textContent.length > a.textContent.length ? b : a));
      if (best.textContent.trim().length > 500) root = best;
    }
    // Skip real forms (search, login, comments), but not a <form> that wraps the whole page,
    // which some sites (ASP.NET WebForms) do.
    const rootLen = root.textContent.length || 1;
    const smallForm = new Map();
    const isSmallForm = (f) => {
      if (!smallForm.has(f)) smallForm.set(f, !f.contains(root) && f.textContent.length < rootLen / 2);
      return smallForm.get(f);
    };
    // A <header> is page chrome (logo, menu) unless it belongs to an article or section,
    // where it usually holds the headline.
    const isPageHeader = (h) => !h.closest("article,main,section,[role='main']");
    const out = textBuilder();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const el = n.parentElement;
        if (!el || !n.nodeValue.trim() || el.closest(PAGE_SKIP) || !visible(el)) return NodeFilter.FILTER_REJECT;
        const form = el.closest("form");
        if (form && isSmallForm(form)) return NodeFilter.FILTER_REJECT;
        const header = el.closest("header");
        if (header && isPageHeader(header)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.add(n, 0, n.nodeValue.length);
    return out.finish();
  }

  function selectedText(range) {
    let root = range.commonAncestorContainer;
    if (root.nodeType !== Node.ELEMENT_NODE) root = root.parentNode;
    const out = textBuilder();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const el = n.parentElement;
        if (!el || !range.intersectsNode(n) || el.closest(ALWAYS_SKIP) || !visible(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const from = n === range.startContainer ? range.startOffset : 0;
      const to = n === range.endContainer ? range.endOffset : n.nodeValue.length;
      out.add(n, from, to);
    }
    return out.finish();
  }

  // Returns { text, mapped }. With selectionOnly, frames without a selection return no text.
  function collect({ selectionOnly = false } = {}) {
    clear();
    map = [];
    active = false;
    const sel = getSelection();
    const selected = sel && sel.rangeCount && !sel.isCollapsed ? String(sel).trim() : "";
    let result;
    if (selected) {
      result = selectedText(sel.getRangeAt(0));
      // Text selected inside a form field isn't in the page's text nodes: read it, no underline.
      if (!result.text.trim()) return { text: selected, mapped: false };
    } else if (selectionOnly) {
      return { text: "", mapped: false };
    } else {
      result = pageText();
    }
    map = result.pieces;
    return { text: result.text, mapped: map.length > 0 };
  }

  // Index of the first piece that ends after text position `pos`.
  function pieceAt(pos) {
    let lo = 0, hi = map.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (map[mid].start + map[mid].offsets.length <= pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // A DOM Range covering text positions [start, end).
  function rangeFor(start, end) {
    const i = pieceAt(start);
    let j = Math.min(pieceAt(end - 1), map.length - 1);
    if (j >= 0 && map[j].start > end - 1) j--; // end fell on a line break: use the piece before it
    const a = map[i], b = map[j];
    if (!a || !b || j < i || !a.node.isConnected || !b.node.isConnected) return null;
    const r = document.createRange();
    r.setStart(a.node, a.offsets[Math.max(0, start - a.start)]);
    r.setEnd(b.node, b.offsets[Math.min(end - 1 - b.start, b.offsets.length - 1)] + 1);
    return r;
  }

  // Text position of a point on the screen, or null if it isn't in the text being read.
  function posFromPoint(x, y) {
    let node, offset;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const piece = map.find((p) => p.node === node);
    if (!piece) return null;
    const i = piece.offsets.findIndex((o) => o >= offset);
    return piece.start + (i < 0 ? piece.offsets.length - 1 : i);
  }

  document.addEventListener("click", (e) => {
    if (!active || e.button !== 0 || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest("a,button,input,textarea,select,label,summary,video,audio,[contenteditable],[role='button'],[role='link']")) return;
    if (String(getSelection()).trim()) return; // the user is selecting text, not jumping
    const pos = posFromPoint(e.clientX, e.clientY);
    if (pos != null) chrome.runtime.sendMessage({ target: "background", type: "seek", pos }).catch(() => {});
  }, true);

  // show: false keeps the reading active (for clicks) without drawing the underline.
  function underline(start, end, follow, show = true) {
    active = map.length > 0;
    if (!show) return clear();
    if (!map.length || !window.CSS || !CSS.highlights || typeof Highlight === "undefined") return;
    let r = null;
    try { r = rangeFor(start, end); } catch (e) { /* the page changed under us */ }
    if (!r) return clear();
    CSS.highlights.set(HIGHLIGHT, new Highlight(r));
    if (follow) {
      const box = r.getBoundingClientRect();
      if (box.height && (box.top < 64 || box.bottom > innerHeight - 64)) {
        const el = r.startContainer.parentElement;
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  function clear() {
    if (window.CSS && CSS.highlights) CSS.highlights.delete(HIGHLIGHT);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.target !== "page") return;
    if (msg.type === "underline") underline(msg.start, msg.end, msg.follow, msg.show !== false);
    else if (msg.type === "clear") { active = false; clear(); }
  });

  window.__naturalReader = { collect, rangeFor, posFromPoint };
})();
