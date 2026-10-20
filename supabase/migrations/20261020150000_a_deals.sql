-- A 영역: 영업기회(사업)·관계사·추적 업무·이슈·변경 이력·알림 읽음 (설계서 §3.2~3.4)
-- 규칙: 한 번 main 에 합쳐진 마이그레이션 파일은 수정하지 않는다.

-- ─── deals (사업 = 영업기회) ─────────────────────────────────────
create table public.deals (
  id                       uuid primary key default gen_random_uuid(),
  team_id                  uuid not null references public.teams (id),
  owner_id                 uuid not null references public.profiles (id),
  customer_id              uuid not null references public.companies (id),
  name                     text not null check (length(trim(name)) > 0),
  contract_type            text not null check (contract_type in ('competitive', 'negotiated')),
  stage                    text not null default 'discovery'
                           check (stage in ('discovery', 'quoting', 'proposal', 'negotiation', 'bidding', 'won', 'fulfillment', 'billing')),
  status                   text not null default 'active' check (status in ('active', 'on_hold', 'lost', 'closed')),
  amount                   numeric(15, 0) check (amount is null or amount >= 0),
  expected_contract_month  date check (expected_contract_month is null or extract(day from expected_contract_month) = 1),
  period_start             date,
  period_end               date,
  items                    text,
  last_activity_at         timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  check (period_end is null or period_start is null or period_end >= period_start),
  check (stage <> 'bidding' or contract_type = 'competitive')
);
create index deals_team_idx on public.deals (team_id) where deleted_at is null;
create index deals_owner_idx on public.deals (owner_id) where deleted_at is null;
create index deals_customer_idx on public.deals (customer_id);

-- ─── deal_parties (SI·매입처) ────────────────────────────────────
create table public.deal_parties (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id),
  company_id    uuid not null references public.companies (id),
  role          text not null check (role in ('si', 'supplier')),
  via_party_id  uuid references public.deal_parties (id),
  created_at    timestamptz not null default now(),
  unique (deal_id, company_id, role)
);
create index deal_parties_deal_idx on public.deal_parties (deal_id);

-- ─── deal_tasks (추적 업무) ──────────────────────────────────────
create table public.deal_tasks (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references public.deals (id),
  type             text not null check (type in ('contract', 'quote_reply_out', 'quote_reply_in', 'order', 'delivery', 'inspection', 'invoice_out', 'invoice_in', 'custom')),
  title            text,
  company_id       uuid references public.companies (id),
  assignee_id      uuid references public.profiles (id),
  requested_at     date,
  due_date         date,
  done_at          date,
  excluded_reason  text,
  created_by       uuid not null references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  check (type <> 'custom' or length(trim(coalesce(title, ''))) > 0)
);
create index deal_tasks_deal_idx on public.deal_tasks (deal_id) where deleted_at is null;

