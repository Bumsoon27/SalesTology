-- A 영역: 다른 영역(B·SOS)에서 사업을 만들 때 필요한 것 (B 설계서 §6.1, §9)
--  1) 출처 참조(source_ref) + 멱등: 같은 리드를 두 번 전환해도 사업은 하나
--  2) 담당자(영업대표) 지정: 같은 부문의 활성 사용자만
--  3) 기존 고객사를 id 로 지정

alter table public.deals add column source_ref text;

create unique index deals_team_source_ref_uq
  on public.deals (team_id, source_ref)
  where source_ref is not null;

-- 서명이 바뀌므로 기존 함수를 지우고 새로 만든다 (새 인자는 모두 기본값이 있어 기존 호출과 호환)
drop function public.create_deal(text, text, text, text, numeric, date, date, date, text, text[], text[], date, date, date);

create function public.create_deal(
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
  p_invoice_date date default null,
  p_customer_id uuid default null,
  p_owner_id uuid default null,
  p_source_ref text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid := public.current_team_id();
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_customer uuid;
  v_deal uuid;
  v_name text;
  v_ref text := nullif(trim(coalesce(p_source_ref, '')), '');
begin
  if v_team is null then
    raise exception '부문에 소속된 사용자만 사업을 등록할 수 있습니다.' using errcode = '42501';
  end if;

  -- 멱등: 같은 출처 참조로 이미 만든 사업이 있으면 그 id 를 돌려준다
  if v_ref is not null then
    select id into v_deal from public.deals where team_id = v_team and source_ref = v_ref;
    if v_deal is not null then
      return v_deal;
    end if;
  end if;

  -- 담당자: 지정하면 같은 부문의 활성 사용자여야 한다
  v_owner := coalesce(p_owner_id, v_me);
  if not exists (select 1 from public.profiles where id = v_owner and team_id = v_team and is_active) then
    raise exception '담당자는 같은 부문의 활성 사용자여야 합니다.' using errcode = '42501';
  end if;

  -- 고객사: id 로 지정하면 같은 부문의 삭제되지 않은 회사여야 한다
  if p_customer_id is not null then
    select id into v_customer from public.companies where id = p_customer_id and team_id = v_team and deleted_at is null;
    if v_customer is null then
      raise exception '고객사를 찾을 수 없습니다.' using errcode = '22023';
    end if;
  else
    v_customer := public.ensure_company(v_team, p_customer);
  end if;

  begin
    insert into public.deals (team_id, owner_id, customer_id, name, contract_type, stage, amount,
                              expected_contract_month, period_start, period_end, items, source_ref)
    values (v_team, v_owner, v_customer, trim(p_name), p_contract_type,
            coalesce(p_stage, 'discovery'), p_amount, date_trunc('month', p_expected_contract_month)::date,
            p_period_start, p_period_end, nullif(trim(coalesce(p_items, '')), ''), v_ref)
    returning id into v_deal;
  exception when unique_violation then
    -- 동시에 두 번 눌러도 사업은 하나
    select id into v_deal from public.deals where team_id = v_team and source_ref = v_ref;
    return v_deal;
  end;

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
    insert into public.deal_tasks (deal_id, type, assignee_id, due_date) values (v_deal, 'contract', v_owner, p_contract_date);
  end if;
  if p_delivery_date is not null then
    insert into public.deal_tasks (deal_id, type, assignee_id, due_date) values (v_deal, 'delivery', v_owner, p_delivery_date);
  end if;
  if p_invoice_date is not null then
    insert into public.deal_tasks (deal_id, type, assignee_id, due_date) values (v_deal, 'invoice_out', v_owner, p_invoice_date);
  end if;

  return v_deal;
end;
$$;

revoke execute on function public.create_deal(text, text, text, text, numeric, date, date, date, text, text[], text[], date, date, date, uuid, uuid, text) from public, anon;
grant execute on function public.create_deal(text, text, text, text, numeric, date, date, date, text, text[], text[], date, date, date, uuid, uuid, text) to authenticated;
