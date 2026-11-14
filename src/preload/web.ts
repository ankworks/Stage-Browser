/// <reference lib="dom" />
/**
 * Website markup preload.
 *
 * This runs in the isolated world before every website document. It paints a
 * Shadow-DOM canvas above the page so pen/marker/highlighter/shape/text/number
 * annotations and a laser pointer can live over a native `WebContentsView`.
 *
 * The page never receives a bridge: the layer only listens to main's `stage:ink`
 * channel and asks main to close or save a screenshot.
 */

import { ipcRenderer } from 'electron';

type Tool =
  | 'pen'
  | 'marker'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'number'
  | 'laser'
  | 'eraser';

type DrawItem =
  | {
      kind: 'stroke';
      tool: 'pen' | 'marker' | 'highlighter';
      color: string;
      width: number;
      opacity: number;
      points: number[];
    }
  | {
      kind: 'shape';
      shape: 'line' | 'arrow' | 'rect' | 'ellipse';
      color: string;
      width: number;
      opacity: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      kind: 'text';
      color: string;
      fontSize: number;
      x: number;
      y: number;
      text: string;
    }
  | {
      kind: 'number';
      color: string;
      radius: number;
      x: number;
      y: number;
      n: number;
    };

interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

interface InkMessage {
  on?: boolean;
  color?: string;
  size?: number;
}

const HOST_ID = 'stage-ink-layer';
const COLORS = ['#ff6b6b', '#ffd166', '#66e0a3', '#6ea8ff', '#b28dff', '#f4f7ff', '#151821'];
const LASER_TTL_MS = 750;

let active = false;
let mounted = false;
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let toolbar: HTMLDivElement | null = null;
let textInput: HTMLInputElement | null = null;

let color = '#ff6b6b';
let size = 3;
let tool: Tool = 'pen';
let items: DrawItem[] = [];
let redoStack: DrawItem[][] = [];
let history: DrawItem[][] = [];
let live: DrawItem | null = null;
let laserTrail: LaserPoint[] = [];
let laserActive = false;
let nextNumber = 1;
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
    width: '28px',
    height: '28px',
    minWidth: '28px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '7px',
    border: '0',
    background: 'transparent',
    color: '#dbe4f5',
    font: '600 14px/1 "Segoe UI", system-ui, sans-serif',
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

function svgIcon(paths: string[], iconSize = 15): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(iconSize));
  svg.setAttribute('height', String(iconSize));
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

function iconButton(paths: string[], title: string, onClick: () => void, iconSize = 15): HTMLButtonElement {
  const el = button('', title, onClick);
  el.appendChild(svgIcon(paths, iconSize));
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
    height: '18px',
    background: 'rgba(255,255,255,.14)',
    margin: '0 2px',
    flex: '0 0 auto',
  });
  return el;
}

