import { stageSteps } from "../lib/lead-view";
import type { Stage } from "../types";

// 단계 막대 (시각 설계서 §5.3): 지난 단계 --sos-text, 현재 단계 오렌지 점 + 글자, 남은 단계 --sos-text-hint. 칸 사이 1px 선
const COLOR = { past: "text-[var(--sos-text)]", current: "text-[var(--sos-accent)]", future: "text-[var(--sos-text-hint)]" };

export function StageBar({ stage }: { stage: Stage }) {
  return (
    <ol aria-label="진행 단계" className="grid grid-cols-5 border-y border-[var(--sos-divider-lite)]">
      {stageSteps(stage).map((s, i) => (
        <li
          key={s.stage}
          aria-current={s.state === "current" ? "step" : undefined}
          className={`flex items-center justify-center gap-1.5 px-1 py-2 text-xs font-medium ${COLOR[s.state]} ${
            i > 0 ? "border-l border-[var(--sos-divider-lite)]" : ""
          }`}
        >
          {s.state === "current" && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--sos-accent)]" />}
          <span className="truncate">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
