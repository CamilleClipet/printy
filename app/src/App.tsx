import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from "react";
import { Printer, type PrinterStatus } from "./printer/bluetooth";
import { convertToBits } from "./render/convert";
import { renderImage } from "./render/renderImage";
import { renderTest } from "./render/renderTest";
import { renderText } from "./render/renderText";
import type { RenderedPrint } from "./render/types";
import { addPadding, SPACING_LABELS, type Spacing } from "./render/padding";

type Mode = "text" | "image" | "test";
type FontOption = '"Helvetica Neue", Arial, sans-serif' | 'Georgia, "Times New Roman", serif' | 'Menlo, "Courier New", monospace';
type Align = "left" | "center" | "right";
const FONT_SIZES = [20, 22, 24, 26, 28, 30] as const;
const LINE_SPACINGS = [1, 1.5, 2] as const;
type LineSpacing = typeof LINE_SPACINGS[number];
const LINE_SPACING_LABELS: Record<LineSpacing, string> = { 1: "Normal", 1.5: "1.5", 2: "Double" };

type Draft = {
  text: string; font: FontOption; size: number; bold: boolean; italic: boolean;
  underline: boolean; strike: boolean; align: Align; rotated: boolean; lineSpacing: LineSpacing;
  topSpace: Spacing; bottomSpace: Spacing; darkness: 1 | 2 | 3 | 4; mode: Mode;
};

const DEFAULT_DRAFT: Draft = {
  text: "", font: '"Helvetica Neue", Arial, sans-serif', size: 24, bold: false,
  italic: false, underline: false, strike: false, align: "left", rotated: false, lineSpacing: 1,
  topSpace: "small", bottomSpace: "small", darkness: 4, mode: "text",
};
const DRAFT_KEY = "printy-draft-v1";
const isSpacing = (value: unknown): value is Spacing => value === "small" || value === "medium" || value === "large";
const isFont = (value: unknown): value is FontOption => value === '"Helvetica Neue", Arial, sans-serif' || value === 'Georgia, "Times New Roman", serif' || value === 'Menlo, "Courier New", monospace';