function labelChip(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  styleEl(el, {
    padding: '0 6px',
    color: '#93a2bd',
    font: '700 9px/28px "Segoe UI", system-ui, sans-serif',
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
    gap: '2px',
    maxWidth: 'min(96vw, 960px)',
    overflowX: 'auto',
    padding: '5px 7px',
    borderRadius: '13px',
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(13,17,27,.95)',
    boxShadow: '0 18px 44px rgba(0,0,0,.45)',
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
      id: 'line',
      title: 'Line (Hold Shift to snap)',
      ic: ['M5 19L19 5'],
    },
    {
      id: 'arrow',
      title: 'Arrow (Hold Shift to snap)',
      ic: ['M5 19L19 5', 'M11 5h8v8'],
    },
    {
      id: 'rect',
      title: 'Rectangle (Hold Shift for square)',
      ic: ['M4 5h16v14H4z'],
    },
    {
      id: 'ellipse',
      title: 'Ellipse (Hold Shift for circle)',
      ic: ['M12 5a7 7 0 100 14 7 7 0 000-14z'],
    },
    {
      id: 'text',
      title: 'Text note (Click to type)',
      ic: ['M4 6h16', 'M12 6v13', 'M9 19h6'],
    },
    {
      id: 'number',
      title: 'Number stamp (1, 2, 3...)',
      ic: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M10.5 9.5L12 8v8', 'M10 16h4'],
    },
    {
      id: 'laser',
      title: 'Laser pointer (fades out)',
      ic: ['M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0', 'M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4'],
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
      commitTextInput();
      tool = item.id;
      syncToolbar();
      updateCursor();
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
      width: '18px',
      height: '18px',
      minWidth: '18px',
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
    width: '66px',
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
  const saveButton = iconButton(
    ['M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
    'Save screenshot with markup',
    () => ipcRenderer.send('stage:ink-save'),
  );
  const clearButton = iconButton(
    ['M4 7h16', 'M9.5 7V4.8h5V7', 'M6 7l1 12.2h10L18 7'],
    'Clear markup',
    () => clearAll(),
  );
  const closeButton = iconButton(['M5 5l14 14', 'M19 5L5 19'], 'Finish markup (Esc)', () => closeLayer(), 14);
  toolbar.appendChild(undoButton);
  toolbar.appendChild(redoButton);
  toolbar.appendChild(saveButton);
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
  updateCursor();
  setActive(active);
}

function updateCursor(): void {
  if (!canvas) return;
  if (tool === 'eraser') canvas.style.cursor = 'cell';
  else if (tool === 'text') canvas.style.cursor = 'text';
  else canvas.style.cursor = 'crosshair';
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
    if (on) whenReady(buildLayer);
    return;
  }
  host.style.display = on ? 'block' : 'none';
  host.style.pointerEvents = on ? 'auto' : 'none';
  if (on) {
    resize();
    syncToolbar();
    updateCursor();
    window.focus();
    canvas?.focus?.();
  } else {
    commitTextInput();
    live = null;
    laserActive = false;
    laserTrail = [];
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
 * Text input overlay
 * ------------------------------------------------------------------ */

function openTextInput(clientX: number, clientY: number): void {
  commitTextInput();
  if (!shadow) return;
  const docX = clientX + window.scrollX;
  const docY = clientY + window.scrollY;
  const fontSize = Math.max(14, size * 4 + 8);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type note…';
  styleEl(input, {
    position: 'absolute',
    left: `${Math.min(window.innerWidth - 180, Math.max(12, clientX))}px`,
    top: `${Math.min(window.innerHeight - 48, Math.max(58, clientY - fontSize / 2))}px`,
    minWidth: '160px',
    maxWidth: '420px',
    padding: '4px 8px',
    borderRadius: '8px',
    border: `1.5px solid ${color}`,
    background: 'rgba(13, 17, 27, 0.92)',
    color,
    font: `600 ${fontSize}px/1.3 "Segoe UI", system-ui, sans-serif`,
    outline: 'none',
    pointerEvents: 'auto',
    boxShadow: '0 8px 24px rgba(0,0,0,.4)',
  });

  input.dataset.docX = String(docX);
  input.dataset.docY = String(docY);
  input.dataset.fontSize = String(fontSize);

  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTextInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTextInput();
    }
  });
  input.addEventListener('blur', () => commitTextInput());

  shadow.appendChild(input);
  textInput = input;
  requestAnimationFrame(() => input.focus());
}

function commitTextInput(): void {
  if (!textInput) return;
  const el = textInput;
  textInput = null;
  const value = el.value.trim();
  const docX = Number(el.dataset.docX) || 0;
  const docY = Number(el.dataset.docY) || 0;
  const fontSize = Number(el.dataset.fontSize) || 20;
  el.remove();
  if (!value) return;
  history.push(items.slice());
  redoStack = [];
  items.push({ kind: 'text', color, fontSize, x: docX, y: docY, text: value });
  schedule();
  syncToolbar();
}

function cancelTextInput(): void {
  if (!textInput) return;
  textInput.remove();
  textInput = null;
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
  return {
    x: event.clientX + window.scrollX,
    y: event.clientY + window.scrollY,
  };
}

function snapShape(shape: 'line' | 'arrow' | 'rect' | 'ellipse', x1: number, y1: number, x2: number, y2: number, shift: boolean): { x2: number; y2: number } {
  if (!shift) return { x2, y2 };
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (shape === 'rect' || shape === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x2: x1 + (dx >= 0 ? side : -side), y2: y1 + (dy >= 0 ? side : -side) };
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x2: x1 + Math.cos(angle) * len, y2: y1 + Math.sin(angle) * len };
}

