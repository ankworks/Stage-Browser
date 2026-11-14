/// <reference lib="dom" />
/**
 * Website markup preload.
 *
 * This runs in the isolated world before every website document. It paints a
 * Shadow-DOM canvas above the page so pen/marker/highlighter strokes can live
 * over a native `WebContentsView` (DOM in the shell would sit underneath it).
 *
 * The page never receives a bridge: the layer only listens to main's `stage:ink`
 * channel and asks main to close it. Everything else stays inside this world.
 */

import { ipcRenderer } from 'electron';

type Tool = 'pen' | 'marker' | 'highlighter' | 'eraser';

interface Stroke {
  tool: Exclude<Tool, 'eraser'>;
  color: string;
  width: number;
  opacity: number;
  points: number[];
}

interface InkMessage {
  on?: boolean;
  color?: string;
  size?: number;
}

const HOST_ID = 'stage-ink-layer';
const COLORS = ['#ff6b6b', '#ffd166', '#66e0a3', '#6ea8ff', '#b28dff', '#f4f7ff', '#151821'];

let active = false;
let mounted = false;
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let toolbar: HTMLDivElement | null = null;
let color = '#ff6b6b';
let size = 3;
let tool: Tool = 'pen';
let strokes: Stroke[] = [];
let redoStack: Stroke[][] = [];
let history: Stroke[][] = [];
let live: Stroke | null = null;
let raf = 0;

const toolButtons = new Map<Tool, HTMLButtonElement>();
const colorButtons = new Map<string, HTMLButtonElement>();
let undoButton: HTMLButtonElement | null = null;
let redoButton: HTMLButtonElement | null = null;

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */

function styleEl(el: HTMLElement, rules: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, rules);
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.title = title;
  el.setAttribute('aria-label', title);
  styleEl(el, {
    width: '30px',
    height: '30px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '8px',
    border: '0',
    background: 'transparent',
    color: '#dbe4f5',
    font: '600 15px/1 "Segoe UI", system-ui, sans-serif',
    cursor: 'pointer',
    padding: '0',
    transition: 'background 110ms linear, color 110ms linear',
  });
  el.addEventListener('mouseenter', () => {
    if (el.dataset.active !== '1') el.style.background = 'rgba(255,255,255,.08)';
  });
  el.addEventListener('mouseleave', () => {
    if (el.dataset.active !== '1') el.style.background = 'transparent';
  });
  el.addEventListener('pointerdown', (event) => {
    // Keep the page from seeing toolbar clicks as canvas gestures.
    event.preventDefault();
    event.stopPropagation();
  });
  el.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return el;
}

