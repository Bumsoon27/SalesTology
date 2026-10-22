"use client";

// 왼쪽 상세 패널: 노드를 누르면 사업의 전반적인 흐름을 보여준다 (설계서 §6.5)
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadNodeDetail, type CompanyDetail, type DealDetail, type NodeDetail } from "./detail";
import {
  addIssue, addTask, completeTask, excludeTask, reopenTask, rescheduleTask, resolveIssue, updateDeal, type MutationResult,
} from "./mutations";
import type { DealStatus, TaskType } from "./types";
import { computeTaskState, daysUntil } from "./status";
import { STAGE_LABEL, TASK_LABEL, type DealStage } from "./types";
import type { UniverseNode } from "@/features/topology/types";
import { DealInfoEditor } from "./deal-info-editor";

const FLOW: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];
const STATUS_TONE: Record<string, string> = {
  red: "border-st-red/50 text-st-red",
  yellow: "border-st-yellow/50 text-st-yellow",
  green: "border-accent/50 text-accent",
  hold: "border-line text-muted",
  grey: "border-line text-muted",
};

function won(n: number | null) {
  if (n == null) return "-";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 ? 1 : 0)}억 원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만 원`;
  return `${n.toLocaleString()} 원`;
}
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
};

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-line px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function DetailPanel({ node, onClose }: { node: UniverseNode | null; onClose: () => void }) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const silent = useRef(false);

  useEffect(() => {
    if (!node || node.kind === "me") return;
    let alive = true;
    const run = async () => {
      // 조치 후 다시 불러올 때는 기존 내용을 유지한다
      if (!silent.current) setLoadingId(node.id);
      silent.current = false;
      const d = await loadNodeDetail(node.id, node.refId);
      if (alive) {
        setDetail(d);
        setLoadingId(null);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [node, version]);

  const reload = () => {
    silent.current = true;
    setVersion((v) => v + 1);
  };

  const open = !!node && node.kind !== "me";
  return (
    <aside
      className={`absolute z-20 flex flex-col overflow-hidden border border-line bg-surface shadow-2xl shadow-black/60 transition-transform duration-300
        max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[72dvh] max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)]
        sm:bottom-3 sm:left-3 sm:top-3 sm:w-[400px] sm:rounded-2xl sm:bg-surface/80 sm:backdrop-blur-xl ${
          open ? "translate-x-0 translate-y-0" : "max-sm:translate-y-[105%] sm:-translate-x-[110%]"
        }`}
      aria-hidden={!open}
    >
      {/* 모바일: 아래에서 올라오는 시트의 손잡이 */}
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
      <div className="flex items-center justify-between px-5 pb-2 pt-3 sm:pt-4">
        <span className="text-[11px] uppercase tracking-wider text-muted">
          {node?.kind === "deal" ? "영업기회" : node?.kind === "customer" ? "고객사" : "파트너사"}
        </span>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-white/5 hover:text-fg" aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loadingId || !detail ? (
          <div className="space-y-3 px-5 py-4">
            {[70, 45, 90, 60].map((w) => (
              <div key={w} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : detail.kind === "deal" ? (
          <DealView d={detail} onChanged={reload} />
        ) : detail.kind === "company" ? (
          <CompanyView c={detail} />
        ) : (
          <p className="px-5 py-4 text-sm text-muted">정보를 찾을 수 없습니다.</p>
        )}
      </div>
    </aside>
  );
}

const STATUS_OPTIONS: [DealStatus, string][] = [
  ["active", "진행"],
  ["on_hold", "보류"],
  ["lost", "실주"],
  ["closed", "종결"],
];
const TASK_TYPES = Object.entries(TASK_LABEL) as [TaskType, string][];
const mini = "rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg";

function DealView({ d, onChanged }: { d: DealDetail; onChanged: () => void }) {
  const router = useRouter();
  const today = d.today;
  const flow = FLOW.filter((s) => s !== "bidding" || d.contractType === "competitive");
  const cur = flow.indexOf(d.stage);
  const si = d.parties.filter((p) => p.role === "si");
  const sup = d.parties.filter((p) => p.role === "supplier");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [newTask, setNewTask] = useState<{ type: TaskType; due: string; title: string }>({ type: "delivery", due: "", title: "" });
  const [newIssue, setNewIssue] = useState("");
  // 수정 중인 사업 id — 다른 노드로 바꾸면 자동으로 보기 모드
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === d.id;

  // 조치 실행 → 패널 다시 불러오기 + 대시보드 색 갱신
  const act = (fn: () => Promise<MutationResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        if (r.conflict) onChanged();
        return;
      }
      setError(null);
      after?.();
      onChanged();
      router.refresh();
    });

  return (
    <div className={pending ? "pointer-events-none opacity-70 transition-opacity" : "transition-opacity"}>
      <div className="space-y-2 px-5 pb-4">
        <h2 className="text-lg font-semibold leading-snug">{d.name}</h2>
        <p className="text-xs text-muted">
          {d.customer.name} · 영업대표 <span className="text-fg">{d.owner ?? "-"}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${STATUS_TONE[d.computed.status]}`}>
            {d.computed.reason ?? "정상"}
          </span>
          <select
            value={d.status}
            onChange={(e) => act(() => updateDeal(d.id, { status: e.target.value as DealStatus }, d.updatedAt))}
            className="ml-auto rounded-md border border-line bg-transparent px-2 py-0.5 text-xs text-muted"
            aria-label="사업 상태"
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v} className="bg-surface">
                {l}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="rounded-lg border border-st-red/40 bg-st-red/10 px-3 py-2 text-xs text-st-red">{error}</p>}
      </div>

      <Section title="사업 흐름" right={<span className="text-[10px] text-muted">단계를 눌러 변경</span>}>
        <ol className="flex items-start">
          {flow.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <span className={`h-px flex-1 ${i === 0 ? "opacity-0" : i <= cur ? "bg-accent/70" : "bg-line"}`} />
                <button
                  type="button"
                  disabled={i === cur}
                  onClick={() => act(() => updateDeal(d.id, { stage: s }, d.updatedAt))}
                  title={`${STAGE_LABEL[s]} 단계로 변경`}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full transition-transform hover:scale-150 ${
                    i === cur ? "bg-fg shadow-[0_0_10px_var(--accent)]" : i < cur ? "bg-accent/80" : "border border-line bg-transparent"
                  }`}
                />
                <span className={`h-px flex-1 ${i === flow.length - 1 ? "opacity-0" : i < cur ? "bg-accent/70" : "bg-line"}`} />
              </div>
              <span className={`text-[10px] ${i === cur ? "text-fg" : "text-muted"}`}>{STAGE_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="핵심 정보"
        right={
          !editing && (
            <button type="button" className={mini} onClick={() => setEditingId(d.id)}>
              수정
            </button>
          )
        }
      >
        {editing ? (
          <DealInfoEditor
            d={d}
            onDone={() => setEditingId(null)}
            onSaved={() => {
              onChanged();
              router.refresh();
            }}
          />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              {[
                ["사업 규모", won(d.amount)],
                ["GP (이윤)", d.gp == null ? "-" : d.amount ? `${won(d.gp)} · ${Math.round((d.gp / d.amount) * 1000) / 10}%` : won(d.gp)],
                ["계약 방식", d.contractType === "competitive" ? "경쟁입찰" : "수의계약"],
                ["계약 기간", d.periodStart ? `${d.periodStart} ~ ${d.periodEnd ?? ""}` : "-"],
                // 예상 계약월은 등록 화면에서 뺐다 — B(SOS) 리드 전환으로 들어온 경우에만 보인다
                ...(d.expectedMonth ? [["예상 계약월", d.expectedMonth.slice(0, 7)]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {d.items && <p className="text-xs text-muted">물품 · {d.items}</p>}
          </>
        )}
      </Section>

      <Section title={`추적 업무 ${d.tasks.length}`}>
        {d.tasks.length === 0 && <p className="text-xs text-muted">등록된 업무가 없습니다.</p>}
        <ul className="space-y-2.5">
          {d.tasks.map((t) => {
            const st = computeTaskState(t);
            const dd = t.due_date ? daysUntil(t.due_date, today) : null;
            const tone =
              st !== "open" ? "text-muted" : dd == null ? "text-st-yellow" : dd < 0 ? "text-st-red" : dd <= 14 ? "text-st-yellow" : "text-fg";
            return (
              <li key={t.id} className="space-y-1.5">
                <div className="flex items-center gap-3 text-sm">
                  <span className={`w-4 text-center ${st === "done" ? "text-st-green" : "text-muted"}`}>
                    {st === "done" ? "✓" : st === "excluded" ? "–" : "○"}
                  </span>
                  <span className={`flex-1 ${st !== "open" ? "text-muted line-through" : ""}`}>{t.type === "custom" ? t.title : TASK_LABEL[t.type]}</span>
                  <span className={`text-xs ${tone}`}>
                    {st === "done"
                      ? `완료 ${t.done_at}`
                      : st === "excluded"
                        ? "제외"
                        : dd == null
                          ? "일정 미등록"
                          : dd < 0
                            ? `+${-dd}일 지남`
                            : dd === 0
                              ? "오늘"
                              : `D-${dd}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-7">
                  {st === "open" ? (
                    <>
                      <button type="button" className={mini} onClick={() => act(() => completeTask(t.id, today))}>
                        완료
                      </button>
                      <label className={`${mini} cursor-pointer`}>
                        일정
                        <input
                          type="date"
                          defaultValue={t.due_date ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) act(() => rescheduleTask(t.id, v));
                          }}
                          className="ml-1 w-[7.5rem] bg-transparent text-[11px] text-fg [color-scheme:dark]"
                        />
                      </label>
                      <button
                        type="button"
                        className={mini}
                        onClick={() => {
                          setExcluding(t.id);
                          setReason("");
                        }}
                      >
                        제외
                      </button>
                    </>
                  ) : (
                    <button type="button" className={mini} onClick={() => act(() => reopenTask(t.id))}>
                      되돌리기
                    </button>
                  )}
                </div>
                {t.excluded_reason && <p className="pl-7 text-[11px] text-muted">사유 · {t.excluded_reason}</p>}
                {excluding === t.id && (
                  <form
                    className="flex gap-1.5 pl-7"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(() => excludeTask(t.id, reason), () => setExcluding(null));
                    }}
                  >
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="제외 사유 (예: 해당 없음 — 라이선스만 납품)"
                      className="field py-1.5 text-xs"
                    />
                    <button type="submit" className={mini}>
                      확인
                    </button>
                    <button type="button" className={mini} onClick={() => setExcluding(null)}>
                      취소
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <form
          className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () => addTask(d.id, { type: newTask.type, dueDate: newTask.due, title: newTask.title }),
              () => setNewTask({ type: "delivery", due: "", title: "" }),
            );
          }}
        >
          <select
            value={newTask.type}
            onChange={(e) => setNewTask({ ...newTask, type: e.target.value as TaskType })}
            className="rounded-md border border-line bg-transparent px-1.5 py-1 text-xs"
            aria-label="업무 유형"
          >
            {TASK_TYPES.map(([v, l]) => (
              <option key={v} value={v} className="bg-surface">
                {l}
              </option>
            ))}
          </select>
          {newTask.type === "custom" && (
            <input
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="업무 제목"
              className="field w-28 py-1 text-xs"
            />
          )}
          <input
            type="date"
            value={newTask.due}
            onChange={(e) => setNewTask({ ...newTask, due: e.target.value })}
            className="rounded-md border border-line bg-transparent px-1.5 py-1 text-xs [color-scheme:dark]"
            aria-label="기한"
          />
          <button type="submit" className={mini}>
            + 업무 추가
          </button>
        </form>
      </Section>

      <Section title={`이슈 ${d.issues.filter((i) => i.status === "open").length}`}>
        <ul className="space-y-1.5">
          {d.issues.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <span className={`flex-1 ${i.status === "open" ? "text-st-red" : "text-muted line-through"}`}>⚠ {i.title}</span>
              {i.status === "open" && (
                <button type="button" className={mini} onClick={() => act(() => resolveIssue(i.id))}>
                  해결
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => addIssue(d.id, newIssue), () => setNewIssue(""));
          }}
        >
          <input value={newIssue} onChange={(e) => setNewIssue(e.target.value)} placeholder="이슈 등록 (예: 납기 지연 우려)" className="field py-1.5 text-xs" />
          <button type="submit" className={mini}>
            등록
          </button>
        </form>
      </Section>

      <Section title="관계사">
        {d.parties.length === 0 ? (
          <p className="text-xs text-muted">SI·매입처 없이 직접 진행</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {[...si, ...sup].map((p) => (
              <span key={p.id} className="rounded-full border border-line px-2.5 py-1 text-xs">
                {p.company.name} <span className="text-muted">· {p.role === "si" ? "SI" : "매입"}</span>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="SOS 시그널" right={<span className="text-[10px] text-muted">B 영역 연동 예정</span>}>
        <p className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
          이 고객사와 관련된 아웃바운드 시그널(SOS)이 여기에 표시됩니다.
        </p>
      </Section>

      <NewsSection names={[d.customer.name, ...si.map((p) => p.company.name)]} />

      <Section title="변경 이력">
        {d.activity.length === 0 ? (
          <p className="text-xs text-muted">이력이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {d.activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-muted">
                <span>
                  <span className="text-fg">{a.actor ?? "시스템"}</span> · {describe(a.action, a.entity, a.after)}
                </span>
                <span className="shrink-0">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

const ENTITY: Record<string, string> = { deal: "사업", deal_task: "업무", issue: "이슈", deal_party: "관계사", company: "회사" };
function describe(action: string, entity: string, after: Record<string, unknown> | null) {
  if (action === "stage_change" && after?.stage) return `단계 → ${STAGE_LABEL[after.stage as DealStage] ?? after.stage}`;
  const verb = { create: "등록", update: "수정", delete: "삭제", restore: "복구" }[action] ?? action;
  return `${ENTITY[entity] ?? entity} ${verb}`;
}

function CompanyView({ c }: { c: CompanyDetail }) {
  const roleLabel = { customer: "고객사", si: "SI", supplier: "매입처" } as const;
  return (
    <>
      <div className="space-y-2 px-5 pb-4">
        <h2 className="text-lg font-semibold">{c.name}</h2>
        {c.contact && <p className="text-xs text-muted">{c.contact}</p>}
        {c.memo && <p className="text-xs text-muted">{c.memo}</p>}
      </div>
      <Section title={`함께한 사업 ${c.deals.length}`}>
        <ul className="space-y-2">
          {c.deals.map((d) => (
            <li key={`${d.id}-${d.asRole}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{d.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {roleLabel[d.asRole]} · {STAGE_LABEL[d.stage]}
                {d.status !== "active" ? ` · ${d.status === "on_hold" ? "보류" : d.status === "lost" ? "실주" : "종결"}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <NewsSection names={[c.name]} />
    </>
  );
}

type News = { items: { title: string; link: string; pubDate: string }[]; configured?: boolean; error?: string };

function NewsSection({ names }: { names: string[] }) {
  const unique = [...new Set(names)].slice(0, 4);
  const [q, setQ] = useState(unique[0]);
  const [news, setNews] = useState<News | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/news?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((j: News) => alive && setNews(j))
      .catch(() => alive && setNews({ items: [], error: "뉴스를 불러오지 못했습니다." }));
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <Section title="관련 뉴스">
      {unique.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {unique.map((n) => (
            <button
              key={n}
              onClick={() => {
                setNews(null);
                setQ(n);
              }}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${q === n ? "border-accent/60 text-fg" : "border-line text-muted"}`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {!news ? (
        <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
      ) : news.configured === false ? (
        <p className="text-xs text-muted">뉴스 연동 키(NAVER_CLIENT_ID·SECRET)가 아직 없습니다.</p>
      ) : news.error ? (
        <p className="text-xs text-st-red">{news.error}</p>
      ) : news.items.length === 0 ? (
        <p className="text-xs text-muted">최근 뉴스가 없습니다.</p>
      ) : (
        <ul className="space-y-2.5">
          {news.items.map((n) => (
            <li key={n.link}>
              <a href={n.link} target="_blank" rel="noreferrer" className="block text-sm leading-snug hover:text-accent">
                {n.title}
              </a>
              <span className="text-[11px] text-muted">{new Date(n.pubDate).toLocaleDateString("ko-KR")}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