function readDraft(): Draft {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!value || typeof value !== "object") return DEFAULT_DRAFT;
    const saved = value as Record<string, unknown>;
    return {
      text: typeof saved.text === "string" ? saved.text : DEFAULT_DRAFT.text,
      font: isFont(saved.font) ? saved.font : DEFAULT_DRAFT.font,
      size: typeof saved.size === "number" && (FONT_SIZES as readonly number[]).includes(saved.size) ? saved.size : DEFAULT_DRAFT.size,
      bold: typeof saved.bold === "boolean" ? saved.bold : DEFAULT_DRAFT.bold,
      italic: typeof saved.italic === "boolean" ? saved.italic : DEFAULT_DRAFT.italic,
      underline: typeof saved.underline === "boolean" ? saved.underline : DEFAULT_DRAFT.underline,
      strike: typeof saved.strike === "boolean" ? saved.strike : DEFAULT_DRAFT.strike,
      align: saved.align === "left" || saved.align === "center" || saved.align === "right" ? saved.align : DEFAULT_DRAFT.align,
      rotated: typeof saved.rotated === "boolean" ? saved.rotated : DEFAULT_DRAFT.rotated,
      lineSpacing: LINE_SPACINGS.includes(saved.lineSpacing as LineSpacing) ? saved.lineSpacing as LineSpacing : DEFAULT_DRAFT.lineSpacing,
      topSpace: isSpacing(saved.topSpace) ? saved.topSpace : DEFAULT_DRAFT.topSpace,
      bottomSpace: isSpacing(saved.bottomSpace) ? saved.bottomSpace : DEFAULT_DRAFT.bottomSpace,
      darkness: saved.darkness === 1 || saved.darkness === 2 || saved.darkness === 3 || saved.darkness === 4 ? saved.darkness : DEFAULT_DRAFT.darkness,
      mode: saved.mode === "text" || saved.mode === "image" || saved.mode === "test" ? saved.mode : DEFAULT_DRAFT.mode,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const pendingScrollToBottom = useRef(false);
  const draft = useRef<Draft | null>(null);
  if (!draft.current) draft.current = readDraft();
  const initial = draft.current;
  const printerRef = useRef<Printer | null>(null);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [text, setText] = useState(initial.text);
  const [font, setFont] = useState<FontOption>(initial.font);
  const [size, setSize] = useState(initial.size);
  const [bold, setBold] = useState(initial.bold);
  const [italic, setItalic] = useState(initial.italic);
  const [underline, setUnderline] = useState(initial.underline);
  const [strike, setStrike] = useState(initial.strike);
  const [align, setAlign] = useState<Align>(initial.align);
  const [rotated, setRotated] = useState(initial.rotated);
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(initial.lineSpacing);
  const [topSpace, setTopSpace] = useState<Spacing>(initial.topSpace);
  const [bottomSpace, setBottomSpace] = useState<Spacing>(initial.bottomSpace);
  const [fullScreen, setFullScreen] = useState(false);
  const [darkness, setDarkness] = useState<1 | 2 | 3 | 4>(initial.darkness);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [current, setCurrent] = useState<RenderedPrint | null>(null);
  const [actualSize, setActualSize] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<{ state: PrinterStatus; label: string }>({ state: "", label: "Not connected" });
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, font, size, bold, italic, underline, strike, align, rotated, lineSpacing, topSpace, bottomSpace, darkness, mode } satisfies Draft));
    } catch { /* Storage can be unavailable in private browsing; the editor still works. */ }
  }, [text, font, size, bold, italic, underline, strike, align, rotated, lineSpacing, topSpace, bottomSpace, darkness, mode]);

  useEffect(() => {
    if (!fullScreen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullScreen]);

  if (!printerRef.current) {
    printerRef.current = new Printer({
      onStatus: (state, label) => setStatus({ state, label }),
      onMessage: (value, error = false) => { setMessage(value); setMessageError(Boolean(error)); },
      onConnectionChange: setConnected,
    });
  }

  useEffect(() => {
    const textSource = mode === "text"
      ? renderText({ text, size, bold, italic, underline, strike, font, align, rotated, lineSpacing })
      : null;
    setActualSize(textSource?.size ?? null);
    const rawSource = mode === "text" ? textSource : mode === "image" ? renderImage(image) : renderTest(darkness);
    const src = rawSource && mode !== "test" ? addPadding(rawSource, topSpace, bottomSpace) : rawSource;
    const canvas = canvasRef.current;
    if (!src) {
      setCurrent(null);
      if (canvas) canvas.height = 1;
      return;
    }
    const rendered = convertToBits(src);
    setCurrent(rendered);
    if (!canvas) return;
    canvas.height = rendered.height;
    const ctx = canvas.getContext("2d")!;
    const out = ctx.createImageData(384, rendered.height);
    for (let i = 0; i < rendered.bits.length; i++) {
      const v = rendered.bits[i] ? 28 : 255;
      out.data.set([v, v, v, 255], i * 4);
    }
    ctx.putImageData(out, 0, 0);
    const fullCanvas = fullCanvasRef.current;
    if (fullCanvas) {
      fullCanvas.width = 384;
      fullCanvas.height = rendered.height;
      fullCanvas.getContext("2d")?.putImageData(out, 0, 0);
    }
    if (pendingScrollToBottom.current) {
      pendingScrollToBottom.current = false;
      requestAnimationFrame(() => {
        const paper = paperRef.current;
        if (paper) paper.scrollTop = paper.scrollHeight;
      });
    }
  }, [mode, text, size, bold, italic, underline, strike, font, align, rotated, lineSpacing, darkness, image, topSpace, bottomSpace]);

  useEffect(() => {
    if (!fullScreen) return;
    const fullCanvas = fullCanvasRef.current;
    const preview = canvasRef.current;
    if (!fullCanvas || !preview) return;
    fullCanvas.width = preview.width;
    fullCanvas.height = preview.height;
    fullCanvas.getContext("2d")?.drawImage(preview, 0, 0);
  }, [fullScreen]);

  useEffect(() => () => {
    if (image?.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  }, [image]);

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const loaded = new Image();
    loaded.onload = () => setImage(loaded);
    loaded.onerror = () => URL.revokeObjectURL(objectUrl);
    loaded.src = objectUrl;
  };

  const updateText = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value;
    const paper = paperRef.current;
    const wasAtBottom = Boolean(paper && paper.scrollHeight - paper.scrollTop - paper.clientHeight < 24);
    pendingScrollToBottom.current = nextText.length > text.length && wasAtBottom && document.activeElement === event.target;
    setText(nextText);
  };

  const connect = () => {
    if (connected && printerRef.current?.hasDevice) printerRef.current.disconnect();
    else void printerRef.current?.connect();
  };

  const print = async () => {
    if (!current || !connected || printing) return;
    setPrinting(true);
    try {
      await printerRef.current?.print(current.bits, current.height, darkness, (percent) => { setMessage(`Printing… ${percent}%`); setMessageError(false); });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <main>
        <header>
          <div className="title-group">
            <h1>Printy</h1>
            <div className="mode-tabs" role="tablist" aria-label="Mode">
              <button role="tab" aria-selected={mode === "text"} aria-label="Text" title="Text" onClick={() => setMode("text")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6V4h14v2M12 4v16M9 20h6" /></svg></button>
              <button role="tab" aria-selected={mode === "image"} aria-label="Image" title="Image" onClick={() => setMode("image")}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9.5" r="1.8" /><path d="m21 16-5-5-9 9" /></svg></button>
              <button role="tab" aria-selected={mode === "test"} aria-label="Settings" title="Settings" onClick={() => setMode("test")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg></button>
            </div>
          </div>
          <div className="status" title={status.label}><span className={`led ${status.state}`} id="led"></span><span id="statusText">{status.label}</span></div>
        </header>

        <div className="slot">
          <button className="preview-expand" aria-label="Full-screen preview" title="Full-screen preview" onClick={() => setFullScreen(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /></svg>
          </button>
          <div className="paper" ref={paperRef}>
            <canvas className="preview" id="preview" ref={canvasRef} width="384" height="1"></canvas>
            {!current && <div className="empty" id="empty">Type something or pick an image to see it here.</div>}
          </div>
        </div>

        <section className="controls">

          <div id="settingsPanel" hidden={mode !== "test"}>
            <div className="range">
              <div className="range-head"><span>Darkness</span><span id="darkVal">{darkness}</span></div>
              <input type="range" id="dark" min="1" max="4" value={darkness} step="1" onChange={(event) => setDarkness(Number(event.target.value) as 1 | 2 | 3 | 4)} />
            </div>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 15 }}>Test strip prints 11 bands from 0% (white) to 100% (black). Compare a few strips to find the darkness that looks best.</p>
          </div>

          <div id="textPanel" hidden={mode !== "text"}>
            <div>
              <div>
                <label htmlFor="font">Font</label>
                <select id="font" value={font} onChange={(event) => setFont(event.target.value as FontOption)}>
                  <option value='"Helvetica Neue", Arial, sans-serif'>Sans</option>
                  <option value='Georgia, "Times New Roman", serif'>Serif</option>
                  <option value='Menlo, "Courier New", monospace'>Mono</option>
                </select>
              </div>
            </div>
            <FormatToolbar bold={bold} italic={italic} underline={underline} strike={strike} align={align} rotated={rotated} size={size} onSize={setSize} lineSpacing={lineSpacing} onBold={() => setBold(!bold)} onItalic={() => setItalic(!italic)} onUnderline={() => setUnderline(!underline)} onStrike={() => setStrike(!strike)} onAlign={setAlign} onRotate={() => setRotated(!rotated)} onLineSpacing={setLineSpacing} />
            {actualSize !== null && actualSize < size && <p className="shrink-hint">Shrunk to {actualSize}px to fit the paper width.</p>}
            <textarea id="text" aria-label="Text to print" placeholder="Type something to print…" value={text} onChange={updateText} onFocus={revealTextarea} onBlur={() => document.body.classList.remove("typing")} />
          </div>

          <div id="imagePanel" hidden={mode !== "image"}>
            <label className="file">Choose image<input type="file" id="file" accept="image/*" onChange={chooseImage} /></label>
            <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 15 }}>Prints in pure black and white. For crisp results, use an image already dithered at 384 pixels wide.</p>
          </div>

        </section>
        <p className={`msg${messageError ? " err" : ""}`} id="msg">{message}</p>
      </main>

      <div className="bar">
        <div className="bar-inner">
          <button className="btn secondary" id="connectBtn" onClick={connect}>{connected ? "Disconnect" : "Connect"}</button>
          <button className="btn primary" id="printBtn" disabled={!connected || !current || printing} onClick={() => void print()}>Print</button>
        </div>
      </div>

      {fullScreen && <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Full-screen print preview" onClick={(event) => { if (event.target === event.currentTarget) setFullScreen(false); }}>
        <div className="preview-dialog">
          <div className="preview-dialog-head">
            <span>Print preview</span>
            <button className="close-preview" aria-label="Close full-screen preview" onClick={() => setFullScreen(false)}>×</button>
          </div>
          {mode === "text" && <FormatToolbar bold={bold} italic={italic} underline={underline} strike={strike} align={align} rotated={rotated} size={size} onSize={setSize} lineSpacing={lineSpacing} onBold={() => setBold(!bold)} onItalic={() => setItalic(!italic)} onUnderline={() => setUnderline(!underline)} onStrike={() => setStrike(!strike)} onAlign={setAlign} onRotate={() => setRotated(!rotated)} onLineSpacing={setLineSpacing} />}
          <div className="full-paper">{current ? <canvas ref={fullCanvasRef} className="full-preview" width="384" height="1" /> : <p className="empty">Nothing to preview yet.</p>}</div>
          <SpacingControl label="Top space" value={topSpace} onChange={setTopSpace} />
          <SpacingControl label="Bottom space" value={bottomSpace} onChange={setBottomSpace} />
        </div>
      </div>}
    </>
  );
}

