-- B 영역: SOS S1 테이블·RLS·초기 키워드 (SOS 설계서 §4, §2.3)
-- A 공용 테이블(teams, profiles, companies, deals)은 읽기·FK 참조만 한다.
-- 규칙: 한 번 main 에 합쳐진 마이그레이션 파일은 수정하지 않는다. 고칠 땐 새 파일을 만든다.
-- 권한 원칙: 테이블마다 anon·authenticated 권한을 모두 회수한 뒤 필요한 것만 다시 준다.
--           서버(secret key)는 service_role 로 RLS 를 우회하므로 service_role 에는 전부 준다.

-- ═══ 공용 (부문 무관, 서버만 쓴다) ═══════════════════════════════

-- ─── sos_orgs (기관: 조달 수요기관·채용 회사·뉴스 기관) ─────────
create table public.sos_orgs (
  id               uuid primary key default gen_random_uuid(),
  org_code         text unique,
  name             text not null,
  normalized_name  text not null,
  aliases          text[] not null default '{}',
  created_at       timestamptz not null default now()
);
create index sos_orgs_normalized_name_idx on public.sos_orgs (normalized_name);

-- ─── sos_raw_items (수집 원본, 출처별 고유 번호로 중복 방지) ──────
create table public.sos_raw_items (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('g2b_plan', 'g2b_prespec', 'g2b_bid', 'g2b_award', 'g2b_contract', 'saramin', 'work24', 'naver_news')),
  external_id       text not null,
  version           int not null default 0,          -- 정정공고 차수 등. 더 큰 값이 오면 갱신
  title             text not null,
  org_name          text,
  org_code          text,
  org_id            uuid references public.sos_orgs (id) on delete set null,
  chain_plan_no     text,                            -- 발주계획 번호
  chain_prespec_no  text,                            -- 사전규격 번호
  chain_bid_no      text,                            -- 입찰공고 번호
  budget            numeric(15, 0) check (budget is null or budget >= 0),
  published_at      timestamptz,
  deadline_at       timestamptz,
  deadline_type     text,
  url               text,
  match_text        text,                            -- 키워드 일치용 (제목·품명 등 합친 문장)
  payload           jsonb,                           -- 어느 부문 키워드에든 맞은 건만 채운다 (설계서 §3.2)
  fetched_at        timestamptz not null default now(),
  unique (source, external_id)
);
create index sos_raw_items_fetched_at_idx on public.sos_raw_items (fetched_at);
create index sos_raw_items_chain_plan_no_idx on public.sos_raw_items (chain_plan_no);
create index sos_raw_items_chain_prespec_no_idx on public.sos_raw_items (chain_prespec_no);
create index sos_raw_items_chain_bid_no_idx on public.sos_raw_items (chain_bid_no);

-- ─── sos_fetch_log (출처·기간별 수집 기록, 원본 재사용 판단용) ────
create table public.sos_fetch_log (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  range_from  date not null,
  range_to    date not null,
  item_count  int not null default 0,
  fetched_at  timestamptz not null default now(),
  check (range_to >= range_from)
);
create index sos_fetch_log_source_range_idx on public.sos_fetch_log (source, range_from, range_to);

-- ═══ 부문별 ═════════════════════════════════════════════════════

-- ─── sos_team_settings ───────────────────────────────────────────
create table public.sos_team_settings (
  team_id             uuid primary key references public.teams (id),
  prespec_alert_days  int not null default 3 check (prespec_alert_days between 0 and 30),
  ai_summary_top_n    int not null default 5 check (ai_summary_top_n between 0 and 20),
  first_run_days      int not null default 30 check (first_run_days between 1 and 90)
);

-- ─── sos_keywords (관심 키워드, 소프트 삭제) ─────────────────────
create table public.sos_keywords (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id),
  term        text not null check (length(trim(term)) > 0),
  tier        text not null check (tier in ('core', 'extended', 'exclude')),
  weight      int,                                   -- null 이면 칸 기본 가중치
  sources     text[] not null default '{g2b}',
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index sos_keywords_team_term_uq
  on public.sos_keywords (team_id, lower(term))
  where deleted_at is null;

