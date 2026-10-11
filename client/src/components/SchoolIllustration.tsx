/** Decorative campus scene used on the home page until the school uploads its own photos. */
export function SchoolIllustration({ className = '', initials = '' }: { className?: string; initials?: string }) {
  const win = (x: number, y: number, k: string) => <rect key={k} x={x} y={y} width="26" height="30" rx="4" fill="#bfe0f7" stroke="#8fbfe3" strokeWidth="1.5" />;
  const tree = (x: number, y: number, s = 1, k = '') => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-4" y="0" width="8" height="34" rx="3" fill="#8a5a3b" />
      <circle cx="0" cy="-8" r="24" fill="#3f9d5d" /><circle cx="-14" cy="4" r="16" fill="#4fb36d" /><circle cx="14" cy="4" r="16" fill="#358a50" />
    </g>
  );
  const kid = (x: number, shirt: string, k: string, bag = '#f2b84b') => (
    <g key={k} transform={`translate(${x} 388)`}>
      <circle cx="0" cy="-44" r="8" fill="#c98b5e" /><path d="M-8 -48 q8 -10 16 0 v-2 q-8 -8 -16 0z" fill="#2b2b2b" />
      <rect x="-9" y="-35" width="18" height="22" rx="5" fill={shirt} /><rect x="-13" y="-33" width="6" height="15" rx="3" fill={bag} />
      <rect x="-8" y="-14" width="7" height="16" rx="2" fill="#1d3557" /><rect x="1" y="-14" width="7" height="16" rx="2" fill="#1d3557" />
    </g>
  );
  return (
    <svg viewBox="0 0 640 440" className={className} role="img" aria-label="Illustration of the school campus">
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd3ff" /><stop offset="1" stopColor="#e6f6ff" /></linearGradient>
        <linearGradient id="sc-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff7ea" /><stop offset="1" stopColor="#f6e4c6" /></linearGradient>
        <linearGradient id="sc-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7cc96f" /><stop offset="1" stopColor="#5aae55" /></linearGradient>
        <clipPath id="sc-frame"><rect x="0" y="0" width="640" height="440" rx="28" /></clipPath>
      </defs>
      <g clipPath="url(#sc-frame)">
        <rect width="640" height="440" fill="url(#sc-sky)" />
        <circle cx="560" cy="70" r="36" fill="#ffd166" /><circle cx="560" cy="70" r="52" fill="#ffd166" opacity="0.25" />
        <g fill="#fff" opacity="0.95">
          <ellipse cx="110" cy="70" rx="44" ry="16" /><ellipse cx="140" cy="60" rx="30" ry="18" /><ellipse cx="400" cy="50" rx="36" ry="12" /><ellipse cx="425" cy="42" rx="22" ry="13" />
        </g>
        <g fill="none" stroke="#1d4774" strokeWidth="2" strokeLinecap="round" opacity="0.6"><path d="M250 80 q6 -6 12 0 q6 -6 12 0" /><path d="M290 100 q5 -5 10 0 q5 -5 10 0" /></g>
        {/* distant hills */}
        <path d="M0 300 Q120 230 240 290 T480 280 T640 270 V440 H0Z" fill="#a8dba0" />
        {/* side wings */}
        <rect x="90" y="190" width="150" height="140" fill="url(#sc-wall)" stroke="#e2c79c" strokeWidth="2" />
        <rect x="400" y="190" width="150" height="140" fill="url(#sc-wall)" stroke="#e2c79c" strokeWidth="2" />
        <rect x="84" y="180" width="162" height="14" rx="3" fill="#c0584a" /><rect x="394" y="180" width="162" height="14" rx="3" fill="#c0584a" />
        {[105, 145, 185].flatMap((x) => [win(x, 210, `l1${x}`), win(x, 260, `l2${x}`)])}
        {[425, 465, 505].flatMap((x) => [win(x, 210, `r1${x}`), win(x, 260, `r2${x}`)])}
        {/* main block */}
        <rect x="230" y="150" width="180" height="180" fill="#fffaf2" stroke="#e2c79c" strokeWidth="2" />
        <path d="M218 156 L320 96 L422 156 Z" fill="#c0584a" /><path d="M240 150 L320 104 L400 150 Z" fill="#d9705f" />
        <circle cx="320" cy="132" r="16" fill="#fff" stroke="#1d4774" strokeWidth="3" /><path d="M320 122 v10 l7 5" stroke="#1d4774" strokeWidth="3" fill="none" strokeLinecap="round" />
        <line x1="320" y1="96" x2="320" y2="52" stroke="#5b6b7a" strokeWidth="3" />
        <rect x="320" y="52" width="30" height="7" fill="#ff9933" /><rect x="320" y="59" width="30" height="7" fill="#fff" /><rect x="320" y="66" width="30" height="7" fill="#138808" /><circle cx="335" cy="62.5" r="2.4" fill="#000080" />
        <rect x="258" y="170" width="124" height="28" rx="6" fill="#1d4774" />
        {initials ? <text x="320" y="190" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="15" fill="#ffd166" letterSpacing="3">{initials}</text>
          : <path d="M300 184 h40" stroke="#ffd166" strokeWidth="4" strokeLinecap="round" />}
        {[250, 360].map((x) => win(x, 215, `m${x}`))}
        <path d="M290 330 V262 a30 30 0 0 1 60 0 V330 Z" fill="#1d4774" /><line x1="320" y1="236" x2="320" y2="330" stroke="#2d6fae" strokeWidth="2" />
        {[244, 268, 372, 396].map((x) => <rect key={`p${x}`} x={x - 4} y="250" width="8" height="80" fill="#efe2cc" />)}
        <rect x="270" y="328" width="100" height="8" fill="#d9c7a7" /><rect x="262" y="336" width="116" height="8" fill="#cbb793" />
        {/* ground and path */}
        <path d="M0 340 H640 V440 H0Z" fill="url(#sc-grass)" />
        <path d="M290 344 L350 344 L420 440 L220 440 Z" fill="#e9dcc3" />
        {tree(48, 300, 1.1, 't1')}{tree(600, 296, 1.15, 't2')}{tree(372, 344, 0.55, 't3')}{tree(262, 344, 0.55, 't4')}
        {/* fence */}
        <g stroke="#ffffff" strokeWidth="3" opacity="0.9">{[...Array(9)].map((_, i) => <line key={`f${i}`} x1={20 + i * 26} y1="350" x2={20 + i * 26} y2="372" />)}<line x1="14" y1="358" x2="232" y2="358" />
          {[...Array(9)].map((_, i) => <line key={`g${i}`} x1={410 + i * 26} y1="350" x2={410 + i * 26} y2="372" />)}<line x1="404" y1="358" x2="630" y2="358" /></g>
        {/* school bus */}
        <g transform="translate(456 372)">
          <rect x="0" y="0" width="150" height="50" rx="10" fill="#f6b928" /><rect x="0" y="34" width="150" height="6" fill="#1d3557" />
          {[10, 40, 70, 100].map((x) => <rect key={`b${x}`} x={x} y="8" width="24" height="18" rx="3" fill="#bfe0f7" />)}
          <rect x="128" y="8" width="16" height="26" rx="3" fill="#bfe0f7" />
          <circle cx="32" cy="52" r="11" fill="#2b2b2b" /><circle cx="32" cy="52" r="4" fill="#ccc" /><circle cx="118" cy="52" r="11" fill="#2b2b2b" /><circle cx="118" cy="52" r="4" fill="#ccc" />
          <text x="62" y="47" fontFamily="sans-serif" fontWeight="700" fontSize="7" fill="#fff">SCHOOL BUS</text>
        </g>
        {/* students */}
        {kid(150, '#2d6fae', 'k1')}{kid(180, '#e4572e', 'k2', '#2d6fae')}{kid(214, '#2d6fae', 'k3', '#43aa8b')}
        {kid(410, '#43aa8b', 'k4')}
        {/* books */}
        <g transform="translate(70 396)"><rect width="46" height="10" rx="2" fill="#e4572e" /><rect x="4" y="-10" width="40" height="10" rx="2" fill="#2d6fae" /><rect x="2" y="-20" width="42" height="10" rx="2" fill="#f6b928" /></g>
      </g>
    </svg>
  );
}
