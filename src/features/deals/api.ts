import "server-only";

// B(SOS) 등 다른 영역이 A 데이터를 만들 때 쓰는 공개 서버 함수 (설계서 §11.2).
// deals·companies 에 직접 INSERT 하지 말고 이 함수들을 쓴다. 로그인 사용자 권한(RLS)으로 동작한다.
//
//   import { createDealFromLead, findOrCreateCompany } from "@/features/deals/api";
//
// 서버 컴포넌트·서버 액션·라우트 핸들러에서만 호출할 수 있다.
import { createClient } from "@/shared/supabase/server";
import { toCreateDealArgs, type LeadToDealInput } from "./lead";

export type { LeadToDealInput } from "./lead";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * 리드를 A 사업(영업기회)으로 전환한다.
 * 고객사·SI·매입처는 이름으로 찾고 없으면 만든다. 반환값의 dealId 를 sos_ 테이블에 저장해 연결하면 된다.
 * 대시보드는 Realtime 으로 바로 갱신된다.
 */
export async function createDealFromLead(input: LeadToDealInput): Promise<ApiResult<{ dealId: string; href: string }>> {
  const mapped = toCreateDealArgs(input);
  if (!mapped.ok) return mapped;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_deal", mapped.args);
  if (error || !data) return { ok: false, error: error?.message ?? "사업을 만들지 못했습니다." };
  const dealId = data as string;
  return { ok: true, data: { dealId, href: `/dashboard?focus=d:${dealId}` } };
}

/**
 * 회사를 이름으로 찾고, 없으면 만든다 (내 부문 안에서). 역할은 기존 역할에 더해진다.
 * 리드 단계에서 기관을 먼저 등록해 둘 때 쓴다. (사업 전환 시에는 createDealFromLead 가 알아서 만든다)
 */
export async function findOrCreateCompany(
  name: string,
  roles: ("customer" | "si" | "supplier")[] = ["customer"],
): Promise<ApiResult<{ companyId: string }>> {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: "회사명이 비어 있습니다." };
  if (roles.length === 0) return { ok: false, error: "역할을 하나 이상 지정하세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_partner", { p_name: trimmed, p_roles: roles });
  if (error || !data) return { ok: false, error: error?.message ?? "회사를 만들지 못했습니다." };
  return { ok: true, data: { companyId: data as string } };
}
