# 보안 정책

이 저장소는 SalesTology 사내 영업 도구의 소스입니다. 공개되어 있지만 외부 기여는 받지 않습니다.

- 취약점을 발견하면 공개 이슈 대신 GitHub의 **Security → Report a vulnerability**(비공개 보고)로 알려 주세요.
- 비밀값(API 키·토큰·DB 비밀번호)은 저장소에 두지 않습니다. 모두 Vercel 환경변수·GitHub Secrets에만 있습니다.
- 클라이언트에 보이는 Supabase URL·publishable key 는 공개값이며, 데이터 접근은 RLS 로 막습니다.
