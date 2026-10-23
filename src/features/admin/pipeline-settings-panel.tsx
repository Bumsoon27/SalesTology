"use client";

// 관리자: 부문별 파이프라인 설정 — 단계별 성사 확률(가중 예상)과 정체 기준일(AI 디렉션·정체 표시)
import { useState, useTransition } from "react";
import { STAGES, type PipelineSettings } from "@/features/deals/pipeline-settings";
import { STAGE_LABEL } from "@/features/deals/types";
import { savePipelineSettings } from "./actions";
import type { AdminTeam } from "./queries";

const card = "rounded-2xl border border-line bg-surface/70";

export function PipelineSettingsPanel({ teams, settings }: { teams: AdminTeam[]; settings: Record<string, PipelineSettings> }) {
  return (
    <section className={card}>
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold">파이프라인 설정</h2>
        <p className="mt-0.5 text-[11px] text-muted">단계별 성사 확률(%)은 대시보드 &lsquo;가중 예상&rsquo;에, 정체 기준일은 정체 표시·AI 디렉션에 쓰입니다.</p>
      </div>
      <ul>
        {teams.map((t) => (
          <TeamSettings key={t.id} team={t} initial={settings[t.id]} />
        ))}
      </ul>
    </section>
  );
}

function TeamSettings({ team, initial }: { team: AdminTeam; initial: PipelineSettings }) {
  const [prob, setProb] = useState<Record<string, string>>(() => Object.fromEntries(STAGES.map((s) => [s, String(initial.probabilities[s])])));
  const [days, setDays] = useState(String(initial.staleAfterDays));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="border-b border-line px-5 py-4 last:border-0">
      <form
        className={`space-y-3 ${pending ? "opacity-60" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await savePipelineSettings(team.id, { probabilities: prob, staleAfterDays: days });
            setMsg(r.ok ? { ok: true, text: "저장했습니다." } : { ok: false, text: r.error ?? "저장하지 못했습니다." });
          });
        }}
      >
        <p className="text-sm font-medium">{team.name}</p>
        <div className="grid grid-cols-4 gap-2">
          {STAGES.map((s) => (
            <label key={s} className="text-[11px] text-muted">
              {STAGE_LABEL[s]}
              <span className="mt-1 flex items-center gap-1">
                <input
                  inputMode="numeric"
                  value={prob[s]}
                  onChange={(e) => setProb((p) => ({ ...p, [s]: e.target.value }))}
                  className="field w-full py-1 text-right text-xs"
                  aria-label={`${STAGE_LABEL[s]} 성사 확률`}
                />
                %
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            정체 기준
            <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="field w-16 py-1 text-right text-xs" aria-label="정체 기준일" />일
          </label>
          <div className="flex items-center gap-2">
            {msg && <span className={`text-[11px] ${msg.ok ? "text-st-green" : "text-st-red"}`}>{msg.text}</span>}
            <button type="submit" disabled={pending} className="rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg disabled:opacity-40">
              저장
            </button>
          </div>
        </div>
      </form>
    </li>
  );
}
