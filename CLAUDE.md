@AGENTS.md

# SalesTology — Claude 작업 규칙 (A·B 공통)

두 사람이 각자 PC의 Claude로 **같은 저장소**를 동시에 개발한다.
- **A = SB** (SalesTology 코어: 로그인·대시보드·토폴로지·알림) — 설계서 `docs/superpowers/specs/2026-10-20-salestology-a-design.md`
- **B = DJ** (SOS: 시그널 기반 아웃바운드 세일즈) — 설계서 `docs/superpowers/specs/*-sos-design.md`

내가 A인지 B인지는 **`CLAUDE.local.md`** (각자 PC에만 있음, 커밋 안 함)에 적혀 있다. 없으면 사용자에게 먼저 묻고 만들어 둔다:
```
# 내 역할
나는 A(SB)다. 브랜치 접두사 a/, 마이그레이션 접두사 _a_
```

## 세션 시작 시 매번
1. `git fetch origin` → 현재 브랜치가 `origin/main` 보다 뒤처졌으면 `git rebase origin/main`
2. `gh pr list --state open` 으로 상대방 PR 확인. 내게 리뷰 요청이 온 PR, 내 PR의 새 댓글(`gh pr view <번호> --comments`)을 사용자에게 먼저 요약한다.
3. main 이 깨져 있으면(CI 빨간불) 새 작업보다 그것을 먼저 알린다.

## 영역 경계 (CI가 검사하며 위반 시 PR이 막힌다)
| 경로 | 소유 |
|---|---|
| `src/app/(auth)/`, `src/app/(core)/`, `src/features/{topology,notifications,deals}/` | A |
| `src/app/sos/`, `src/features/sos/` | B |
| `src/shared/`, `src/proxy.ts`, `supabase/`, `.github/`, `package.json`, 이 파일 | 공용 (상대방 리뷰) |

- 상대 영역 파일은 **수정하지 않는다.** 필요하면 상대방 PR에 댓글이나 GitHub 이슈로 요청한다.
- 공용 영역 변경은 **기능 PR과 섞지 말고 작은 PR로 따로** 올린다.
- B가 A 데이터를 쓸 때: 공용 테이블(`teams`, `profiles`, `companies`)은 읽기·FK 참조만. 사업 생성은 A의 deals API를 호출한다(직접 INSERT 금지).
- 의존성 추가(`npm i`)는 공용 변경이다. 꼭 필요한 것만, PR 설명에 이유를 적는다.

## 브랜치·커밋·PR
- 브랜치: `a/기능명`, `b/기능명`. `main` 직접 push 금지.
- **작업 시작하자마자 Draft PR을 연다** → Vercel 미리보기 주소가 생겨 상대방이 화면을 계속 볼 수 있다.
- push 전에 `npm run check` (린트·타입·테스트) 통과 확인.
- PR은 작게, 하루 1회 이상 main 에 합치는 것을 목표로 한다. 오래 사는 브랜치 = 충돌.

## DB 마이그레이션 (가장 사고 나기 쉬운 곳)
- 새 파일: `npx supabase migration new a_설명` (B는 `b_설명`) → `supabase/migrations/YYYYMMDDHHMMSS_a_설명.sql`
- **이미 main에 합쳐진 마이그레이션 파일은 절대 수정하지 않는다.** 고칠 땐 새 마이그레이션.
- 마이그레이션은 **코드보다 먼저, 별도 작은 PR로** 합친다 (main 머지 → dev DB → prod DB 자동 적용, 그 뒤 코드 PR).
- 컬럼 삭제·이름 변경은 2단계: ① 새 컬럼 추가 + 코드 전환 ② 다음 PR에서 옛 컬럼 삭제.
- 모든 새 테이블에 RLS를 켠다. B 테이블은 `sos_` 접두사.
- prod DB에 직접 SQL을 실행하지 않는다. 대시보드에서 손으로 바꾼 스키마는 마이그레이션과 어긋난다.

## 비밀값
- `.env.local` 은 커밋하지 않는다. 로컬은 **dev** Supabase 값만 쓴다.
- `SUPABASE_SECRET_KEY` 는 `src/shared/supabase/admin.ts`(server-only)에서만 읽는다. `NEXT_PUBLIC_` 접두사 금지.

## 상대방 PR 리뷰할 때
- `gh pr diff <번호>`, `gh pr checks <번호>` 로 보고, 미리보기 URL에서 화면 확인.
- 의견은 `gh pr review <번호> --comment -b "..."` (승인은 사용자가 직접 결정).
- 리뷰 댓글 첫머리에 `[A-Claude]` / `[B-Claude]` 를 붙여 사람 댓글과 구분한다.

## 명령어
- 개발 서버 `npm run dev` · 검사 `npm run check` · 빌드 `npm run build`
- 관리자 시드 `npm run seed:admin` · 타입 생성 `npx supabase gen types typescript --project-id <dev-id> > src/shared/types/database.ts`
- 로컬에 Docker가 없으므로 마이그레이션 SQL 검증은 PR의 CI `db` 잡이 한다.
