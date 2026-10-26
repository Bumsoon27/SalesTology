"use client";

// 상단 주 메뉴: [SalesTology ▸ 대시보드 · 파이프라인] [SOS]
// SalesTology 를 누르면 그 칸이 늘어나며 하위 메뉴가 나오고, SOS 를 누르면 접힌다.
//
// 펼침 상태는 모든 헤더가 '하나'를 같이 본다 (모듈 저장소 + useSyncExternalStore).
// 헤더는 페이지마다 따로 그려지고, Next 16 은 지나온 페이지를 숨긴 채 살려 두기 때문에
// 헤더마다 상태를 따로 두면 다시 보일 때 예전 상태로 튀었다 (운영에서 확인).
// 누르는 순간 저장소를 바꿔 보이는 헤더가 바로 움직이고, 다음 페이지 헤더는 이미 같은 상태로 나타난다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const store = { value: null as boolean | null, listeners: new Set<() => void>() };
function setShared(v: boolean) {
  if (store.value === v) return;
  store.value = v;
  for (const l of store.listeners) l();
}
function subscribe(l: () => void) {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
}

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
  const shared = useSyncExternalStore(
    subscribe,
    () => store.value,
    () => null,
  );
  const expanded = shared ?? target;

  // 주소가 기준 — 뒤로가기 등 클릭 없이 바뀐 경우도 맞춘다 (보이는 헤더에서만 실행된다)
  useEffect(() => setShared(target), [target]);

  // SOS 강조도 펼침 상태를 따라가 누르는 순간 바뀐다
  const subActive = SUB.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.href ?? null;
  return <NavView expanded={expanded} inSos={!expanded} subActive={expanded ? subActive : null} onGo={setShared} />;
}
