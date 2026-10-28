-- A 영역: 실주 사유 — 실주로 바꿀 때 사유(고정 목록)와 짧은 메모. 리포트의 '실주 사유'에 쓴다
-- 값 목록은 src/features/deals/loss.ts 와 맞춘다
alter table public.deals
  add column lost_reason text check (lost_reason is null or lost_reason in ('price', 'competitor', 'budget', 'timing', 'requirement', 'relationship', 'other')),
  add column lost_note text check (lost_note is null or length(lost_note) <= 200);

-- 열 단위 수정 권한(review_hardening)에 두 칸 추가 — 행 권한은 기존 deals_update 정책 그대로
grant update (lost_reason, lost_note) on public.deals to authenticated;
