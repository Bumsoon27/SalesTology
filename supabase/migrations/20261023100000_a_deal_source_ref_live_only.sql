-- A 영역: 멱등 키(source_ref)는 삭제되지 않은 사업에만 적용 (B 요청, PR #39)
-- 사업이 soft delete 되면 같은 리드를 다시 전환할 때 새 사업을 만든다.
-- 이전에는 고유 인덱스가 삭제된 사업까지 포함해 unique_violation → RLS 로 안 보이는 행 → null 반환(전환 실패)이었다.
-- 삭제된 사업을 복구할 때 같은 source_ref 의 살아 있는 사업이 있으면 고유 인덱스 위반으로 복구가 막힌다 (의도).

drop index public.deals_team_source_ref_uq;
create unique index deals_team_source_ref_uq
  on public.deals (team_id, source_ref)
  where source_ref is not null and deleted_at is null;

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
  p_invoice_date date default null,
  p_customer_id uuid default null,
  p_owner_id uuid default null,
  p_source_ref text default null,
  p_gp numeric default null
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
    select id into v_deal from public.deals where team_id = v_team and source_ref = v_ref and deleted_at is null;
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
                              expected_contract_month, period_start, period_end, items, source_ref, gp)
    values (v_team, v_owner, v_customer, trim(p_name), p_contract_type,
            coalesce(p_stage, 'discovery'), p_amount, date_trunc('month', p_expected_contract_month)::date,
            p_period_start, p_period_end, nullif(trim(coalesce(p_items, '')), ''), v_ref, p_gp)
    returning id into v_deal;
  exception when unique_violation then
    -- 동시에 두 번 눌러도 사업은 하나
    select id into v_deal from public.deals where team_id = v_team and source_ref = v_ref and deleted_at is null;
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

