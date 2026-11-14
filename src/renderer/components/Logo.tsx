import React from 'react';

/**
 * Stage mark: three ascending steps inside a rounded tile. Simple enough to
 * read at 16px, quiet enough to sit next to a tab title all day.
 */
export const Logo: React.FC<{ size?: number; radius?: number; tone?: 'brand' | 'mono' }> = ({
  size = 24,
  radius,
  tone = 'brand',
}) => {
  const gradId = React.useId();
  const r = radius ?? Math.round(size * 0.28);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="st-logo">
      <defs>
        <linearGradient id={gradId} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor={tone === 'mono' ? '#dbe4f5' : '#8ab4ff'} />
          <stop offset="1" stopColor={tone === 'mono' ? '#94a3b8' : '#5b7cfa'} />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx={r} fill={`url(#${gradId})`} />
      <rect x="5" y="14.5" width="3.6" height="4.6" rx="1.2" fill="#0a0d14" fillOpacity="0.82" />
      <rect x="10.2" y="10.8" width="3.6" height="8.3" rx="1.2" fill="#0a0d14" fillOpacity="0.62" />
      <rect x="15.4" y="6.9" width="3.6" height="12.2" rx="1.2" fill="#ffffff" fillOpacity="0.95" />
    </svg>
  );
};

export const StageWordmark: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <span className="st-wordmark" aria-label="Stage Browser">
    <span className="st-wordmark__name">Stage</span>
    {!compact && <span className="st-wordmark__sub">Browser</span>}
  </span>
);
