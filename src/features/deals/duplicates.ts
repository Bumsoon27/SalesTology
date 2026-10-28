// 새 영업기회 중복 경고 — 같은 고객사에 이름이 비슷한 사업이 이미 있는지. 순수 함수 (테스트: duplicates.test.ts)
// 참고: Salesforce Duplicate Rules (막지 않고 알려준다). 이름은 글자 2개 묶음(bigram) 유사도로 비교한다 — 한글은 띄어쓰기가 제각각이라

export type ExistingDeal = { id: string; name: string; customer: string; owner: string; status: string };

export const normCompany = (s: string) => s.replace(/\s|\(주\)|주식회사|㈜/g, "").toLowerCase();
const normName = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice 계수 0~1 (bigram 기준). 한쪽이 다른 쪽을 통째로 포함하면 1 */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)))) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let both = 0;
  for (const [g, n] of A) both += Math.min(n, B.get(g) ?? 0);
  const total = Math.max(0, x.length - 1) + Math.max(0, y.length - 1);
  return total ? (2 * both) / total : 0;
}

export const DUP_THRESHOLD = 0.6;

export function findDuplicates(name: string, customer: string, existing: ExistingDeal[], limit = 3): (ExistingDeal & { score: number })[] {
  const c = normCompany(customer);
  if (normName(name).length < 2 || c.length < 2) return [];
  return existing
    .filter((d) => normCompany(d.customer) === c)
    .map((d) => ({ ...d, score: nameSimilarity(name, d.name) }))
    .filter((d) => d.score >= DUP_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