function FormatToolbar({ size, onSize, bold, italic, underline, strike, align, rotated, lineSpacing, onBold, onItalic, onUnderline, onStrike, onAlign, onRotate, onLineSpacing }: {
  size: number; onSize: (size: number) => void;
  bold: boolean; italic: boolean; underline: boolean; strike: boolean; align: Align; rotated: boolean; lineSpacing: LineSpacing;
  onBold: () => void; onItalic: () => void; onUnderline: () => void; onStrike: () => void;
  onAlign: (align: Align) => void; onRotate: () => void; onLineSpacing: (spacing: LineSpacing) => void;
}) {
  const [openMenu, setOpenMenu] = useState<"size" | "align" | "spacing" | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenMenu(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const alignIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><path d={align === "left" ? "M4 6h16M4 10h10M4 14h16M4 18h10" : align === "center" ? "M4 6h16M7 10h10M4 14h16M7 18h10" : "M4 6h16M10 10h10M4 14h16M10 18h10"} /></svg>;
  const toggle = (menu: "size" | "align" | "spacing") => setOpenMenu((current) => current === menu ? null : menu);

  return <div className="toolbar" role="toolbar" aria-label="Text formatting" ref={toolbarRef}>
    <div className="toolbar-menu-wrap">
      <button type="button" className="toolbar-menu-trigger size-trigger" aria-label={`Font size: ${size}px`} aria-haspopup="menu" aria-expanded={openMenu === "size"} onClick={() => toggle("size")}><span className="size-value">{size}</span><svg className="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg></button>
      {openMenu === "size" && <div className="toolbar-popover size-popover" role="menu" aria-label="Font size">{FONT_SIZES.map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={size === option} onClick={() => { onSize(option); setOpenMenu(null); }}><span>{option}px</span>{size === option && <span className="menu-check" aria-hidden="true">✓</span>}</button>)}</div>}
    </div>
    <span className="toolbar-divider" aria-hidden="true" />
    <button type="button" aria-label="Bold" aria-pressed={bold} onClick={onBold}><strong>B</strong></button>
    <button type="button" aria-label="Italic" aria-pressed={italic} onClick={onItalic}><em>I</em></button>
    <button type="button" aria-label="Underline" aria-pressed={underline} onClick={onUnderline}><u>U</u></button>
    <button type="button" aria-label="Strikethrough" aria-pressed={strike} onClick={onStrike}><s>S</s></button>
    <span className="toolbar-divider" aria-hidden="true" />
    <div className="toolbar-menu-wrap">
      <button type="button" className="toolbar-menu-trigger" aria-label={`Alignment: ${align}`} aria-haspopup="menu" aria-expanded={openMenu === "align"} onClick={() => toggle("align")}>{alignIcon}<svg className="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg></button>
      {openMenu === "align" && <div className="toolbar-popover align-popover" role="menu" aria-label="Text alignment">{(["left", "center", "right"] as Align[]).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={align === option} onClick={() => { onAlign(option); setOpenMenu(null); }}><AlignIcon align={option} /><span>{option[0].toUpperCase() + option.slice(1)}</span>{align === option && <span className="menu-check" aria-hidden="true">✓</span>}</button>)}</div>}
    </div>
    <div className="toolbar-menu-wrap spacing-menu-wrap">
      <button type="button" className="toolbar-menu-trigger" aria-label={`Line spacing: ${LINE_SPACING_LABELS[lineSpacing]}`} aria-haspopup="menu" aria-expanded={openMenu === "spacing"} onClick={() => toggle("spacing")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h12M8 12h12M8 19h12M4 8V4m0 0L2 6m2-2 2 2m-2 8v8m0 0-2-2m2 2 2-2" /></svg><svg className="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg></button>
      {openMenu === "spacing" && <div className="toolbar-popover spacing-popover" role="menu" aria-label="Line spacing">{LINE_SPACINGS.map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={lineSpacing === option} onClick={() => { onLineSpacing(option); setOpenMenu(null); }}><span>{LINE_SPACING_LABELS[option]}</span>{lineSpacing === option && <span className="menu-check" aria-hidden="true">✓</span>}</button>)}</div>}
    </div>
    <button type="button" aria-label="Rotate 90 degrees" aria-pressed={rotated} onClick={onRotate}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5" /></svg></button>
  </div>;
}

