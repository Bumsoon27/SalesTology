// A·B 공용 알림 공급자 (설계서 §11.2). A의 티커·종이 여기 등록된 공급자의 알림을 함께 보여준다.
//
// B(SOS)에서 쓰는 법:
//   1) src/features/sos/notification-provider.ts 에서 NotificationProvider 를 구현해 export
//   2) 아래처럼 load 안에서 동적 import 로 불러오는 래퍼 공급자를 만들어 notificationProviders 배열에 추가
//      (공급자가 "server-only" 라 정적 import 하면 이 파일을 쓰는 테스트·클라이언트가 깨진다. 공용 파일이라 작은 PR 로, A 리뷰)
//
// 규칙
// - key 는 전역에서 겹치지 않게 "{공급자 id}:{종류}:{대상 id}:{기준일}" 형태로 만든다 (날짜가 바뀌면 새 알림)
// - urgency 는 A 기준과 같은 척도: 이슈 100, 기한 경과 85~90, 일정 미등록 60, 임박 56~70, 갱신 40~55, 참고 20
// - href 는 클릭 시 이동할 앱 내부 주소 (예: "/sos/signals/123"). 외부 사이트 주소는 쓰지 않는다
// - load 는 빠르게(1초 안) 끝나야 한다. 실패하면 A가 무시하고 나머지 알림만 보여준다

export type ExternalNotification = {
  key: string;
  text: string;
  urgency: number;
  href: string;
  /** 티커에 보일 출처 표시 (예: "SOS") */
  source: string;
};

export type NotificationContext = {
  userId: string;
  teamId: string | null;
  /** 오늘 (Asia/Seoul, YYYY-MM-DD) */
  today: string;
  /** 보는 범위: 내 알림(헤더 티커) | 부문 전체(팀 보기, 관리자). 공급자는 범위에 맞게 걸러 돌려준다 */
  view: "mine" | "team";
};

export type NotificationProvider = {
  id: string;
  load: (ctx: NotificationContext) => Promise<ExternalNotification[]>;
};

// SOS 공급자는 "server-only" 라 정적 import 하면 이 모듈을 가져오는 테스트·클라이언트 쪽에서 바로 실패한다.
// 실제로 load 가 호출될 때만 불러온다.
const sosProvider: NotificationProvider = {
  id: "sos",
  load: async (ctx) => (await import("@/features/sos/notification-provider")).sosNotificationProvider.load(ctx),
};

export const notificationProviders: NotificationProvider[] = [sosProvider];

/** 공급자 알림을 모은다. 한 공급자가 실패하거나 느려도 나머지는 보여준다 */
export async function loadExternalNotifications(ctx: NotificationContext, providers = notificationProviders, timeoutMs = 1500) {
  const results = await Promise.allSettled(
    providers.map((p) =>
      Promise.race([
        p.load(ctx),
        new Promise<ExternalNotification[]>((_, reject) => setTimeout(() => reject(new Error(`${p.id} timeout`)), timeoutMs)),
      ]),
    ),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value.filter(isValid) : []));
}

function isValid(n: ExternalNotification) {
  return !!n.key && !!n.text && Number.isFinite(n.urgency) && typeof n.href === "string" && n.href.startsWith("/") && !n.href.startsWith("//");
}
