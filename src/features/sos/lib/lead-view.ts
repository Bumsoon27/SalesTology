// 리드 카드·상세 표시 도우미 (순수 — I/O 없음)
import type { SourceId, Stage } from "../types";
import { STAGE_RANK } from "../types";
import { daysUntil } from "./date";
import { isUuid } from "./ids";
import { SOURCE_LABEL, STAGE_LABEL } from "./labels";
import { listHref, type ListQuery } from "./list-query";

export type Tone = "red" | "yellow" | "normal" | "hint";

/** 다음 마감 표시 — D-3 이내 빨강, D-7 이내 노랑. 색만으로 전하지 않게 항상 글자와 함께 쓴다 */
export function deadlineView(iso: string | null, today: string): { text: string; tone: Tone } {
  if (!iso) return { text: "미공개", tone: "hint" };
  const d = daysUntil(iso, today);
  if (d < 0) return { text: "지남", tone: "hint" };
  return { text: `D-${d}`, tone: d <= 3 ? "red" : d <= 7 ? "yellow" : "normal" };
}

export type StageStep = { stage: Stage; label: string; state: "past" | "current" | "future" };

/** 단계 막대: 발주계획 → 사전규격 → 입찰공고 → 낙찰 → 계약 */
export function stageSteps(current: Stage): StageStep[] {
  const now = STAGE_RANK[current];
  return (Object.keys(STAGE_RANK) as Stage[])
    .sort((a, b) => STAGE_RANK[a] - STAGE_RANK[b])
    .map((stage) => ({
      stage,
      label: STAGE_LABEL[stage],
      state: STAGE_RANK[stage] < now ? "past" : STAGE_RANK[stage] === now ? "current" : "future",
    }));
}

/** 발주 시기 — DB 는 월 첫날 date("2026-03-01"), "YYYY-MM" 도 받는다 */
export function formatOrderMonth(v: string | null): string {
  const m = v?.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  return m ? `${m[1]}년 ${Number(m[2])}월` : "미공개";
}

/** 원문 링크는 http(s) 만 (javascript: 등은 버린다) */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** ?lead= 값 — uuid 형식만 받는다 (부문 확인은 조회가 한다) */
export function parseLeadId(v: string | string[] | undefined): string | null {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return isUuid(s) ? s : null;
}

/** 지금 목록 조건을 유지한 채 상세를 열거나(id) 닫는(null) 주소 */
export function leadHref(q: ListQuery, leadId: string | null): string {
  const base = listHref(q, {});
  if (!leadId) return base;
  return `${base}${base.includes("?") ? "&" : "?"}lead=${encodeURIComponent(leadId)}`;
}

export type EvidenceRow = { rawItemId: string; source: SourceId; title: string; publishedAt: string | null; url: string | null };
export type Evidence = { id: string; source: SourceId; sourceLabel: string; title: string; publishedAt: string | null; url: string | null };

/** 근거 시그널 — 실행마다 같은 원본이 다시 걸리므로 원본당 한 줄, 최근 날짜 먼저(날짜 없는 것은 뒤) */
export function evidenceList(rows: EvidenceRow[]): Evidence[] {
  const seen = new Map<string, Evidence>();
  for (const r of rows) {
    if (seen.has(r.rawItemId)) continue;
    seen.set(r.rawItemId, {
      id: r.rawItemId,
      source: r.source,
      sourceLabel: SOURCE_LABEL[r.source] ?? r.source,
      title: r.title,
      publishedAt: r.publishedAt,
      url: safeExternalUrl(r.url),
    });
  }
  const t = (e: Evidence) => (e.publishedAt ? Date.parse(e.publishedAt) : -Infinity);
  return [...seen.values()].sort((a, b) => t(b) - t(a));
}

export type ProductLink = { keywordId: string; product: { id: string; name: string; vendor: string | null } };
export type ProductView = { id: string; name: string; vendor: string | null; terms: string[] };

/** 제안할 제품 — 제품마다 이 리드의 일치 키워드 중 연결된 것 (일치하지 않은 키워드 연결은 버린다) */
export function groupProducts(links: ProductLink[], keywords: { id: string; term: string }[]): ProductView[] {
  const term = new Map(keywords.map((k) => [k.id, k.term]));
  const out = new Map<string, ProductView>();
  for (const l of links) {
    const t = term.get(l.keywordId);
    if (!t) continue;
    const p = out.get(l.product.id) ?? { ...l.product, terms: [] };
    if (!p.terms.includes(t)) p.terms.push(t);
    out.set(l.product.id, p);
  }
  return [...out.values()];
}
