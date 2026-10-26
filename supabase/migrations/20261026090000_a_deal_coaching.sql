-- A 영역: 영업기회 AI 코칭 결과 (sLLM 또는 규칙 기반)
-- 캐시: 같은 사업·같은 신호(signals_key)면 다시 부르지 않는다. 사용 상한: 사용자별 하루 호출 수를 이 표로 센다.
-- 모델에는 익명 신호만 보낸다 (src/features/deals/coach/signals.ts). 여기 저장되는 것도 신호와 조언뿐이다.

create table public.deal_coaching (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id),
  user_id       uuid not null default auth.uid() references public.profiles (id),
  source        text not null check (source in ('llm', 'rules')),
  model         text check (model is null or length(model) <= 100),
  signals_key   text not null check (length(signals_key) <= 8000),
  advice        jsonb not null check (jsonb_typeof(advice) = 'object' and length(advice::text) <= 6000),
  created_at    timestamptz not null default now()
);
create index deal_coaching_deal_idx on public.deal_coaching (deal_id, created_at desc);
create index deal_coaching_user_day_idx on public.deal_coaching (user_id, created_at desc);

alter table public.deal_coaching enable row level security;
revoke all on public.deal_coaching from anon, authenticated;
grant select, insert on public.deal_coaching to authenticated;
grant all on public.deal_coaching to service_role;

-- 같은 사업을 볼 수 있는 사람은 결과를 함께 본다 (캐시 공유), 기록자는 본인
create policy deal_coaching_select on public.deal_coaching for select to authenticated
  using (public.can_access_deal(deal_id));
create policy deal_coaching_insert on public.deal_coaching for insert to authenticated
  with check (public.can_access_deal(deal_id) and user_id = (select auth.uid()));

-- 부문별 AI 코칭 사용 여부 (관리자 화면). 기본: 사용
alter table public.team_pipeline_settings add column ai_coach_enabled boolean not null default true;
