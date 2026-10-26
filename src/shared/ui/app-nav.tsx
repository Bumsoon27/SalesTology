"use client";

// 상단 주 메뉴: [SalesTology ▸ 대시보드 · 파이프라인] [SOS]
// SalesTology 를 누르면 그 칸이 늘어나며 하위 메뉴가 나오고, SOS 를 누르면 접힌다.
//
// 끊김 없이 움직이게 한 방법 (운영에서 측정하며 정함)
// 1) 펼침 상태는 모든 헤더가 하나를 같이 그린다 (useSyncExternalStore).
//    헤더는 페이지마다 따로 있고 Next 16 은 지나온 페이지를 숨긴 채 살려 두므로, 따로 두면 다시 보일 때 예전 값으로 튀었다.
// 2) 누르면 먼저 펼침/접힘을 움직이고(ANIM_MS), 끝난 뒤 페이지를 바꾼다.
//    페이지 전환 중 메인 스레드가 수백 ms 바빠져(대시보드 그래프 등) 동시에 하면 애니메이션이 끊겼다.
//    펼침 상태가 그대로인 이동(대시보드↔파이프라인)은 기다리지 않는다. Ctrl·Cmd·가운데 클릭(새 탭)은 브라우저 기본 동작.
// 3) 뒤로가기처럼 클릭 없이 주소가 바뀌면, 보이게 된 헤더가 주소에 맞춰 상태를 고친다.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type MouseEvent } from "react";

const ANIM_MS = 260;

const visual = { value: null as boolean | null, listeners: new Set<() => void>(), timer: 0 };
function setVisual(v: boolean) {
  if (visual.value === v) return;
  visual.value = v;
  for (const l of visual.listeners) l();
}
function subscribe(l: () => void) {
  visual.listeners.add(l);
  return () => visual.listeners.delete(l);
}

const SUB = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/pipeline", label: "파이프라인" },
] as const;
type SubHref = (typeof SUB)[number]["href"];

type Go = (e: MouseEvent<HTMLAnchorElement>, href: string, expand: boolean) => void;

/** 그리기만 하는 부분 — 주소를 읽기 전(Suspense 대기)에도 같은 모양으로 보이게 */
function NavView({ expanded, subActive, onGo }: { expanded: boolean; subActive: SubHref | null; onGo?: Go }) {
  const top = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors duration-300 sm:px-3 ${on ? "font-medium text-white" : "text-[#b4b7c3] hover:text-white"}`;

  return (
    <nav aria-label="주 메뉴" className="flex items-center gap-0.5 rounded-lg border border-white/15 p-0.5">
      {/* SalesTology — 펼치면 하위 메뉴를 품은 하나의 칸이 된다 */}
      <div className={`flex items-center rounded-md transition-[background-color] duration-300 ease-out ${expanded ? "bg-white/[0.10]" : "bg-transparent"}`}>
        <Link href="/dashboard" onClick={(e) => onGo?.(e, "/dashboard", true)} aria-expanded={expanded} className={top(expanded)}>
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
                onClick={(e) => onGo?.(e, s.href, true)}
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
      <Link href="/sos" onClick={(e) => onGo?.(e, "/sos", false)} className={`${top(!expanded)} ${!expanded ? "bg-white/[0.14]" : ""}`}>
        SOS
      </Link>
    </nav>
  );
}

/** Suspense 대기 중 모양 (서버가 정한 영역 기준, 움직임 없음) */
export function AppNavFallback({ active }: { active: "core" | "pipeline" | "sos" }) {
  return <NavView expanded={active !== "sos"} subActive={active === "pipeline" ? "/pipeline" : null} />;
}

/** 주소를 읽어 하위 메뉴·펼침을 정한다 — usePathname 을 쓰므로 반드시 <Suspense> 안에서 쓴다 */
export function AppNav() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const inSos = pathname === "/sos" || pathname.startsWith("/sos/");
  const target = !inSos;
  const v = useSyncExternalStore(
    subscribe,
    () => visual.value,
    () => null,
  );
  const shown = v ?? target;

  // 보이게 된 헤더가 주소에 맞춘다 (뒤로가기·주소 직접 입력 등)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisual(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const go: Go = (e, href, expand) => {
    // 새 탭·새 창 열기는 그대로 둔다
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (expand === shown) return; // 펼침 상태가 같으면 그냥 이동 (Link 기본 동작)
    e.preventDefault();
    window.clearTimeout(visual.timer);
    setVisual(expand); // 먼저 움직이고
    router.prefetch(href);
    visual.timer = window.setTimeout(() => router.push(href), ANIM_MS); // 끝나면 이동
  };

  const subActive = SUB.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.href ?? null;
  return <NavView expanded={shown} subActive={shown ? subActive : null} onGo={go} />;
}