function down(event: PointerEvent): void {
  if (!active || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  if (tool === 'text') {
    openTextInput(event.clientX, event.clientY);
    return;
  }

  const p = pointFrom(event);

  if (tool === 'number') {
    history.push(items.slice());
    redoStack = [];
    items.push({
      kind: 'number',
      color,
      radius: Math.max(12, size * 2 + 8),
      x: p.x,
      y: p.y,
      n: nextNumber++,
    });
    schedule();
    syncToolbar();
    return;
  }

  if (tool === 'laser') {
    laserActive = true;
    canvas?.setPointerCapture(event.pointerId);
    laserTrail.push({ x: p.x, y: p.y, t: performance.now() });
    schedule();
    return;
  }

  canvas?.setPointerCapture(event.pointerId);

  if (tool === 'eraser') {
    history.push(items.slice());
    redoStack = [];
    eraseAt(p.x, p.y);
    return;
  }

  history.push(items.slice());
  redoStack = [];

  if (tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse') {
    live = {
      kind: 'shape',
      shape: tool,
      color,
      width: size,
      opacity: 1,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
    };
  } else {
    live = {
      kind: 'stroke',
      tool,
      color,
      width: widthFor(tool),
      opacity: opacityFor(tool),
      points: [p.x, p.y],
    };
  }
  schedule();
}

function move(event: PointerEvent): void {
  if (!active || event.buttons !== 1) return;
  if (tool === 'laser' && laserActive) {
    event.preventDefault();
    event.stopPropagation();
    const p = pointFrom(event);
    laserTrail.push({ x: p.x, y: p.y, t: performance.now() });
    schedule();
    return;
  }
  if (!live && tool !== 'eraser') return;
  event.preventDefault();
  event.stopPropagation();

  if (tool === 'eraser') {
    const p = pointFrom(event);
    eraseAt(p.x, p.y);
    return;
  }
  if (!live) return;

  if (live.kind === 'shape') {
    const p = pointFrom(event);
    const snapped = snapShape(live.shape, live.x1, live.y1, p.x, p.y, event.shiftKey);
    live.x2 = snapped.x2;
    live.y2 = snapped.y2;
    schedule();
    return;
  }

  if (live.kind === 'stroke') {
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
  if (tool === 'laser') {
    laserActive = false;
    schedule();
    return;
  }
  if (live) {
    if (live.kind === 'stroke' && live.points.length === 2) {
      live.points.push(live.points[0] + 0.1, live.points[1]);
    }
    if (live.kind === 'shape' && Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < 2) {
      live = null;
      history.pop();
    } else {
      items.push(live);
      live = null;
    }
  }
  schedule();
  syncToolbar();
}

function eraseAt(x: number, y: number): void {
  const radius = Math.max(8, widthFor('eraser'));
  const kept = items.filter((item) => !itemHit(item, x, y, radius));
  if (kept.length !== items.length) {
    items = kept;
    schedule();
    syncToolbar();
  }
}

function itemHit(item: DrawItem, x: number, y: number, radius: number): boolean {
  if (item.kind === 'stroke') {
    const reach = radius + item.width / 2;
    for (let i = 0; i + 3 < item.points.length; i += 2) {
      if (
        distToSegment(x, y, item.points[i], item.points[i + 1], item.points[i + 2], item.points[i + 3]) <= reach
      ) {
        return true;
      }
    }
    return false;
  }
  if (item.kind === 'number') {
    return Math.hypot(x - item.x, y - item.y) <= item.radius + radius;
  }
  if (item.kind === 'text') {
    const w = Math.max(40, item.text.length * item.fontSize * 0.56);
    const h = item.fontSize * 1.25;
    return x >= item.x - radius && x <= item.x + w + radius && y >= item.y - h - radius && y <= item.y + radius;
  }
  const reach = radius + item.width / 2;
  if (item.shape === 'line' || item.shape === 'arrow') {
    return distToSegment(x, y, item.x1, item.y1, item.x2, item.y2) <= reach;
  }
  const minX = Math.min(item.x1, item.x2);
  const maxX = Math.max(item.x1, item.x2);
  const minY = Math.min(item.y1, item.y2);
  const maxY = Math.max(item.y1, item.y2);
  if (x < minX - reach || x > maxX + reach || y < minY - reach || y > maxY + reach) return false;
  if (item.shape === 'rect') {
    return (
      distToSegment(x, y, minX, minY, maxX, minY) <= reach ||
      distToSegment(x, y, maxX, minY, maxX, maxY) <= reach ||
      distToSegment(x, y, maxX, maxY, minX, maxY) <= reach ||
      distToSegment(x, y, minX, maxY, minX, minY) <= reach
    );
  }
  return true;
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
    if (laserTrail.length > 0) schedule();
  });
}

function repaint(): void {
  if (!ctx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-window.scrollX, -window.scrollY);
  for (const item of items) drawItem(ctx, item);
  if (live) drawItem(ctx, live);
  drawLaser(ctx);
  ctx.restore();
}

