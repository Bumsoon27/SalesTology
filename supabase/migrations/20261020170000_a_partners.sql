-- A 영역: 파트너사(SI·매입처) 사전 등록
-- 회사 행에 파트너 역할을 표시한다. 사업과의 실제 관계는 여전히 deal_parties 가 정한다.

alter table public.companies
  add column partner_roles text[] not null default '{}'
    check (partner_roles <@ array['si', 'supplier']::text[]),
  add column contact_name text,
  add column contact_info text;

create index companies_partner_roles_idx on public.companies using gin (partner_roles);

-- 회사를 찾거나 만들고, 파트너 역할을 더한다
create or replace function public.ensure_partner(p_team uuid, p_name text, p_role text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := public.ensure_company(p_team, p_name);
begin
  update public.companies
     set partner_roles = array(select distinct unnest(partner_roles || array[p_role]) order by 1)
   where id = v_id and not (p_role = any (partner_roles));
  return v_id;
end;
$$;

-- 파트너 등록·수정 (이름이 같으면 역할·연락처를 합친다)
create or replace function public.register_partner(
  p_name text,
  p_roles text[],
  p_contact_name text default null,
  p_contact_info text default null,
  p_memo text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid := public.current_team_id();
  v_id uuid;
  v_role text;
begin
  if v_team is null then
    raise exception '부문에 소속된 사용자만 파트너를 등록할 수 있습니다.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception '파트너 이름을 입력하세요.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'SI 또는 매입처 중 하나 이상을 고르세요.' using errcode = '22023';
  end if;

  v_id := public.ensure_company(v_team, p_name);
  foreach v_role in array p_roles loop
    perform public.ensure_partner(v_team, p_name, v_role);
  end loop;

  update public.companies
     set contact_name = coalesce(nullif(trim(p_contact_name), ''), contact_name),
         contact_info = coalesce(nullif(trim(p_contact_info), ''), contact_info),
         memo         = coalesce(nullif(trim(p_memo), ''), memo)
   where id = v_id;
  return v_id;
end;
$$;

-- 영업기회 등록: SI·매입처를 파트너로도 표시하도록 갱신 (서명은 그대로)
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
      values (v_deal, public.ensure_partner(v_team, v_name, 'si'), 'si') on conflict do nothing;
    end if;
  end loop;
  foreach v_name in array coalesce(p_suppliers, '{}') loop
    if length(trim(v_name)) > 0 then
      insert into public.deal_parties (deal_id, company_id, role)
      values (v_deal, public.ensure_partner(v_team, v_name, 'supplier'), 'supplier') on conflict do nothing;
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

revoke execute on function public.ensure_partner(uuid, text, text) from public, anon;
revoke execute on function public.register_partner(text, text[], text, text, text) from public, anon;
grant execute on function public.ensure_partner(uuid, text, text) to authenticated;
grant execute on function public.register_partner(text, text[], text, text, text) to authenticated;