function AlignIcon({ align }: { align: Align }) {
  const d = align === "left" ? "M4 6h16M4 10h10M4 14h16M4 18h10" : align === "center" ? "M4 6h16M7 10h10M4 14h16M7 18h10" : "M4 6h16M10 10h10M4 14h16M10 18h10";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
}

function SpacingControl({ label, value, onChange }: { label: string; value: Spacing; onChange: (value: Spacing) => void }) {
  return <div className="spacing-control"><span className="spacing-label">{label}</span><div className="segments" role="group" aria-label={`${label} blank space`}>{(Object.keys(SPACING_LABELS) as Spacing[]).map((spacing) => <button key={spacing} type="button" aria-label={`${label} ${SPACING_LABELS[spacing].toLowerCase()} blank space`} aria-pressed={value === spacing} onClick={() => onChange(spacing)}>{spacing === "medium" ? "Med" : SPACING_LABELS[spacing]}</button>)}</div></div>;
}

// iOS doesn't shrink the layout viewport for the keyboard, so scroll the
// textarea into the *visible* area once the keyboard has opened.
function revealTextarea(event: FocusEvent<HTMLTextAreaElement>) {
  const el = event.currentTarget;
  // Hide the action bar and give the page room below so it can actually scroll
  // the textarea above the keyboard (the page was already at its max scroll).
  document.body.classList.add("typing");
  const reveal = () => {
    const vv = window.visualViewport;
    const visibleTop = (vv?.offsetTop ?? 0) + 12;
    void visibleTop;
    let visibleBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
    const barTop = document.querySelector(".bar")?.getBoundingClientRect().top;
    if (barTop !== undefined && barTop < visibleBottom) visibleBottom = barTop - 12; // bar visible above keyboard
    const rect = el.getBoundingClientRect();
    void rect;
    // Align the textarea's bottom with the bottom of the visible area (scrolling
    // back up if iOS overshot), but never push its top out of view.
    // const delta = Math.min(rect.bottom - visibleBottom, rect.top - visibleTop);
    const delta = 50;
    if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "smooth" });
  };
  // iOS keeps adjusting the scroll while the keyboard animates in, so correct
  // once the viewport has resized and again after the animation settles.
  const vv = window.visualViewport;
  const onResize = () => requestAnimationFrame(reveal);
  vv?.addEventListener("resize", onResize, { once: true });
  window.setTimeout(reveal, 300);
}
