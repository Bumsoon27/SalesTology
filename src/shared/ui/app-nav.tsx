"use client";

// 상단 주 메뉴: [SalesTology ▸ 대시보드 · 파이프라인] [SOS]
// SalesTology 를 누르면 그 칸이 늘어나며 하위 메뉴가 나오고, SOS 를 누르면 접힌다.
// 헤더는 페이지마다 새로 그려지므로 마지막 펼침 상태를 모듈 변수에 기억해 두고,
// 새 헤더가 그 상태에서 시작해 다음 프레임에 목표 상태로 옮겨 가게 한다 → 페이지가 바뀌어도 끊김 없이 이어진다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

let lastExpanded: boolean | null = null;

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
  const [expanded, setExpanded] = useState<boolean>(() => lastExpanded ?? target);

  // 경로가 바뀌면 목표 상태로 (첫 그림은 이전 상태 → 다음 프레임에 전환해 애니메이션이 보이게)
  useEffect(() => {
    const id = requestAnimationFrame(() => setExpanded(target));
    lastExpanded = target;
    return () => cancelAnimationFrame(id);
  }, [target]);

  // 누르는 순간 바로 움직이기 시작 (페이지 로딩을 기다리지 않는다)
  const go = (next: boolean) => {
    lastExpanded = next;
    setExpanded(next);
  };

  const subActive = SUB.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.href ?? null;
  return <NavView expanded={expanded} inSos={inSos} subActive={subActive} onGo={go} />;
}
