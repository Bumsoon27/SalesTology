-- A 영역: 경쟁사 기록 — 사업마다 경쟁사·제안(입찰)가·낙찰 여부. 리포트의 '경쟁사별 전적'에 쓴다
-- 조회: 사업을 볼 수 있는 사람. 추가: 같은 조건 + 기록자 본인. 지우기: 기록자·관리자
-- (나중에 SOS 낙찰정보와 연결할 수 있게 source_ref 를 비워 둔다 — B 와 협의 후)

create table public.deal_competitors (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id),
  name        text not null check (length(trim(name)) between 1 and 100),
  bid_amount  numeric(15, 0) check (bid_amount is null or bid_amount >= 0),
  is_winner   boolean not null default false,
  note        text check (note is null or length(note) <= 300),
  source_ref  text check (source_ref is null or length(source_ref) <= 200),
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index deal_competitors_deal_idx on public.deal_competitors (deal_id);
-- 한 사업에 같은 경쟁사는 한 번 (대소문자·앞뒤 공백 무시)
create unique index deal_competitors_deal_name_uq on public.deal_competitors (deal_id, lower(trim(name)));

alter table public.deal_competitors enable row level security;
revoke all on public.deal_competitors from anon, authenticated;
grant select, insert, delete on public.deal_competitors to authenticated;
grant all on public.deal_competitors to service_role;

create policy deal_competitors_select on public.deal_competitors for select to authenticated
  using (public.can_access_deal(deal_id));
create policy deal_competitors_insert on public.deal_competitors for insert to authenticated
  with check (public.can_access_deal(deal_id) and created_by = (select auth.uid()) and source_ref is null);
create policy deal_competitors_delete on public.deal_competitors for delete to authenticated
  using (public.can_access_deal(deal_id) and (created_by = (select auth.uid()) or public.is_admin()));

create trigger deal_competitors_touch after insert on public.deal_competitors
  for each row execute function public.touch_deal_activity();
