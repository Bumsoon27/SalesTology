-- A 영역: 상세 패널에서 고객사·SI·매입처 바꾸기
-- 모두 호출한 사용자 권한(RLS)으로 동작한다. 회사는 사업이 속한 부문 안에서 이름으로 찾고 없으면 만든다.

-- 고객사 바꾸기. 다른 사람이 먼저 고쳤으면(updated_at 다름) false
create function public.set_deal_customer(p_deal_id uuid, p_name text, p_expected_updated_at timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_rows int;
begin
  if v_name = '' then
    raise exception '고객사명을 입력하세요.' using errcode = '22023';
  end if;
  select team_id into v_team from public.deals where id = p_deal_id;
  if v_team is null then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '42501';
  end if;

  update public.deals
     set customer_id = public.ensure_company(v_team, v_name)
   where id = p_deal_id and updated_at = p_expected_updated_at;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- SI·매입처 추가 (이미 있으면 그대로). 회사에 파트너 역할도 더한다
create function public.add_deal_party(p_deal_id uuid, p_name text, p_role text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_company uuid;
begin
  if v_name = '' then
    raise exception '회사명을 입력하세요.' using errcode = '22023';
  end if;
  if p_role not in ('si', 'supplier') then
    raise exception '역할은 si 또는 supplier 입니다.' using errcode = '22023';
  end if;
  select team_id into v_team from public.deals where id = p_deal_id;
  if v_team is null then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '42501';
  end if;

  v_company := public.ensure_partner(v_team, v_name, p_role);
  insert into public.deal_parties (deal_id, company_id, role)
  values (p_deal_id, v_company, p_role)
  on conflict do nothing;
  return v_company;
end;
$$;

-- SI·매입처 빼기. 이 관계를 거쳐 간다고 표시된 관계(via_party_id)는 연결만 끊는다
create function public.remove_deal_party(p_party_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.deal_parties where id = p_party_id) then
    raise exception '관계사를 찾을 수 없습니다.' using errcode = '42501';
  end if;
  update public.deal_parties set via_party_id = null where via_party_id = p_party_id;
  delete from public.deal_parties where id = p_party_id;
end;
$$;

revoke execute on function public.set_deal_customer(uuid, text, timestamptz) from public, anon;
revoke execute on function public.add_deal_party(uuid, text, text) from public, anon;
revoke execute on function public.remove_deal_party(uuid) from public, anon;
grant execute on function public.set_deal_customer(uuid, text, timestamptz) to authenticated;
grant execute on function public.add_deal_party(uuid, text, text) to authenticated;
grant execute on function public.remove_deal_party(uuid) to authenticated;
