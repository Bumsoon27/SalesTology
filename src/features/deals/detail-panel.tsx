"use client";

// 왼쪽 상세 패널: 노드를 누르면 사업의 전반적인 흐름을 보여준다 (설계서 §6.5)
import { useEffect, useState } from "react";
import { loadNodeDetail, type CompanyDetail, type DealDetail, type NodeDetail } from "./detail";
import { computeTaskState, daysUntil } from "./status";
import { STAGE_LABEL, TASK_LABEL, type DealStage } from "./types";
import type { UniverseNode } from "@/features/topology/types";

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

  useEffect(() => {
    if (!node || node.kind === "me") return;
    let alive = true;
    const run = async () => {
      setLoadingId(node.id);
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
  }, [node]);

  const open = !!node && node.kind !== "me";
  return (
    <aside
      className={`absolute bottom-3 left-3 top-3 z-20 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface/80 shadow-2xl shadow-black/60 backdrop-blur-xl transition-transform duration-300 ${
        open ? "translate-x-0" : "-translate-x-[110%]"
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
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
          <DealView d={detail} />
        ) : detail.kind === "company" ? (
          <CompanyView c={detail} />
        ) : (
          <p className="px-5 py-4 text-sm text-muted">정보를 찾을 수 없습니다.</p>
        )}
      </div>
    </aside>
  );
}

function DealView({ d }: { d: DealDetail }) {
  const today = d.today;
  const flow = FLOW.filter((s) => s !== "bidding" || d.contractType === "competitive");
  const cur = flow.indexOf(d.stage);
  const si = d.parties.filter((p) => p.role === "si");
  const sup = d.parties.filter((p) => p.role === "supplier");

  return (
    <>
      <div className="space-y-2 px-5 pb-4">
        <h2 className="text-lg font-semibold leading-snug">{d.name}</h2>
        <p className="text-xs text-muted">
          {d.customer.name} · 영업대표 <span className="text-fg">{d.owner ?? "-"}</span>
        </p>
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${STATUS_TONE[d.computed.status]}`}>
          {d.computed.reason ?? "정상"}
        </span>
      </div>

      <Section title="사업 흐름">
        <ol className="flex items-start">
          {flow.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <span className={`h-px flex-1 ${i === 0 ? "opacity-0" : i <= cur ? "bg-accent/70" : "bg-line"}`} />
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
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

      <Section title="핵심 정보">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {[
            ["사업 규모", won(d.amount)],
            ["예상 계약월", d.expectedMonth?.slice(0, 7) ?? "-"],
            ["계약 방식", d.contractType === "competitive" ? "경쟁입찰" : "수의계약"],
            ["계약 기간", d.periodStart ? `${d.periodStart} ~ ${d.periodEnd ?? ""}` : "-"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {d.items && <p className="text-xs text-muted">물품 · {d.items}</p>}
      </Section>

      <Section title={`추적 업무 ${d.tasks.length}`}>
        {d.tasks.length === 0 ? (
          <p className="text-xs text-muted">등록된 업무가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {d.tasks.map((t) => {
              const st = computeTaskState(t);
              const dd = t.due_date ? daysUntil(t.due_date, today) : null;
              const tone =
                st !== "open" ? "text-muted" : dd == null ? "text-st-yellow" : dd < 0 ? "text-st-red" : dd <= 14 ? "text-st-yellow" : "text-fg";
              return (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className={`w-4 text-center ${st === "done" ? "text-st-green" : "text-muted"}`}>{st === "done" ? "✓" : st === "excluded" ? "–" : "○"}</span>
                  <span className={`flex-1 ${st !== "open" ? "text-muted line-through" : ""}`}>{t.type === "custom" ? t.title : TASK_LABEL[t.type]}</span>
                  <span className={`text-xs ${tone}`}>
                    {st === "done" ? `완료 ${t.done_at}` : st === "excluded" ? "제외" : dd == null ? "일정 미등록" : dd < 0 ? `+${-dd}일 지남` : dd === 0 ? "오늘" : `D-${dd}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {d.issues.length > 0 && (
        <Section title="이슈">
          <ul className="space-y-1.5">
            {d.issues.map((i) => (
              <li key={i.id} className={`text-sm ${i.status === "open" ? "text-st-red" : "text-muted line-through"}`}>
                ⚠ {i.title}
              </li>
            ))}
          </ul>
        </Section>
      )}

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
    </>
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