function svgIcon(paths: string[], size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function iconButton(paths: string[], title: string, onClick: () => void, size = 16): HTMLButtonElement {
  const el = button('', title, onClick);
  el.appendChild(svgIcon(paths, size));
  return el;
}

function setButtonActive(el: HTMLButtonElement, on: boolean): void {
  el.dataset.active = on ? '1' : '0';
  el.style.background = on ? '#2a3a5c' : 'transparent';
  el.style.color = on ? '#ffffff' : '#dbe4f5';
}

function divider(): HTMLSpanElement {
  const el = document.createElement('span');
  styleEl(el, {
    width: '1px',
    height: '20px',
    background: 'rgba(255,255,255,.14)',
    margin: '0 3px',
    flex: '0 0 auto',
  });
  return el;
}

function labelChip(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  styleEl(el, {
    padding: '0 7px',
    color: '#93a2bd',
    font: '700 9.5px/30px "Segoe UI", system-ui, sans-serif',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  });
  return el;
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

function buildLayer(): void {
  if (mounted || !document.documentElement) return;
  mounted = true;

  host = document.createElement('div');
  host.id = HOST_ID;
  styleEl(host, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    display: 'none',
    pointerEvents: 'none',
    contain: 'strict',
  });
  shadow = host.attachShadow({ mode: 'closed' });

  canvas = document.createElement('canvas');
  styleEl(canvas, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'auto',
    cursor: 'crosshair',
    touchAction: 'none',
  });
  shadow.appendChild(canvas);
  ctx = canvas.getContext('2d');

  toolbar = document.createElement('div');
  styleEl(toolbar, {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    maxWidth: 'min(94vw, 760px)',
    overflowX: 'auto',
    padding: '5px 7px',
    borderRadius: '13px',
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(13,17,27,.94)',
    boxShadow: '0 18px 44px rgba(0,0,0,.42)',
    pointerEvents: 'auto',
    userSelect: 'none',
  });
  shadow.appendChild(toolbar);

  const tools: { id: Tool; ic: string[]; title: string }[] = [
    {
      id: 'pen',
      title: 'Pen',
      ic: ['M4 20l2.5-.6 10.6-10.6-2-2L4.6 17.4z', 'M15.2 4.3l1.6-1.6a1.8 1.8 0 012.5 2.5l-1.6 1.6'],
    },
    {
      id: 'marker',
      title: 'Marker',
      ic: ['M9.5 11.5L4 17v3h3l5.5-5.5', 'M13.5 7.5l4 4 3-3-4-4z'],
    },
    {
      id: 'highlighter',
      title: 'Highlighter',
      ic: ['M3.5 20.5l3.2-.8L19 7.4l-2.6-2.6L4.3 17.3z', 'M14 6l3.4 3.4'],
    },
    {
      id: 'eraser',
      title: 'Eraser',
      ic: ['M20 20H8.6L3.5 14.9 13 5.4l6.1 6.1-6.4 6.4', 'M9.6 14.1l4.6-4.6'],
    },
  ];
  toolbar.appendChild(labelChip('Markup'));
  for (const item of tools) {
    const el = iconButton(item.ic, item.title, () => {
      tool = item.id;
      syncToolbar();
      if (canvas) canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    });
    toolButtons.set(item.id, el);
    toolbar.appendChild(el);
  }

  toolbar.appendChild(divider());
  for (const swatch of COLORS) {
    const el = button('', `Ink ${swatch}`, () => {
      color = swatch;
      syncToolbar();
    });
    styleEl(el, {
      width: '20px',
      height: '20px',
      minWidth: '20px',
      borderRadius: '999px',
      background: swatch,
      border: '2px solid transparent',
      boxShadow: swatch === '#f4f7ff' ? 'inset 0 0 0 1px rgba(0,0,0,.3)' : 'none',
    });
    el.addEventListener('mouseenter', () => {
      el.style.transform = 'scale(1.12)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
    colorButtons.set(swatch, el);
    toolbar.appendChild(el);
  }

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '1';
  range.max = '14';
  range.step = '1';
  range.value = String(size);
  range.title = 'Stroke size';
  range.setAttribute('aria-label', 'Stroke size');
  styleEl(range, {
    width: '78px',
    margin: '0 4px',
    accentColor: color,
    cursor: 'pointer',
    background: 'transparent',
  });
  range.addEventListener('input', () => {
    size = Number(range.value) || 3;
  });
  range.addEventListener('pointerdown', (event) => event.stopPropagation());
  toolbar.appendChild(range);

  toolbar.appendChild(divider());
  undoButton = iconButton(['M9 7H4.5V2.5', 'M4.5 7.5A8 8 0 1112 20'], 'Undo (Ctrl+Z)', () => undo());
  redoButton = iconButton(['M15 7h4.5V2.5', 'M19.5 7.5A8 8 0 1012 20'], 'Redo (Ctrl+Shift+Z)', () => redo());
  const clearButton = iconButton(
    ['M4 7h16', 'M9.5 7V4.8h5V7', 'M6 7l1 12.2h10L18 7'],
    'Clear markup',
    () => clearAll(),
  );
  const closeButton = iconButton(['M5 5l14 14', 'M19 5L5 19'], 'Finish markup (Esc)', () => closeLayer(), 15);
  toolbar.appendChild(undoButton);
  toolbar.appendChild(redoButton);
  toolbar.appendChild(clearButton);
  toolbar.appendChild(closeButton);

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('keydown', onKey, true);

  document.documentElement.appendChild(host);
  resize();
  syncToolbar();
  setActive(active);
}

function onResize(): void {
  if (!active) return;
  resize();
}

function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const wantW = Math.round(w * dpr);
  const wantH = Math.round(h * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  repaint();
}

/* ------------------------------------------------------------------ *
 * Activation
 * ------------------------------------------------------------------ */

function setActive(on: boolean): void {
  active = on;
  if (!host) {
    // Message arrived before the document was ready; remember it.
    if (on) whenReady(buildLayer);
    return;
  }
  host.style.display = on ? 'block' : 'none';
  host.style.pointerEvents = on ? 'auto' : 'none';
  if (on) {
    resize();
    syncToolbar();
    window.focus();
    canvas?.focus?.();
  } else {
    live = null;
    if (canvas) {
      try {
        for (const pointerId of [1, 2, 3, 4]) canvas.releasePointerCapture(pointerId);
      } catch {
        /* no captured pointer */
      }
    }
  }
}

function closeLayer(): void {
  setActive(false);
  ipcRenderer.send('stage:ink-close');
}

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/* ------------------------------------------------------------------ *
 * Toolbar state
 * ------------------------------------------------------------------ */

function syncToolbar(): void {
  for (const [id, el] of toolButtons) setButtonActive(el, id === tool);
  for (const [swatch, el] of colorButtons) {
    el.dataset.active = swatch === color ? '1' : '0';
    el.style.borderColor = swatch === color ? '#ffffff' : 'transparent';
    el.style.boxShadow =
      swatch === color
        ? '0 0 0 2px rgba(255,255,255,.22)'
        : swatch === '#f4f7ff'
          ? 'inset 0 0 0 1px rgba(0,0,0,.3)'
          : 'none';
  }
  if (undoButton) {
    undoButton.disabled = history.length === 0;
    undoButton.style.opacity = history.length ? '1' : '.32';
  }
  if (redoButton) {
    redoButton.disabled = redoStack.length === 0;
    redoButton.style.opacity = redoStack.length ? '1' : '.32';
  }
  const range = toolbar?.querySelector<HTMLInputElement>('input[type="range"]');
  if (range) range.value = String(size);
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function widthFor(kind: Tool): number {
  if (kind === 'marker') return size * 2.2;
  if (kind === 'highlighter') return size * 4.3;
  if (kind === 'eraser') return size * 3;
  return size;
}

function opacityFor(kind: Tool): number {
  if (kind === 'highlighter') return 0.34;
  if (kind === 'marker') return 0.68;
  return 1;
}

function pointFrom(event: PointerEvent): { x: number; y: number } {
  // Store document coordinates so strokes travel with the article when the
  // page scrolls. The canvas itself stays fixed over the viewport.
  return {
    x: event.clientX + window.scrollX,
    y: event.clientY + window.scrollY,
  };
}

function down(event: PointerEvent): void {
  if (!active || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const p = pointFrom(event);
  canvas?.setPointerCapture(event.pointerId);

  if (tool === 'eraser') {
    history.push(strokes.slice());
    redoStack = [];
    eraseAt(p.x, p.y);
    return;
  }

  history.push(strokes.slice());
  redoStack = [];
  live = {
    tool,
    color,
    width: widthFor(tool),
    opacity: opacityFor(tool),
    points: [p.x, p.y],
  };
  schedule();
}

function move(event: PointerEvent): void {
  if (!active || (!live && tool !== 'eraser') || event.buttons !== 1) return;
  event.preventDefault();
  event.stopPropagation();

  if (tool === 'eraser') {
    const p = pointFrom(event);
    eraseAt(p.x, p.y);
    return;
  }
  if (!live) return;

  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  for (const sample of coalesced.length ? coalesced : [event]) {
    const p = pointFrom(sample as PointerEvent);
    const lastX = live.points[live.points.length - 2];
    const lastY = live.points[live.points.length - 1];
    if (Math.hypot(p.x - lastX, p.y - lastY) < 1.2) continue;
    live.points.push(p.x, p.y);
  }
  schedule();
}

function up(event: PointerEvent): void {
  if (!active) return;
  event.preventDefault();
  event.stopPropagation();
  try {
    canvas?.releasePointerCapture(event.pointerId);
  } catch {
    /* pointer already released */
  }
  if (live) {
    if (live.points.length === 2) live.points.push(live.points[0] + 0.1, live.points[1]);
    strokes.push(live);
    live = null;
  }
  schedule();
  syncToolbar();
}

function eraseAt(x: number, y: number): void {
  const radius = Math.max(8, widthFor('eraser'));
  const kept = strokes.filter((stroke) => !strokeHit(stroke, x, y, radius));
  if (kept.length !== strokes.length) {
    strokes = kept;
    schedule();
    syncToolbar();
  }
}

function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.width / 2;
  for (let i = 0; i + 3 < stroke.points.length; i += 2) {
    if (
      distToSegment(x, y, stroke.points[i], stroke.points[i + 1], stroke.points[i + 2], stroke.points[i + 3]) <=
      reach
    ) {
      return true;
    }
  }
  return false;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function schedule(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    repaint();
  });
}

function repaint(): void {
  if (!ctx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-window.scrollX, -window.scrollY);
  for (const stroke of strokes) drawStroke(ctx, stroke);
  if (live) drawStroke(ctx, live);
  ctx.restore();
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points;
  if (points.length < 2) return;
  context.save();
  context.globalAlpha = stroke.opacity;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.width;
  if (stroke.tool === 'highlighter') context.globalCompositeOperation = 'source-over';
  if (points.length === 2) {
    context.beginPath();
    context.arc(points[0], points[1], Math.max(0.5, stroke.width / 2), 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(points[0], points[1]);
    for (let i = 2; i + 1 < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
    context.stroke();
  }
  context.restore();
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function undo(): void {
  if (!history.length) return;
  redoStack.push(strokes.slice());
  strokes = history.pop() ?? [];
  live = null;
  schedule();
  syncToolbar();
}

function redo(): void {
  if (!redoStack.length) return;
  history.push(strokes.slice());
  strokes = redoStack.pop() ?? [];
  live = null;
  schedule();
  syncToolbar();
}

function clearAll(): void {
  if (!strokes.length) return;
  history.push(strokes.slice());
  redoStack = [];
  strokes = [];
  live = null;
  schedule();
  syncToolbar();
}

/* ------------------------------------------------------------------ *
 * Keyboard
 * ------------------------------------------------------------------ */

function onKey(event: KeyboardEvent): void {
  if (!active) return;
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    event.preventDefault();
    event.stopPropagation();
    closeLayer();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) redo();
    else undo();
  }
}

/* ------------------------------------------------------------------ *
 * Boot + main channel
 * ------------------------------------------------------------------ */

ipcRenderer.on('stage:ink', (_event, message: InkMessage) => {
  if (typeof message?.color === 'string' && /^#[0-9a-f]{6}$/i.test(message.color)) color = message.color;
  if (typeof message?.size === 'number' && Number.isFinite(message.size)) {
    size = Math.min(14, Math.max(1, message.size));
  }
  buildLayer();
  setActive(!!message?.on);
  syncToolbar();
});

whenReady(buildLayer);
