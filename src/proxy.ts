import type { NextRequest } from "next/server";
import { updateSession } from "@/shared/supabase/proxy-session";

// Next.js 16: middleware.ts 가 proxy.ts 로 이름이 바뀌었다. 프로젝트에 하나만 둘 수 있다.
// A·B 모두 이 파일을 공유하므로 영역별 로직은 각 feature 모듈에 두고 여기서 import 한다.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
