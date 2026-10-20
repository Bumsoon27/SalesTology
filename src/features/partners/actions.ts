"use server";

import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";

export type RegisterPartnerState = { ok: boolean; error?: string; savedName?: string };

export async function registerPartner(_prev: RegisterPartnerState, formData: FormData): Promise<RegisterPartnerState> {
  const name = String(formData.get("name") ?? "").trim();
  const roles = formData.getAll("roles").map(String).filter((r) => r === "customer" || r === "si" || r === "supplier");
  if (!name) return { ok: false, error: "파트너 이름을 입력하세요." };
  if (roles.length === 0) return { ok: false, error: "고객사·매출처(SI)·매입처 중 하나 이상을 고르세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_partner", {
    p_name: name,
    p_roles: roles,
    p_contact_name: String(formData.get("contactName") ?? ""),
    p_contact_info: String(formData.get("contactInfo") ?? ""),
    p_memo: String(formData.get("memo") ?? ""),
  });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true, savedName: name };
}