function drawItem(context: CanvasRenderingContext2D, item: DrawItem): void {
  if (item.kind === 'stroke') {
    const points = item.points;
    if (points.length < 2) return;
    context.save();
    context.globalAlpha = item.opacity;
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = item.width;
    if (points.length === 2) {
      context.beginPath();
      context.arc(points[0], points[1], Math.max(0.5, item.width / 2), 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(points[0], points[1]);
      for (let i = 2; i + 1 < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
      context.stroke();
    }
    context.restore();
    return;
  }

  if (item.kind === 'shape') {
    context.save();
    context.globalAlpha = item.opacity;
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = item.width;
    if (item.shape === 'line') {
      context.beginPath();
      context.moveTo(item.x1, item.y1);
      context.lineTo(item.x2, item.y2);
      context.stroke();
    } else if (item.shape === 'arrow') {
      context.beginPath();
      context.moveTo(item.x1, item.y1);
      context.lineTo(item.x2, item.y2);
      context.stroke();
      const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
      const head = Math.max(10, item.width * 3.5);
      context.beginPath();
      context.moveTo(item.x2, item.y2);
      context.lineTo(item.x2 - head * Math.cos(angle - Math.PI / 6), item.y2 - head * Math.sin(angle - Math.PI / 6));
      context.moveTo(item.x2, item.y2);
      context.lineTo(item.x2 - head * Math.cos(angle + Math.PI / 6), item.y2 - head * Math.sin(angle + Math.PI / 6));
      context.stroke();
    } else if (item.shape === 'rect') {
      const x = Math.min(item.x1, item.x2);
      const y = Math.min(item.y1, item.y2);
      context.strokeRect(x, y, Math.abs(item.x2 - item.x1), Math.abs(item.y2 - item.y1));
    } else if (item.shape === 'ellipse') {
      const cx = (item.x1 + item.x2) / 2;
      const cy = (item.y1 + item.y2) / 2;
      const rx = Math.max(1, Math.abs(item.x2 - item.x1) / 2);
      const ry = Math.max(1, Math.abs(item.y2 - item.y1) / 2);
      context.beginPath();
      context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
    return;
  }

  if (item.kind === 'text') {
    context.save();
    context.font = `600 ${item.fontSize}px/1.2 "Segoe UI", system-ui, sans-serif`;
    context.fillStyle = 'rgba(13, 17, 27, 0.72)';
    const metrics = context.measureText(item.text);
    const padX = 7;
    const padY = 4;
    context.beginPath();
    context.roundRect(item.x - padX, item.y - item.fontSize - padY + 4, metrics.width + padX * 2, item.fontSize + padY * 2, 6);
    context.fill();
    context.fillStyle = item.color;
    context.fillText(item.text, item.x, item.y);
    context.restore();
    return;
  }

  if (item.kind === 'number') {
    context.save();
    context.fillStyle = item.color;
    context.beginPath();
    context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = item.color === '#f4f7ff' || item.color === '#ffd166' || item.color === '#66e0a3' ? '#111624' : '#ffffff';
    context.font = `700 ${Math.round(item.radius * 1.1)}px/1 "Segoe UI", system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(item.n), item.x, item.y + 0.5);
    context.restore();
  }
}

function drawLaser(context: CanvasRenderingContext2D): void {
  const now = performance.now();
  laserTrail = laserTrail.filter((pt) => now - pt.t < LASER_TTL_MS);
  if (laserTrail.length < 2) {
    if (laserTrail.length === 1) {
      const pt = laserTrail[0];
      const alpha = Math.max(0, 1 - (now - pt.t) / LASER_TTL_MS);
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = '#ff3b5c';
      context.shadowColor = '#ff3b5c';
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    return;
  }
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = '#ff3b5c';
  context.shadowBlur = 12;
  for (let i = 1; i < laserTrail.length; i++) {
    const a = laserTrail[i - 1];
    const b = laserTrail[i];
    const life = Math.max(0, 1 - (now - b.t) / LASER_TTL_MS);
    context.globalAlpha = life;
    context.strokeStyle = '#ff3b5c';
    context.lineWidth = 2 + life * 4;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  const head = laserTrail[laserTrail.length - 1];
  context.globalAlpha = 1;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(head.x, head.y, 3.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function undo(): void {
  if (!history.length) return;
  redoStack.push(items.slice());
  items = history.pop() ?? [];
  live = null;
  schedule();
  syncToolbar();
}

function redo(): void {
  if (!redoStack.length) return;
  history.push(items.slice());
  items = redoStack.pop() ?? [];
  live = null;
  schedule();
  syncToolbar();
}

function clearAll(): void {
  nextNumber = 1;
  if (!items.length) return;
  history.push(items.slice());
  redoStack = [];
  items = [];
  live = null;
  schedule();
  syncToolbar();
}

/* ------------------------------------------------------------------ *
 * Keyboard
 * ------------------------------------------------------------------ */

function onKey(event: KeyboardEvent): void {
  if (!active) return;
  if (textInput) return;
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
