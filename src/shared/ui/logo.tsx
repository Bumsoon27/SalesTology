"use client";

// SalesTology 로고: 검정 바탕 위 S, 대각선 칼자국으로 베어져 위쪽 절반이 미끄러진 형태.
// src/app/icon.svg, public/logo.svg 와 같은 도형이다. 바꿀 때 세 곳을 함께 바꾸고 scripts/generate-icons.mjs 를 다시 실행한다.
import { useId } from "react";

const S_PATH =
  "M45 19.5C41.5 15 36.5 13 31 13C23.5 13 18 17 18 23C18 29.5 24 31.5 32 33.2C40.5 35 46.5 37.5 46.5 44C46.5 50.5 40.5 53 33 53C26.5 53 21 50.5 17.5 46";

// 칼자국: (8,50) → (56,16) 을 지나는 직선으로 두 조각을 나눈다
const UPPER = "-20,69.8 84,-3.8 84,-40 -20,-40";
const LOWER = "-20,69.8 84,-3.8 84,100 -20,100";

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  // 한 화면에 로고가 여러 개 있어도 clipPath id 가 겹치지 않게
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, "");
  // 작은 크기(헤더 등)는 1px 이하 선이 번져 보이므로 섬광을 빼고 칼자국을 굵게 한다
  const small = size <= 32;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="SalesTology" shapeRendering="geometricPrecision">
      <defs>
        <clipPath id={`${uid}-u`}>
          <polygon points={UPPER} />
        </clipPath>
        <clipPath id={`${uid}-l`}>
          <polygon points={LOWER} />
        </clipPath>
        <linearGradient id={`${uid}-g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0a0a0c" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="#fff" strokeOpacity={small ? 0.18 : 0.1} />
      <g fill="none" stroke="#f4f4f6" strokeWidth={small ? 7.5 : 6.5} strokeLinecap="butt">
        <path d={S_PATH} clipPath={`url(#${uid}-l)`} />
        <path d={S_PATH} clipPath={`url(#${uid}-u)`} transform={small ? "translate(2.4 -1.7)" : "translate(1.8 -1.3)"} />
      </g>
      {/* 베인 자리의 틈과 칼날의 섬광 */}
      <line x1="8" y1="50" x2="56" y2="16" stroke="#0a0a0c" strokeWidth={small ? 3.2 : 2.2} />
      {!small && <line x1="2" y1="54.25" x2="62" y2="11.75" stroke={`url(#${uid}-g)`} strokeWidth="0.9" />}
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight text-white ${className ?? ""}`}>
      Sales<span className="text-[#a9acb8]">Tology</span>
    </span>
  );
}
