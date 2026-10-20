// SalesTology 로고: 검정 바탕 위 S, 대각선 칼자국으로 베어져 위쪽 절반이 미끄러진 형태.
// src/app/icon.svg, public/logo.svg 와 같은 도형이다. 바꿀 때 세 곳을 함께 바꾼다.
const S_PATH =
  "M45 19.5C41.5 15 36.5 13 31 13C23.5 13 18 17 18 23C18 29.5 24 31.5 32 33.2C40.5 35 46.5 37.5 46.5 44C46.5 50.5 40.5 53 33 53C26.5 53 21 50.5 17.5 46";

// 칼자국: (8,50) → (56,16) 을 지나는 직선으로 두 조각을 나눈다
const UPPER = "-20,69.8 84,-3.8 84,-40 -20,-40";
const LOWER = "-20,69.8 84,-3.8 84,100 -20,100";

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="SalesTology">
      <defs>
        <clipPath id="st-upper"><polygon points={UPPER} /></clipPath>
        <clipPath id="st-lower"><polygon points={LOWER} /></clipPath>
        <linearGradient id="st-gleam" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0a0a0c" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="#fff" strokeOpacity="0.1" />
      <g fill="none" stroke="#f4f4f6" strokeWidth="6.5" strokeLinecap="butt">
        <path d={S_PATH} clipPath="url(#st-lower)" />
        <path d={S_PATH} clipPath="url(#st-upper)" transform="translate(1.8 -1.3)" />
      </g>
      {/* 베인 자리의 틈과 칼날의 섬광 */}
      <line x1="8" y1="50" x2="56" y2="16" stroke="#0a0a0c" strokeWidth="2.2" />
      <line x1="2" y1="54.25" x2="62" y2="11.75" stroke="url(#st-gleam)" strokeWidth="0.9" />
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className ?? ""}`}>
      Sales<span className="text-[var(--muted)]">Tology</span>
    </span>
  );
}
