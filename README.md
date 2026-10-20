# SalesTology

영업 사업·고객사·관계사를 '나' 중심 방사형 토폴로지로 보는 대시보드(A) + 시그널 기반 아웃바운드 세일즈 SOS(B).

- 스택: Next.js 16 (App Router, TS) · Tailwind · Supabase · Vercel · Vitest
- 설계서: `docs/superpowers/specs/`
- 협업 규칙: [`CLAUDE.md`](CLAUDE.md) (사람도 읽으세요)

## 처음 받는 사람 (B 포함)

```bash
git clone https://github.com/Bumsoon27/SalesTology.git C:/dev/SalesTology
```
> OneDrive·Dropbox 같은 동기화 폴더 안에 두지 마세요.

```bash
cd C:/dev/SalesTology && npm ci
```
1. `.env.example` 을 `.env.local` 로 복사하고 **dev** Supabase 값을 넣는다.
2. `CLAUDE.local.md` 를 만들고 `나는 B(DJ)다. 브랜치 접두사 b/, 마이그레이션 접두사 _b_` 라고 적는다.
3. `npm run dev` → http://localhost:3000

## 배포 흐름

```
a/기능 or b/기능 브랜치 ─push─▶ PR ─▶ CI(린트·타입·테스트·빌드·경계검사·마이그레이션 검증)
                                  └▶ Vercel 미리보기 (dev DB)  ← 상대방이 화면 확인·댓글
PR 머지 ─▶ main ─▶ Vercel 운영 배포 (prod DB)
                └▶ 마이그레이션 변경 시 GitHub Actions: dev DB → prod DB 적용
```

상태 확인: `/api/health` (DB 연결·환경·커밋 표시)
