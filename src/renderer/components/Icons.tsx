import React from 'react';

/** Inline icon set (no icon font, no external assets). */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const Icon: Record<string, React.FC<{ size?: number }>> = {
  cursor: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 3.5l13.5 6.8-6 2-2.2 6z" />
    </svg>
  ),
  pen: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 20l2.5-.6 10.6-10.6-2-2L4.6 17.4z" />
      <path d="M15.2 4.3l1.6-1.6a1.8 1.8 0 012.5 2.5l-1.6 1.6" />
    </svg>
  ),
  marker: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M9.5 11.5L4 17v3h3l5.5-5.5" />
      <path d="M13.5 7.5l4 4 3-3-4-4z" />
    </svg>
  ),
  highlighter: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M3.5 20.5l3.2-.8L19 7.4l-2.6-2.6L4.3 17.3z" />
      <path d="M14 6l3.4 3.4" />
    </svg>
  ),
  eraser: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M20 20H8.6L3.5 14.9 13 5.4l6.1 6.1-6.4 6.4" />
      <path d="M9.6 14.1l4.6-4.6" />
    </svg>
  ),
  line: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 20L20 4" />
    </svg>
  ),
  arrow: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 19L19 5" />
      <path d="M9.5 5H19v9.5" />
    </svg>
  ),
  rect: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="4" y="5.5" width="16" height="13" rx="1.5" />
    </svg>
  ),
  ellipse: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.4" />
    </svg>
  ),
  text: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 5.5h14" />
      <path d="M12 5.5v13" />
      <path d="M9.5 18.5h5" />
    </svg>
  ),
  number: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.2 10.2l1.5-1.2v6.4" />
    </svg>
  ),
  laser: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M12 2.5v3.6M12 17.9v3.6M2.5 12h3.6M17.9 12h3.6" />
    </svg>
  ),
  spotlight: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M8.5 10a3.5 3.5 0 117 0l-1.8 7.4h-3.4z" />
      <path d="M6 20.8h12" />
    </svg>
  ),
  select: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5.5 3.5l12 7.2-5.4 1.7-1.9 5.4z" />
    </svg>
  ),
  hand: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M8 12V5.6a1.6 1.6 0 113.2 0V11" />
      <path d="M11.2 11V4.6a1.6 1.6 0 113.2 0V11" />
      <path d="M14.4 11.4V6.6a1.6 1.6 0 113.2 0V15a5 5 0 01-5 5h-1.2a5 5 0 01-4.3-2.5L5 14.2a1.7 1.7 0 012.6-2.1z" />
    </svg>
  ),
  image: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l4.8-4.5L13 16l3-2.6 4.5 4" />
    </svg>
  ),
  undo: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M9 7H4.5V2.5" />
      <path d="M4.5 7.5A8 8 0 1112 20" />
    </svg>
  ),
  redo: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M15 7h4.5V2.5" />
      <path d="M19.5 7.5A8 8 0 1012 20" />
    </svg>
  ),
  trash: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M6 7l1 12.2h10L18 7" />
    </svg>
  ),
  globe: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z" />
    </svg>
  ),
  search: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15.2 15.2L20.5 20.5" />
    </svg>
  ),
  plus: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  menu: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="5.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.6" fill="currentColor" />
    </svg>
  ),
  chevronDown: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  ),
  eyeOff: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A9.6 9.6 0 0112 6.2c5 0 8.5 5.8 8.5 5.8a17 17 0 01-3.3 3.7" />
      <path d="M6.4 8.1A17.6 17.6 0 003.5 12s3.5 5.8 8.5 5.8a9.4 9.4 0 003.4-.6" />
      <path d="M9.9 9.9a2.9 2.9 0 004.2 4.2" />
    </svg>
  ),
  snowflake: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
    </svg>
  ),
  broadcast: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      <path d="M7.6 7.6a6.2 6.2 0 000 8.8M16.4 16.4a6.2 6.2 0 000-8.8" />
      <path d="M4.6 4.6a10.4 10.4 0 000 14.8M19.4 19.4a10.4 10.4 0 000-14.8" />
    </svg>
  ),
  layers: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M12 3.5L20 8l-8 4.5L4 8z" />
      <path d="M4 12.5l8 4.5 8-4.5" />
    </svg>
  ),
  camera: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" />
      <path d="M15.5 11l5-2.6v7.2l-5-2.6z" />
    </svg>
  ),
  notes: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M6 3.5h9.5L19 7v13.5H6z" />
      <path d="M9 10h7M9 13.5h7M9 17h4" />
    </svg>
  ),
  timer: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.4 1.6M9.5 2.5h5" />
    </svg>
  ),
  grid: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 10h16M4 15h16M10 4v16M15 4v16" />
    </svg>
  ),
  mask: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <rect x="9" y="9" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  sliders: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 8h14M5 16h14" />
      <circle cx="9" cy="8" r="2.2" fill="var(--jz-panel-solid)" />
      <circle cx="15" cy="16" r="2.2" fill="var(--jz-panel-solid)" />
    </svg>
  ),
  monitor: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  ),
  star: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M12 4l2.5 5.1 5.6.8-4 4 .9 5.6L12 16.9 7 19.5l.9-5.6-4-4 5.6-.8z" />
    </svg>
  ),
  clock: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  sound: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
      <path d="M14.5 9a4.5 4.5 0 010 6" />
    </svg>
  ),
  muted: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
      <path d="M14.5 10l4 4M18.5 10l-4 4" />
    </svg>
  ),
  pin: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M9 3.5h6l-.8 4.4 2.8 2.8H7l2.8-2.8z" />
      <path d="M12 10.7V20.5" />
    </svg>
  ),
  copy: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" />
    </svg>
  ),
  refresh: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M20 11a8 8 0 10-2.4 5.7" />
      <path d="M20 4.5V11h-6.5" />
    </svg>
  ),
  check: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  ),
  settings: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M4.5 12h3M16.5 12h3M6.4 6.4l2.1 2.1M15.5 15.5l2.1 2.1M17.6 6.4l-2.1 2.1M8.5 15.5l-2.1 2.1" />
    </svg>
  ),
  expand: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 9V4.5h5M20 15v4.5h-5M15 4.5h5V9M9 19.5H4V15" />
    </svg>
  ),
  board: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M7.5 20.5l2-4M16.5 20.5l-2-4" />
    </svg>
  ),
  download: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M12 3.5v10M8 9.5l4 4 4-4" />
      <path d="M4.5 16.5v2a2 2 0 002 2h11a2 2 0 002-2v-2" />
    </svg>
  ),
  book: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M3.5 5.2c2.8-.9 5.6-.6 8.5 1v13c-2.9-1.6-5.7-1.9-8.5-1V5.2z" />
      <path d="M20.5 5.2c-2.8-.9-5.6-.6-8.5 1v13c2.9-1.6 5.7-1.9 8.5-1V5.2z" />
    </svg>
  ),
  puzzle: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M9.5 4.5a2 2 0 014 0v1.2h3.3a1.7 1.7 0 011.7 1.7v3.3h1.2a2 2 0 010 4h-1.2v3.6a1.7 1.7 0 01-1.7 1.7h-3.6v-1.2a2 2 0 00-4 0v1.2H5.6a1.7 1.7 0 01-1.7-1.7v-3.6h1.2a2 2 0 000-4H3.9V7.4a1.7 1.7 0 011.7-1.7h3.9V4.5z" />
    </svg>
  ),
  reader: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 3.5h9.5L19 8v12.5H5z" />
      <path d="M14 3.5V8h5M8 12h8M8 15.5h8M8 19h5" />
    </svg>
  ),
  print: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M7 8.5V3.5h10v5" />
      <rect x="4" y="8.5" width="16" height="8" rx="2" />
      <path d="M7 14h10v6.5H7z" />
      <path d="M17 11.5h.01" />
    </svg>
  ),
  sun: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </svg>
  ),
  moon: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
    </svg>
  ),
  shot: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4z" />
      <circle cx="12" cy="13.2" r="3.2" />
    </svg>
  ),
  arrowLeft: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
  arrowRight: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  external: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M14 4.5h5.5V10M19.5 4.5L11 13" />
      <path d="M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10" />
    </svg>
  ),
  tabs: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M6.5 7.5V5.5A1.5 1.5 0 018 4h8a1.5 1.5 0 011.5 1.5v2M8 12h8M8 15.5h5" />
    </svg>
  ),
  close: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  ),
  lock: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 018 0V10" />
    </svg>
  ),
  home: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5M10 20v-5.5h4V20" />
    </svg>
  ),
  history: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M4 5v5h5" />
      <path d="M4.6 10a8 8 0 111.2 6.5" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  ),
  more: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  command: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M9 9h6v6H9z" />
      <path d="M9 9V7.5A2.5 2.5 0 116.5 10H9M15 9V7.5A2.5 2.5 0 1117.5 10H15M9 15v1.5A2.5 2.5 0 116.5 14H9M15 15v1.5a2.5 2.5 0 102.5-2.5H15" />
    </svg>
  ),
  minimize: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <path d="M6 12h12" />
    </svg>
  ),
  maximize: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  ),
  restore: ({ size = 20 }) => (
    <svg {...base} width={size} height={size}>
      <rect x="5" y="8" width="11" height="11" rx="1.5" />
      <path d="M8.5 8V5.5h10V15" />
    </svg>
  ),
};
