"use client";

// 상단 주 메뉴: [SalesTology ▸ 대시보드 · 파이프라인] [SOS]
// SalesTology 를 누르면 그 칸이 늘어나며 하위 메뉴가 나오고, SOS 를 누르면 접힌다.
//
// 헤더는 페이지마다 따로 그려지고, Next 16 은 지나온 페이지를 숨긴 채 살려 두었다가 즉시 다시 보여준다.
// 그래서 '누른 헤더'가 움직이는 동안 바로 다른 페이지 헤더로 바뀌어 애니메이션이 보이지 않았다 (운영에서 측정).
// → 새로 보이는 헤더가 '사용자가 마지막으로 본 상태(lastShown)'에서 시작해 목표로 움직인다.
//   페이지 로딩이 느리면 누른 헤더가 먼저 움직이고, 300ms 뒤 lastShown 을 갱신해 새 헤더가 두 번 움직이지 않게 한다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** 사용자가 마지막으로 본(움직임이 끝난) 펼침 상태 — 모든 헤더가 같이 본다 */
let lastShown: boolean | null = null;
const DURATION_MS = 300;

const SUB = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/pipeline", label: "파이프라인" },
] as const;
type SubHref = (typeof SUB)[number]["href"];

/** 그리기만 하는 부분 — 주소를 읽기 전(Suspense 대기)에도 같은 모양으로 보이게 */
function NavView({
  expanded,
  inSos,
  subActive,
  onGo,
}: {
  expanded: boolean;
  inSos: boolean;
  subActive: SubHref | null;
  onGo?: (expand: boolean) => void;
}) {
  const top = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors duration-300 sm:px-3 ${on ? "font-medium text-white" : "text-[#b4b7c3] hover:text-white"}`;

  return (
    <nav aria-label="주 메뉴" className="flex items-center gap-0.5 rounded-lg border border-white/15 p-0.5">
      {/* SalesTology — 펼치면 하위 메뉴를 품은 하나의 칸이 된다 */}
      <div className={`flex items-center rounded-md transition-[background-color] duration-300 ease-out ${expanded ? "bg-white/[0.10]" : "bg-transparent"}`}>
        <Link href="/dashboard" onClick={() => onGo?.(true)} aria-expanded={expanded} className={top(expanded)}>
          SalesTology
        </Link>
        {/* 0fr → 1fr 로 폭을 부드럽게 늘린다 (내용 폭을 몰라도 되는 방법) */}
        <div
          className={`grid transition-[grid-template-columns,opacity] duration-300 ease-out ${expanded ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0"}`}
          aria-hidden={!expanded}
        >
          <div className="flex min-w-0 items-center gap-0.5 overflow-hidden pr-0.5">
            <span aria-hidden className="mx-0.5 h-3 w-px shrink-0 bg-white/20" />
            {SUB.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                tabIndex={expanded ? 0 : -1}
                onClick={() => onGo?.(true)}
                className={`rounded px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors ${
                  subActive === s.href ? "bg-white/[0.16] text-white" : "text-[#9a9db0] hover:text-white"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Link href="/sos" onClick={() => onGo?.(false)} className={`${top(inSos)} ${inSos ? "bg-white/[0.14]" : ""}`}>
        SOS
      </Link>
    </nav>
  );
}

/** Suspense 대기 중 모양 (서버가 정한 영역 기준, 움직임 없음) */
export function AppNavFallback({ active }: { active: "core" | "pipeline" | "sos" }) {
  const inSos = active === "sos";
  return <NavView expanded={!inSos} inSos={inSos} subActive={active === "pipeline" ? "/pipeline" : null} />;
}

/** 주소를 읽어 하위 메뉴·펼침을 정한다 — usePathname 을 쓰므로 반드시 <Suspense> 안에서 쓴다 */
export function AppNav() {
  const pathname = usePathname() ?? "";
  const inSos = pathname === "/sos" || pathname.startsWith("/sos/");
  const target = !inSos;
  const [shown, setShown] = useState<boolean>(() => lastShown ?? target);
  const timer = useRef<number | undefined>(undefined);

  // 보일 때마다(처음·숨겼다 다시 보임·주소 변경): 마지막으로 본 상태를 한 프레임 그린 뒤 목표로 → CSS 전환이 보인다.
  // 숨겨 두었던 헤더는 다시 보일 때 효과가 새로 실행된다 (React Activity)
  useEffect(() => {
    const from = lastShown ?? target;
    lastShown = target;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      setShown(from);
      id2 = requestAnimationFrame(() => setShown(target));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [target]);

  // 숨겨지면 대기 중인 타이머를 버린다 → 바로 다음 헤더가 '누르기 전 상태'에서 움직인다
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // 누르는 순간 이 헤더가 먼저 움직인다 (페이지 로딩이 느릴 때). 움직임이 끝난 뒤에야 '본 상태'로 기록
  const go = (next: boolean) => {
    setShown(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastShown = next;
    }, DURATION_MS);
  };

  // SOS 강조도 펼침 상태를 따라가 누르는 순간 바뀐다
  const subActive = SUB.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.href ?? null;
  return <NavView expanded={shown} inSos={!shown} subActive={shown ? subActive : null} onGo={go} />;
}