-- ─── issues ──────────────────────────────────────────────────────
create table public.issues (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.deals (id),
  title        text not null check (length(trim(title)) > 0),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  created_by   uuid not null references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index issues_deal_idx on public.issues (deal_id);

-- ─── activity_log (변경 이력) ────────────────────────────────────
create table public.activity_log (
  id           bigint generated always as identity primary key,
  team_id      uuid not null,
  actor_id     uuid references public.profiles (id),
  entity_type  text not null check (entity_type in ('deal', 'deal_task', 'issue', 'deal_party', 'company')),
  entity_id    uuid not null,
  deal_id      uuid,
  action       text not null check (action in ('create', 'update', 'delete', 'restore', 'stage_change')),
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index activity_log_deal_idx on public.activity_log (deal_id, created_at desc);

-- ─── notification_reads ──────────────────────────────────────────
create table public.notification_reads (
  user_id           uuid not null references public.profiles (id) default auth.uid(),
  notification_key  text not null,
  read_at           timestamptz not null default now(),
  primary key (user_id, notification_key)
);

-- ─── 트리거: updated_at ─────────────────────────────────────────
create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.set_updated_at();
create trigger deal_tasks_set_updated_at before update on public.deal_tasks
  for each row execute function public.set_updated_at();

-- ─── 트리거: 소프트 삭제·복구 권한 (삭제: 사업 담당자 또는 관리자, 복구: 관리자) ───
create or replace function public.guard_soft_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    if tg_table_name = 'deals' then
      v_owner := old.owner_id;
    else
      select owner_id into v_owner from public.deals where id = old.deal_id;
    end if;
    if not (public.is_admin() or v_owner = (select auth.uid())) then
      raise exception '삭제는 사업 담당자 또는 관리자만 할 수 있습니다.' using errcode = '42501';
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    if not public.is_admin() then
      raise exception '복구는 관리자만 할 수 있습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger deals_guard_soft_delete before update of deleted_at on public.deals
  for each row execute function public.guard_soft_delete();
create trigger deal_tasks_guard_soft_delete before update of deleted_at on public.deal_tasks
  for each row execute function public.guard_soft_delete();

-- ─── 트리거: 변경 이력 (데이터 변경과 같은 트랜잭션) ─────────────
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_old    jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new    jsonb := to_jsonb(new);
  v_key    text;
  v_action text;
  v_entity text := case tg_table_name
    when 'deals' then 'deal' when 'deal_tasks' then 'deal_task' when 'issues' then 'issue'
    when 'deal_parties' then 'deal_party' else 'company' end;
  v_deal_id uuid := case when tg_table_name = 'deals' then new.id
                         when tg_table_name = 'companies' then null
                         else (v_new ->> 'deal_id')::uuid end;
  v_team uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
    v_after := v_new - 'created_at' - 'updated_at';
  else
    -- 바뀐 필드만 남긴다 (시스템 시각 컬럼 제외)
    v_before := '{}'::jsonb;
    v_after := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key in ('updated_at', 'last_activity_at', 'created_at') then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_before := v_before || jsonb_build_object(v_key, v_old -> v_key);
        v_after := v_after || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if v_after = '{}'::jsonb then return new; end if;
    v_action := case
      when v_after ? 'deleted_at' and (v_new ->> 'deleted_at') is not null then 'delete'
      when v_after ? 'deleted_at' then 'restore'
      when v_after ? 'stage' then 'stage_change'
      else 'update' end;
  end if;

  if tg_table_name in ('deals', 'companies') then
    v_team := (v_new ->> 'team_id')::uuid;
  else
    select team_id into v_team from public.deals where id = v_deal_id;
  end if;

  insert into public.activity_log (team_id, actor_id, entity_type, entity_id, deal_id, action, before, after)
  values (v_team, (select auth.uid()), v_entity, (v_new ->> 'id')::uuid, v_deal_id, v_action, v_before, v_after);
  return new;
end;
$$;

create trigger deals_log after insert or update on public.deals
  for each row execute function public.log_activity();
create trigger deal_tasks_log after insert or update on public.deal_tasks
  for each row execute function public.log_activity();
create trigger issues_log after insert or update on public.issues
  for each row execute function public.log_activity();
create trigger deal_parties_log after insert or update on public.deal_parties
  for each row execute function public.log_activity();
create trigger companies_log after insert or update on public.companies
  for each row execute function public.log_activity();

-- ─── 트리거: 사업의 마지막 활동 시각 ────────────────────────────
create or replace function public.touch_deal_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.deals set last_activity_at = now() where id = new.deal_id;
  return new;
end;
$$;

create or replace function public.touch_own_activity()
returns trigger
language plpgsql
as $$
begin
  new.last_activity_at := now();
  return new;
end;
$$;

create trigger deals_touch before update on public.deals
  for each row when (old.last_activity_at is not distinct from new.last_activity_at)
  execute function public.touch_own_activity();
create trigger deal_tasks_touch after insert or update on public.deal_tasks
  for each row execute function public.touch_deal_activity();
create trigger issues_touch after insert or update on public.issues
  for each row execute function public.touch_deal_activity();
create trigger deal_parties_touch after insert or update on public.deal_parties
  for each row execute function public.touch_deal_activity();

-- ─── RLS ────────────────────────────────────────────────────────
alter table public.deals              enable row level security;
alter table public.deal_parties       enable row level security;
alter table public.deal_tasks         enable row level security;
alter table public.issues             enable row level security;
alter table public.activity_log       enable row level security;
alter table public.notification_reads enable row level security;

-- 물리 삭제는 막는다 (소프트 삭제만). 관계사 연결·읽음은 실제 삭제 허용.
revoke delete on public.deals, public.deal_tasks, public.issues, public.activity_log from anon, authenticated;
revoke insert, update on public.activity_log from anon, authenticated;
revoke all on public.deals, public.deal_parties, public.deal_tasks, public.issues, public.activity_log, public.notification_reads from anon;

-- 사업이 내 부문 것인지 (하위 테이블 공용)
create or replace function public.can_access_deal(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deals d
    where d.id = p_deal_id
      and (public.is_admin() or d.team_id = public.current_team_id())
  );
$$;
revoke execute on function public.can_access_deal(uuid) from public, anon;
grant execute on function public.can_access_deal(uuid) to authenticated;

create policy deals_select on public.deals for select to authenticated
  using (public.is_admin() or (team_id = public.current_team_id() and deleted_at is null));
create policy deals_insert on public.deals for insert to authenticated
  with check (team_id = public.current_team_id() or public.is_admin());
create policy deals_update on public.deals for update to authenticated
  using (public.is_admin() or (team_id = public.current_team_id() and deleted_at is null))
  with check (public.is_admin() or team_id = public.current_team_id());

create policy deal_parties_all on public.deal_parties for all to authenticated
  using (public.can_access_deal(deal_id)) with check (public.can_access_deal(deal_id));

create policy deal_tasks_select on public.deal_tasks for select to authenticated
  using (public.can_access_deal(deal_id) and (deleted_at is null or public.is_admin()));
create policy deal_tasks_insert on public.deal_tasks for insert to authenticated
  with check (public.can_access_deal(deal_id));
create policy deal_tasks_update on public.deal_tasks for update to authenticated
  using (public.can_access_deal(deal_id)) with check (public.can_access_deal(deal_id));

create policy issues_select on public.issues for select to authenticated
  using (public.can_access_deal(deal_id));
create policy issues_insert on public.issues for insert to authenticated
  with check (public.can_access_deal(deal_id));
create policy issues_update on public.issues for update to authenticated
  using (public.can_access_deal(deal_id)) with check (public.can_access_deal(deal_id));

create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

create policy notification_reads_own on public.notification_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── 영업기회 한 번에 등록 (설계서 §6.6) ────────────────────────
-- 고객사·SI·매입처는 이름으로 찾고 없으면 만든다. 빠른 일정은 업무로 만든다. 한 트랜잭션.
create or replace function public.ensure_company(p_team uuid, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := trim(p_name);
begin
  select id into v_id from public.companies
    where team_id = p_team and name = v_name and deleted_at is null;
  if v_id is null then
    insert into public.companies (team_id, name) values (p_team, v_name) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_deal(
  p_name text,
  p_customer text,
  p_contract_type text,
  p_stage text default 'discovery',
  p_amount numeric default null,
  p_expected_contract_month date default null,
  p_period_start date default null,
  p_period_end date default null,
  p_items text default null,
  p_si text[] default '{}',
  p_suppliers text[] default '{}',
  p_contract_date date default null,
  p_delivery_date date default null,
  p_invoice_date date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid := public.current_team_id();
  v_me uuid := (select auth.uid());
  v_deal uuid;
  v_name text;
begin
  if v_team is null then
    raise exception '부문에 소속된 사용자만 사업을 등록할 수 있습니다.' using errcode = '42501';
  end if;

  insert into public.deals (team_id, owner_id, customer_id, name, contract_type, stage, amount,
                            expected_contract_month, period_start, period_end, items)
  values (v_team, v_me, public.ensure_company(v_team, p_customer), trim(p_name), p_contract_type,
          coalesce(p_stage, 'discovery'), p_amount, date_trunc('month', p_expected_contract_month)::date,
          p_period_start, p_period_end, nullif(trim(coalesce(p_items, '')), ''))
  returning id into v_deal;

  foreach v_name in array coalesce(p_si, '{}') loop
    if length(trim(v_name)) > 0 then
      insert into public.deal_parties (deal_id, company_id, role)
      values (v_deal, public.ensure_company(v_team, v_name), 'si') on conflict do nothing;
    end if;
  end loop;
  foreach v_name in array coalesce(p_suppliers, '{}') loop
    if length(trim(v_name)) > 0 then
      insert into public.deal_parties (deal_id, company_id, role)
      values (v_deal, public.ensure_company(v_team, v_name), 'supplier') on conflict do nothing;
    end if;
  end loop;

  if p_contract_date is not null then
    insert into public.deal_tasks (deal_id, type, assignee_id, due_date) values (v_deal, 'contract', v_me, p_contract_date);
  end if;
  if p_delivery_date is not null then
    insert into public.deal_tasks (deal_id, type, assignee_id, due_date) values (v_deal, 'delivery', v_me, p_delivery_date);
  end if;
  if p_invoice_date is not null then
    insert into public.deal_tasks (deal_id, type, assignee_id, due_date) values (v_deal, 'invoice_out', v_me, p_invoice_date);
  end if;

  return v_deal;
end;
$$;

revoke execute on function public.ensure_company(uuid, text) from public, anon;
revoke execute on function public.create_deal(text, text, text, text, numeric, date, date, date, text, text[], text[], date, date, date) from public, anon;
grant execute on function public.ensure_company(uuid, text) to authenticated;
grant execute on function public.create_deal(text, text, text, text, numeric, date, date, date, text, text[], text[], date, date, date) to authenticated;

-- ─── 실시간 반영 (설계서 §7.4) ──────────────────────────────────
alter publication supabase_realtime add table public.deals, public.deal_tasks, public.issues, public.deal_parties, public.companies;
