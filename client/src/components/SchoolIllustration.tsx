/** Decorative school illustration used when no photo has been uploaded. */
export function SchoolIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" className={className} role="img" aria-label="Illustration of a school building">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0.18" /><stop offset="1" stopColor="#ffffff" stopOpacity="0.04" /></linearGradient>
      </defs>
      <circle cx="380" cy="70" r="38" fill="#f2b84b" opacity="0.9" />
      <rect x="20" y="40" width="440" height="300" rx="28" fill="url(#sky)" />
      <path d="M70 300 L70 170 L240 95 L410 170 L410 300 Z" fill="#ffffff" opacity="0.95" />
      <path d="M50 178 L240 88 L430 178" fill="none" stroke="#f2b84b" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="205" y="215" width="70" height="85" rx="6" fill="#1d4774" />
      <circle cx="240" cy="150" r="22" fill="#2d6fae" /><path d="M240 136 v14 l10 6" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
      {[95, 145, 305, 355].map((x) => <rect key={x} x={x} y="200" width="34" height="34" rx="5" fill="#abcde9" />)}
      {[95, 145, 305, 355].map((x) => <rect key={x + 1} x={x} y="250" width="34" height="34" rx="5" fill="#abcde9" />)}
      <rect x="40" y="300" width="400" height="12" rx="6" fill="#f2b84b" opacity="0.8" />
      <line x1="240" y1="73" x2="240" y2="30" stroke="#fff" strokeWidth="3" /><path d="M240 30 l30 9 l-30 9 z" fill="#f2b84b" />
      <g fill="#fff" opacity="0.85"><circle cx="60" cy="96" r="3" /><circle cx="110" cy="70" r="2" /><circle cx="420" cy="140" r="2.5" /></g>
    </svg>
  );
}