create trigger sos_keywords_set_updated_at before update on public.sos_keywords
  for each row execute function public.set_updated_at();

-- ─── sos_products · sos_keyword_products (키워드 ↔ 제안할 제품) ──
create table public.sos_products (
  id       uuid primary key default gen_random_uuid(),
  team_id  uuid not null references public.teams (id),
  name     text not null check (length(trim(name)) > 0),
  vendor   text,
  unique (team_id, name)
);

create table public.sos_keyword_products (
  keyword_id  uuid not null references public.sos_keywords (id) on delete cascade,
  product_id  uuid not null references public.sos_products (id) on delete cascade,
  primary key (keyword_id, product_id)
);
create index sos_keyword_products_product_idx on public.sos_keyword_products (product_id);

-- ─── sos_keyword_changes (키워드 변경 이력·되돌리기) ─────────────
create table public.sos_keyword_changes (
  id          bigint generated always as identity primary key,
  team_id     uuid not null references public.teams (id),
  actor_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  keyword_id  uuid references public.sos_keywords (id) on delete set null,
  action      text not null check (action in ('create', 'update', 'delete', 'restore')),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index sos_keyword_changes_team_idx on public.sos_keyword_changes (team_id, created_at desc);

-- ─── sos_runs (실행) ────────────────────────────────────────────
create table public.sos_runs (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id),
  started_by    uuid references public.profiles (id) on delete set null,
  mode          text not null default 'collect' check (mode in ('collect', 'reanalyze')),
  status        text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  range_from    date not null,
  range_to      date not null,
  cursor        jsonb not null default '{}',         -- 다음 단계(출처 × 페이지) 위치
  stats         jsonb not null default '{}',         -- 출처별 {status, fetched, matched, error}, 새·갱신 리드 수
  started_at    timestamptz not null default now(),
  heartbeat_at  timestamptz not null default now(),  -- 15분 넘게 그대로면 실패 처리
  finished_at   timestamptz,
  check (range_to >= range_from)
);
-- 부문당 실행 중 1개 (동시에 눌러도 하나만 생긴다)
create unique index sos_runs_one_running on public.sos_runs (team_id) where status = 'running';
create index sos_runs_team_started_idx on public.sos_runs (team_id, started_at desc);

