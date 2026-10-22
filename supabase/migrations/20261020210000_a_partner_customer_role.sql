-- A 영역: 파트너 역할에 '고객사' 추가 → 고객사 / 매출처(SI) / 매입처
alter table public.companies drop constraint companies_partner_roles_check;
alter table public.companies
  add constraint companies_partner_roles_check
  check (partner_roles <@ array['customer', 'si', 'supplier']::text[]);

-- 영업기회의 고객사도 '고객사' 역할로 표시한다 (기존 데이터 포함)
update public.companies c
   set partner_roles = array(select distinct unnest(c.partner_roles || array['customer']) order by 1)
 where exists (select 1 from public.deals d where d.customer_id = c.id)
   and not ('customer' = any (c.partner_roles));

create or replace function public.mark_customer_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.companies
     set partner_roles = array(select distinct unnest(partner_roles || array['customer']) order by 1)
   where id = new.customer_id and not ('customer' = any (partner_roles));
  return new;
end;
$$;

create trigger deals_mark_customer after insert or update of customer_id on public.deals
  for each row execute function public.mark_customer_role();
