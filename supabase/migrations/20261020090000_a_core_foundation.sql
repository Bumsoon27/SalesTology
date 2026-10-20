-- A 영역 공통 기반 (설계서 §3.2, §3.4)
-- 공용 테이블: teams, profiles, companies — A 소유. B는 읽기·FK 참조만 한다.
-- 규칙: 한 번 main 에 합쳐진 마이그레이션 파일은 절대 수정하지 않는다. 고칠 땐 새 파일을 만든다.

-- ─── 공용 트리거 함수 ────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── teams (부문) ────────────────────────────────────────────────
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

insert into public.teams (name, join_code) values
  ('Enterprise사업부문', '1000'),
  ('솔루션사업부문',     '2000'),
  ('DX사업부문',         '3000'),
  ('기술/연구소부문',    '4000');

-- ─── profiles (사용자, auth.users 1:1) ───────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  login_id    text not null unique check (login_id ~ '^[a-z0-9]{4,20}$'),
  name        text not null,
  team_id     uuid references public.teams (id),
  role        text not null default 'member' check (role in ('admin', 'member')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index profiles_team_id_idx on public.profiles (team_id);

-- ─── companies (고객사·SI·매입처 공용) ────────────────────────────
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  name        text not null,
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 부문 내 회사명 중복 금지 (삭제되지 않은 것 기준)
create unique index companies_team_name_uq
  on public.companies (team_id, name)
  where deleted_at is null;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ─── RLS 헬퍼 (비활성 사용자는 어떤 행도 볼 수 없게 is_active 를 함께 검사) ───
create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.profiles
  where id = (select auth.uid()) and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active and role = 'admin'
  );
$$;

revoke execute on function public.current_team_id() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ─── RLS 정책 ────────────────────────────────────────────────────
alter table public.teams     enable row level security;
alter table public.profiles  enable row level security;
alter table public.companies enable row level security;

-- teams: join_code 는 클라이언트에서 조회 불가 (컬럼 권한으로 차단, 검증은 서버에서만)
revoke all on public.teams from anon, authenticated;
grant select (id, name, created_at) on public.teams to authenticated;

create policy teams_select on public.teams
  for select to authenticated
  using (public.is_admin() or id = public.current_team_id());

-- profiles: 같은 부문 사용자 조회. 생성은 서버(secret key)에서만, 수정은 관리자만.
revoke insert, delete on public.profiles from anon, authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or team_id = public.current_team_id()
  );

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- companies: 자기 부문 조회·생성·수정. 삭제된 행은 관리자만 본다(복구용).
revoke delete on public.companies from anon, authenticated;

create policy companies_select on public.companies
  for select to authenticated
  using (
    public.is_admin()
    or (team_id = public.current_team_id() and deleted_at is null)
  );

create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.is_admin() or team_id = public.current_team_id());

create policy companies_update on public.companies
  for update to authenticated
  using (public.is_admin() or (team_id = public.current_team_id() and deleted_at is null))
  with check (public.is_admin() or team_id = public.current_team_id());
