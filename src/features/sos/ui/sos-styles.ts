// SOS 화면 공통 모양 (시각 설계서 §5.1·§5.4)
import type { SourceLineState } from "../run/progress";

export const secondaryButton =
  "relative h-8 rounded-[6px] border border-[var(--sos-divider)] px-3 text-sm text-[var(--sos-text)] transition-colors duration-200 hover:text-[var(--sos-accent)] disabled:cursor-not-allowed disabled:text-[var(--sos-disabled)] " +
  // 32px 버튼의 누르는 영역을 44px 로 넓힌다
  "before:absolute before:-inset-x-0 before:-inset-y-1.5 before:content-['']";

export const dangerButton = secondaryButton.replace("text-[var(--sos-text)]", "text-[var(--sos-red)]");

// 작은 글자 링크·버튼의 누르는 영역을 44px 이상으로 넓힌다 (시각 설계서 §5.1)
export const touchArea = "relative before:absolute before:-inset-x-1 before:-inset-y-3.5 before:content-['']";

export const textButton = "text-sm text-[var(--sos-text-sub)] transition-colors duration-200 hover:text-[var(--sos-accent)] disabled:cursor-not-allowed disabled:text-[var(--sos-disabled)]";

export const inputField =
  "h-11 rounded-[4px] border border-[var(--sos-divider)] bg-[var(--sos-bg-input)] px-3 text-sm text-[var(--sos-text)] placeholder:text-[var(--sos-text-hint)]";

// 터치 화면에서는 입력칸도 44px
export const smallField =
  "h-8 pointer-coarse:h-11 rounded-[4px] border border-[var(--sos-divider)] bg-[var(--sos-bg-input)] px-2 text-sm text-[var(--sos-text)] placeholder:text-[var(--sos-text-hint)]";

export const sectionTitle = "text-base font-semibold text-[var(--sos-text)]";
export const panel = "flex flex-col gap-4 rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] p-5";

// 출처별 줄 상태 글자 색 — 수집 진행과 실행 기록이 같이 쓴다. 색만으로 전하지 않게 항상 글자와 함께
export const STATE_COLOR: Record<SourceLineState, string> = {
  waiting: "text-[var(--sos-text-hint)]",
  active: "text-[var(--sos-accent)]",
  done: "text-[var(--sos-text-sub)]",
  failed: "text-[var(--sos-red)]",
};
