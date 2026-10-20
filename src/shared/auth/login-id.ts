// 설계서 §5: ID/비밀번호 로그인을 Supabase 이메일 로그인 위에 얹는다.
// 나중에 M365 SSO를 추가 공급자로 붙일 때도 이 모듈만 바뀌게 한다.
export const AUTH_EMAIL_DOMAIN = "salestology.local";

const LOGIN_ID_PATTERN = /^[a-z0-9]{4,20}$/;

export function isValidLoginId(loginId: string): boolean {
  return LOGIN_ID_PATTERN.test(loginId);
}

export function toAuthEmail(loginId: string): string {
  const normalized = loginId.trim().toLowerCase();
  if (!isValidLoginId(normalized)) {
    throw new Error("ID는 영문 소문자·숫자 4~20자여야 합니다.");
  }
  return `${normalized}@${AUTH_EMAIL_DOMAIN}`;
}

// 8자 이상, 영문·숫자·특수문자 각각 1개 이상
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
