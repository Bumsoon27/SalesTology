-- A 영역: 월별 수주 목표(쿼터) — 부문 목표(owner_id null)와 개인 목표. 리포트의 달성률에 쓴다
-- 조회: 같은 부문(관리자 전체). 쓰기: 부문 목표는 그 부문 구성원·관리자, 개인 목표는 본인·관리자
-- (관리자 계정은 부문이 없어 리포트 화면을 쓰지 않으므로 부문 목표는 구성원이 정한다)

create table public.sales_targets (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  owner_id    uuid references public.profiles (id),          -- null = 부문 전체 목표
  month       date not null check (extract(day from month) = 1),
  amount      numeric(15, 0) not null check (amount >= 0),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);
-- 같은 달·같은 대상은 하나 (부문 목표는 owner_id 가 null 이라 별도 인덱스)
create unique index sales_targets_owner_month_uq on public.sales_targets (team_id, owner_id, month) where owner_id is not null;
create unique index sales_targets_team_month_uq on public.sales_targets (team_id, month) where owner_id is null;

create trigger sales_targets_set_updated_at before update on public.sales_targets
  for each row execute function public.set_updated_at();

alter table public.sales_targets enable row level security;
revoke all on public.sales_targets from anon, authenticated;
grant select, insert, update, delete on public.sales_targets to authenticated;
grant all on public.sales_targets to service_role;

create policy sales_targets_select on public.sales_targets for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- 쓰기 조건: 관리자, 또는 내 부문의 부문 목표·내 개인 목표. 개인 목표 대상은 그 부문 사람이어야 한다
create policy sales_targets_insert on public.sales_targets for insert to authenticated
  with check (
    (public.is_admin() or (team_id = public.current_team_id() and (owner_id is null or owner_id = (select auth.uid()))))
    and (owner_id is null or exists (select 1 from public.profiles p where p.id = owner_id and p.team_id = sales_targets.team_id))
  );
create policy sales_targets_update on public.sales_targets for update to authenticated
  using (public.is_admin() or (team_id = public.current_team_id() and (owner_id is null or owner_id = (select auth.uid()))))
  with check (
    (public.is_admin() or (team_id = public.current_team_id() and (owner_id is null or owner_id = (select auth.uid()))))
    and (owner_id is null or exists (select 1 from public.profiles p where p.id = owner_id and p.team_id = sales_targets.team_id))
  );
create policy sales_targets_delete on public.sales_targets for delete to authenticated
  using (public.is_admin() or (team_id = public.current_team_id() and (owner_id is null or owner_id = (select auth.uid()))));
