import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Printer, type PrinterStatus } from "./printer/bluetooth";
import { convertToBits } from "./render/convert";
import { renderImage } from "./render/renderImage";
import { renderTest } from "./render/renderTest";
import { renderText } from "./render/renderText";
import type { RenderedPrint } from "./render/types";

type Mode = "text" | "image" | "test";
type FontOption = '"Helvetica Neue", Arial, sans-serif' | 'Georgia, "Times New Roman", serif' | 'Menlo, "Courier New", monospace';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printerRef = useRef<Printer | null>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [font, setFont] = useState<FontOption>('"Helvetica Neue", Arial, sans-serif');
  const [size, setSize] = useState(32);
  const [bold, setBold] = useState(false);
  const [centered, setCentered] = useState(false);
  const [darkness, setDarkness] = useState<1 | 2 | 3 | 4>(4);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [current, setCurrent] = useState<RenderedPrint | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<{ state: PrinterStatus; label: string }>({ state: "", label: "Not connected" });
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [printing, setPrinting] = useState(false);

  if (!printerRef.current) {
    printerRef.current = new Printer({
      onStatus: (state, label) => setStatus({ state, label }),
      onMessage: (value, error = false) => { setMessage(value); setMessageError(Boolean(error)); },
      onConnectionChange: setConnected,
    });
  }

  useEffect(() => {
    const src = mode === "text"
      ? renderText({ text, size, bold, font, centered })
      : mode === "image" ? renderImage(image) : renderTest(darkness);
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
  }, [mode, text, size, bold, font, centered, darkness, image]);

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
          <h1>Printy</h1>
          <div className="status"><span className={`led ${status.state}`} id="led"></span><span id="statusText">{status.label}</span></div>
        </header>

        <div className="slot">
          <div className="paper">
            <canvas className="preview" id="preview" ref={canvasRef} width="384" height="1"></canvas>
            {!current && <div className="empty" id="empty">Type something or pick an image to see it here.</div>}
          </div>
        </div>

        <section className="controls">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>Text</button>
            <button role="tab" aria-selected={mode === "image"} onClick={() => setMode("image")}>Image</button>
            <button role="tab" aria-selected={mode === "test"} onClick={() => setMode("test")}>Test strip</button>
          </div>

          <div id="testPanel" hidden={mode !== "test"}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 15 }}>Prints 11 bands from 0% (white) to 100% (black). The darkness setting is printed at the top, so you can print a few and compare them.</p>
          </div>

          <div id="textPanel" hidden={mode !== "text"}>
            <label htmlFor="text">Text</label>
            <textarea id="text" value={text} onChange={(event) => setText(event.target.value)} />
            <div className="row" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="font">Font</label>
                <select id="font" value={font} onChange={(event) => setFont(event.target.value as FontOption)}>
                  <option value='"Helvetica Neue", Arial, sans-serif'>Sans</option>
                  <option value='Georgia, "Times New Roman", serif'>Serif</option>
                  <option value='Menlo, "Courier New", monospace'>Mono</option>
                </select>
              </div>
              <div>
                <label htmlFor="size">Size</label>
                <select id="size" value={size} onChange={(event) => setSize(Number(event.target.value))}>
                  <option value="24">Small</option>
                  <option value="32">Medium</option>
                  <option value="44">Large</option>
                  <option value="64">Huge</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <label className="check"><input type="checkbox" id="bold" checked={bold} onChange={(event) => setBold(event.target.checked)} /> Bold</label>
              <label className="check"><input type="checkbox" id="center" checked={centered} onChange={(event) => setCentered(event.target.checked)} /> Centered</label>
            </div>
          </div>

          <div id="imagePanel" hidden={mode !== "image"}>
            <label className="file">Choose image<input type="file" id="file" accept="image/*" onChange={chooseImage} /></label>
            <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 15 }}>Prints in pure black and white. For crisp results, use an image already dithered at 384 pixels wide.</p>
          </div>

          <div className="range">
            <div className="range-head"><span>Darkness</span><span id="darkVal">{darkness}</span></div>
            <input type="range" id="dark" min="1" max="4" value={darkness} step="1" onChange={(event) => setDarkness(Number(event.target.value) as 1 | 2 | 3 | 4)} />
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
    </>
  );
}
