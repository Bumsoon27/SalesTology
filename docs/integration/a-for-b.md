# A → B 연동 가이드 (SOS 가 SalesTology 코어를 쓰는 법)

B(SOS)는 A 테이블(`deals`, `companies` 등)에 직접 INSERT 하지 않고 아래 함수만 쓴다. 모두 **서버에서만** 호출한다
(서버 컴포넌트·서버 액션·라우트 핸들러). 로그인한 사용자의 권한(RLS)으로 동작하므로 다른 부문 데이터는 건드릴 수 없다.

## 1. 리드 → 사업(영업기회) 전환

```ts
import { createDealFromLead } from "@/features/deals/api";

const r = await createDealFromLead({
  name: "차세대 서버 구축",        // 사업명
  customer: "한빛은행",            // 고객사(기관)명 — 없으면 자동 생성
  budget: 150_000_000,             // 규모 = 예산 (원, 부가세 별도). 숫자 또는 "150,000,000"
  orderMonth: "2026-12",           // 발주 시기 → 예상 계약월 (YYYY-MM 또는 YYYY-MM-DD)
  procurement: "bid",              // 입찰 → 경쟁입찰, "negotiated" → 수의계약
  items: "x86 서버 20식",          // 선택
  // stage: "discovery",           // 선택 (기본 발굴)
  // si: ["가람정보"], suppliers: ["누리텍"],   // 선택
  sourceRef: `sos_lead:${lead.id}`,  // 권장 — 멱등 키. 같은 값으로 다시 불러도 사업은 하나 (기존 id 반환)
  // customerId: companyId,        // 선택 — findOrCreateCompany 로 받은 id. 주면 customer 이름 대신 이 회사
  // ownerId: assigneeUserId,      // 선택 — 담당 영업대표 (같은 부문 활성 사용자). 없으면 호출한 사용자
});

if (r.ok) {
  r.data.dealId; // sos_ 테이블에 저장해 시그널 ↔ 사업 연결
  r.data.href;   // "/dashboard?focus=d:<id>" — 이 주소로 보내면 대시보드에서 해당 사업이 열린다
} else {
  r.error;       // 사용자에게 보여줄 한국어 메시지
}
```

- 담당자(영업대표)는 `ownerId` 를 주면 그 사용자, 없으면 **호출한 로그인 사용자**. 다른 부문·비활성 사용자는 거부된다.
- `sourceRef` 는 꼭 넘겨 달라: 더블클릭·재시도·동시 전환에도 사업이 하나만 생긴다 (DB 고유 인덱스 `(team_id, source_ref)`).
  `deals.source_ref` 로 저장되므로 sos 쪽에 dealId 를 저장하기 전에 실패해도 다시 부르면 같은 id 를 받는다.
- `customerId` 를 주면 `customer` 는 비워도 된다. 다른 부문·삭제된 회사 id 는 거부된다.
- "1.5억" 같은 한글 단위 문자열은 받지 않는다(오류 반환). 숫자로 바꿔서 넘긴다.

## 2. 회사(기관) 찾기 / 만들기

```ts
import { findOrCreateCompany } from "@/features/deals/api";

const r = await findOrCreateCompany("새봄대학교", ["customer"]); // 역할: "customer" | "si" | "supplier"
if (r.ok) r.data.companyId; // sos_ 테이블에서 companies.id 로 FK 참조
```

- 같은 부문에 **이름이 정확히 같은** 회사가 있으면 그 id 를 돌려주고 역할만 더한다.
- 사업 전환 때는 `createDealFromLead` 가 고객사를 알아서 만들므로, 리드 단계에서 기관을 미리 등록할 때만 쓴다.
- 주의: 이름 비교는 정확히 일치만 본다. `(주)한빛`과 `한빛`은 다른 회사가 된다 — 시그널에서 기관명을 정리해서 넘겨 달라.

## 3. 티커·종 알림에 시그널 띄우기 (NotificationProvider)

```ts
// src/features/sos/notification-provider.ts  (B 영역)
import type { NotificationProvider } from "@/shared/notifications/providers";

export const sosNotificationProvider: NotificationProvider = {
  id: "sos",
  async load({ userId, teamId, today, view }) {
    // view: "mine" = 헤더 티커(이 사용자 담당분), "team" = 부문 전체 보기
    // sos_ 테이블에서 범위에 맞는 시그널을 조회
    return [
      {
        key: `sos:signal:${signalId}:${today}`, // 전역 고유, 날짜가 바뀌면 새 알림
        text: "한빛은행 — 차세대 서버 입찰 공고 게시",
        urgency: 70,                             // A 척도: 이슈 100, 기한 경과 85~90, 임박 56~70, 참고 20
        href: `/sos/signals/${signalId}`,        // 클릭 시 이동할 앱 내부 주소 ("/"로 시작, 외부 주소 불가)
        source: "SOS",                           // 티커에 출처 표시
      },
    ];
  },
};
```

그다음 `src/shared/notifications/providers.ts` 의 `notificationProviders` 배열에 추가한다 (공용 파일 → 작은 PR, A 리뷰).

```ts
import { sosNotificationProvider } from "@/features/sos/notification-provider";
export const notificationProviders: NotificationProvider[] = [sosNotificationProvider];
```

- `load` 는 **1.5초 안에** 끝나야 한다. 넘기거나 오류가 나면 SOS 알림만 빠지고 나머지는 정상 표시된다.
- 외부 주소(`https://…`, `//…`)나 빈 값은 자동으로 걸러진다.