-- ─── sos_leads (사업 리드) ───────────────────────────────────────
create table public.sos_leads (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams (id),
  kind                 text not null default 'deal' check (kind in ('deal', 'org_only', 'predicted')),
  chain_key            text,
  org_id               uuid references public.sos_orgs (id) on delete set null,
  company_id           uuid references public.companies (id),
  title                text not null,
  stage                text not null check (stage in ('plan', 'prespec', 'bid', 'award', 'contract')),
  budget               numeric(15, 0) check (budget is null or budget >= 0),
  expected_order_month date check (expected_order_month is null or extract(day from expected_order_month) = 1),
  next_deadline_at     timestamptz,
  next_deadline_type   text check (next_deadline_type in ('prespec_opinion', 'bid_close')),
  matched_keyword_ids  uuid[] not null default '{}',
  score                int not null default 0 check (score between 0 and 100),
  summary              text,
  summary_source       text check (summary_source in ('ai', 'template')),
  status               text not null default 'new' check (status in ('new', 'reviewing', 'on_hold', 'dismissed', 'converted')),
  assignee_id          uuid references public.profiles (id) on delete set null,
  memo                 text,
  converted_deal_id    uuid references public.deals (id) on delete set null,
  touched_at           timestamptz,                  -- 사람이 처음 손댄 시각. 있으면 보관 정리에서 제외
  has_new_progress     boolean not null default false,
  keyword_mismatch     boolean not null default false,
  hidden               boolean not null default false,
  merged_into_id       uuid references public.sos_leads (id) on delete set null,
  first_run_id         uuid references public.sos_runs (id) on delete set null,
  last_run_id          uuid references public.sos_runs (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (team_id, chain_key)
);
create index sos_leads_list_idx on public.sos_leads (team_id, hidden, status, score desc);
create index sos_leads_deadline_idx on public.sos_leads (team_id, stage, next_deadline_at);

create trigger sos_leads_set_updated_at before update on public.sos_leads
  for each row execute function public.set_updated_at();

-- ─── sos_signals (리드·기관·이슈의 근거) ─────────────────────────
create table public.sos_signals (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams (id),
  run_id               uuid not null references public.sos_runs (id) on delete cascade,
  kind                 text not null check (kind in ('deal', 'org', 'issue_article')),
  raw_item_id          uuid not null references public.sos_raw_items (id),
  lead_id              uuid references public.sos_leads (id) on delete cascade,
  matched_keyword_ids  uuid[] not null default '{}',
  created_at           timestamptz not null default now()
);
create index sos_signals_lead_idx on public.sos_signals (lead_id);
create index sos_signals_run_idx on public.sos_signals (run_id);
create index sos_signals_raw_item_idx on public.sos_signals (raw_item_id);
create index sos_signals_team_created_idx on public.sos_signals (team_id, created_at desc);

-- ═══ RLS · 권한 ═════════════════════════════════════════════════
alter table public.sos_orgs             enable row level security;
alter table public.sos_raw_items        enable row level security;
alter table public.sos_fetch_log        enable row level security;
alter table public.sos_team_settings    enable row level security;
alter table public.sos_keywords         enable row level security;
alter table public.sos_products         enable row level security;
alter table public.sos_keyword_products enable row level security;
alter table public.sos_keyword_changes  enable row level security;
alter table public.sos_runs             enable row level security;
alter table public.sos_leads            enable row level security;
alter table public.sos_signals          enable row level security;

revoke all on public.sos_orgs, public.sos_raw_items, public.sos_fetch_log,
              public.sos_team_settings, public.sos_keywords, public.sos_products,
              public.sos_keyword_products, public.sos_keyword_changes,
              public.sos_runs, public.sos_leads, public.sos_signals
  from anon, authenticated;
grant all on public.sos_orgs, public.sos_raw_items, public.sos_fetch_log,
             public.sos_team_settings, public.sos_keywords, public.sos_products,
             public.sos_keyword_products, public.sos_keyword_changes,
             public.sos_runs, public.sos_leads, public.sos_signals
  to service_role;

-- 공용 3테이블: 로그인 사용자는 읽기만. 쓰기는 서버(secret key) 전용.
grant select on public.sos_orgs, public.sos_raw_items, public.sos_fetch_log to authenticated;

create policy sos_orgs_select on public.sos_orgs for select to authenticated using (true);
create policy sos_raw_items_select on public.sos_raw_items for select to authenticated using (true);
create policy sos_fetch_log_select on public.sos_fetch_log for select to authenticated using (true);

-- 부문 설정: 자기 부문 조회·생성·수정
grant select, insert, update on public.sos_team_settings to authenticated;

create policy sos_team_settings_select on public.sos_team_settings for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
create policy sos_team_settings_insert on public.sos_team_settings for insert to authenticated
  with check (public.is_admin() or team_id = public.current_team_id());
create policy sos_team_settings_update on public.sos_team_settings for update to authenticated
  using (public.is_admin() or team_id = public.current_team_id())
  with check (public.is_admin() or team_id = public.current_team_id());

-- 키워드: 자기 부문 조회·생성·수정. 물리 삭제 대신 deleted_at (소프트 삭제).
grant select, insert on public.sos_keywords to authenticated;
grant update (term, tier, weight, sources, active, deleted_at) on public.sos_keywords to authenticated;

create policy sos_keywords_select on public.sos_keywords for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
create policy sos_keywords_insert on public.sos_keywords for insert to authenticated
  with check (
    (public.is_admin() or team_id = public.current_team_id())
    and (created_by is null or created_by = (select auth.uid()))
  );
create policy sos_keywords_update on public.sos_keywords for update to authenticated
  using (public.is_admin() or team_id = public.current_team_id())
  with check (public.is_admin() or team_id = public.current_team_id());

-- 제품: 자기 부문 조회·생성·수정·삭제 (삭제 시 키워드 연결도 같이 지워진다)
grant select, insert, delete on public.sos_products to authenticated;
grant update (name, vendor) on public.sos_products to authenticated;

create policy sos_products_select on public.sos_products for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
create policy sos_products_insert on public.sos_products for insert to authenticated
  with check (public.is_admin() or team_id = public.current_team_id());
create policy sos_products_update on public.sos_products for update to authenticated
  using (public.is_admin() or team_id = public.current_team_id())
  with check (public.is_admin() or team_id = public.current_team_id());
create policy sos_products_delete on public.sos_products for delete to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- 키워드↔제품 연결: 연결 해제는 행 삭제이므로 delete 허용. 키워드와 제품은 같은 부문이어야 한다.
grant select, insert, delete on public.sos_keyword_products to authenticated;

create policy sos_keyword_products_select on public.sos_keyword_products for select to authenticated
  using (exists (
    select 1 from public.sos_keywords k
    where k.id = keyword_id and (public.is_admin() or k.team_id = public.current_team_id())
  ));
create policy sos_keyword_products_insert on public.sos_keyword_products for insert to authenticated
  with check (exists (
    select 1 from public.sos_keywords k
    join public.sos_products p on p.team_id = k.team_id
    where k.id = keyword_id and p.id = product_id
      and (public.is_admin() or k.team_id = public.current_team_id())
  ));
create policy sos_keyword_products_delete on public.sos_keyword_products for delete to authenticated
  using (exists (
    select 1 from public.sos_keywords k
    where k.id = keyword_id and (public.is_admin() or k.team_id = public.current_team_id())
  ));

-- 키워드 변경 이력: 조회·추가만 (이력은 고치지 않는다). 기록자는 본인.
grant select, insert on public.sos_keyword_changes to authenticated;

create policy sos_keyword_changes_select on public.sos_keyword_changes for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
create policy sos_keyword_changes_insert on public.sos_keyword_changes for insert to authenticated
  with check (
    (public.is_admin() or team_id = public.current_team_id())
    and actor_id = (select auth.uid())
  );

-- 실행·시그널: 조회만. 생성·갱신은 서버 전용.
grant select on public.sos_runs, public.sos_signals to authenticated;

create policy sos_runs_select on public.sos_runs for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
create policy sos_signals_select on public.sos_signals for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- 리드: 조회 + 사람이 바꾸는 칸(담당·메모·상태·전환)만 수정. 생성·분석 칸 갱신은 서버 전용.
grant select on public.sos_leads to authenticated;
grant update (status, assignee_id, memo, touched_at, has_new_progress, converted_deal_id)
  on public.sos_leads to authenticated;

create policy sos_leads_select on public.sos_leads for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
-- 담당자는 같은 부문의 활성 사용자만. 전환 사업은 내가 볼 수 있는 사업만 (서브쿼리에 deals RLS 적용)
create policy sos_leads_update on public.sos_leads for update to authenticated
  using (public.is_admin() or team_id = public.current_team_id())
  with check (
    (public.is_admin() or team_id = public.current_team_id())
    and (assignee_id is null or exists (
      select 1 from public.profiles p
      where p.id = assignee_id and p.team_id = sos_leads.team_id and p.is_active
    ))
    and (converted_deal_id is null or exists (
      select 1 from public.deals d where d.id = converted_deal_id
    ))
  );

-- ═══ 초기 데이터 (모든 부문에 똑같이, 설계서 §2.3) ═════════════
insert into public.sos_team_settings (team_id)
select t.id from public.teams t;

insert into public.sos_keywords (team_id, term, tier, created_by)
select t.id, k.term, k.tier, null
from public.teams t
cross join (values
  -- 핵심
  ('IBM', 'core'), ('Lenovo', 'core'), ('서버', 'core'), ('스토리지', 'core'),
  ('백업테이프', 'core'), ('LTO드라이브', 'core'), ('온튠', 'core'), ('onTune', 'core'),
  ('APM', 'core'), ('Jennifer', 'core'), ('RPA', 'core'),
  -- 확장
  ('IBM Power', 'extended'), ('Power11', 'extended'), ('AIX', 'extended'), ('유닉스', 'extended'),
  ('x86', 'extended'), ('Dell', 'extended'), ('FlashSystem', 'extended'), ('테이프 라이브러리', 'extended'),
  ('WebSphere', 'extended'), ('MQ', 'extended'), ('Instana', 'extended'), ('Turbonomic', 'extended'),
  ('SMS', 'extended'), ('Brity RPA', 'extended'), ('watsonx', 'extended'), ('FabriX', 'extended'),
  ('U2L', 'extended'), ('마이그레이션', 'extended'), ('안랩', 'extended'), ('Thales', 'extended'),
  ('HSM', 'extended'), ('Fortify', 'extended'), ('BigFix', 'extended'), ('Cisco', 'extended'),
  ('Arista', 'extended'), ('Vertiv', 'extended'), ('UPS', 'extended'), ('항온항습', 'extended'),
  ('보안', 'extended'),
  -- 제외
  ('서버실 공사', 'exclude'), ('청소', 'exclude'), ('경비', 'exclude')
) as k (term, tier);

insert into public.sos_products (team_id, name, vendor)
select t.id, p.name, p.vendor
from public.teams t
cross join (values
  ('IBM Power11', 'IBM'),
  ('IBM FlashSystem', 'IBM'),
  ('IBM TS4300 테이프 라이브러리', 'IBM'),
  ('LTO-9 드라이브', 'IBM'),
  ('IBM Storage Protect', 'IBM'),
  ('Lenovo ThinkSystem', 'Lenovo'),
  ('Jennifer APM', 'JenniferSoft'),
  ('onTune', 'TeemStone'),
  ('Brity RPA', 'Samsung SDS')
) as p (name, vendor);

insert into public.sos_keyword_products (keyword_id, product_id)
select k.id, p.id
from (values
  ('IBM Power11', 'IBM'), ('IBM Power11', '서버'), ('IBM Power11', 'IBM Power'),
  ('IBM Power11', 'Power11'), ('IBM Power11', 'AIX'), ('IBM Power11', '유닉스'),
  ('IBM FlashSystem', 'IBM'), ('IBM FlashSystem', '스토리지'), ('IBM FlashSystem', 'FlashSystem'),
  ('IBM TS4300 테이프 라이브러리', '백업테이프'), ('IBM TS4300 테이프 라이브러리', 'LTO드라이브'),
  ('IBM TS4300 테이프 라이브러리', '테이프 라이브러리'),
  ('LTO-9 드라이브', '백업테이프'), ('LTO-9 드라이브', 'LTO드라이브'),
  ('IBM Storage Protect', '백업테이프'),
  ('Lenovo ThinkSystem', 'Lenovo'), ('Lenovo ThinkSystem', '서버'), ('Lenovo ThinkSystem', 'x86'),
  ('Jennifer APM', 'APM'), ('Jennifer APM', 'Jennifer'),
  ('onTune', '온튠'), ('onTune', 'onTune'), ('onTune', 'SMS'),
  ('Brity RPA', 'RPA'), ('Brity RPA', 'Brity RPA')
) as m (product_name, term)
join public.sos_products p on p.name = m.product_name
join public.sos_keywords k on k.team_id = p.team_id and k.term = m.term and k.deleted_at is null;
