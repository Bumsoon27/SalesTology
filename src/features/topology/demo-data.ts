// 장식·미리보기용 데모 우주 (로그인 배경 등). 실제 데이터와 섞지 않는다.
import type { NodeStatus, UniverseData, UniverseNode } from "./types";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = ["한빛은행", "누리공사", "온새카드", "다온시스템", "가온공사", "세움카드", "미르증권", "하람병원", "도담전자", "로아물산", "이음통신", "바름보험", "새봄대학교", "태솔제약"];
const DEALS = ["서버 구축", "망분리", "스토리지 증설", "유지보수", "보안 솔루션", "클라우드 전환", "백업 시스템", "DR 구축", "네트워크 고도화"];
const PARTIES = ["가람정보", "누리텍", "한결SI", "다올네트웍스", "새빛솔루션", "온결테크"];

function pickStatus(r: number): NodeStatus {
  if (r < 0.1) return "red";
  if (r < 0.32) return "yellow";
  if (r < 0.37) return "hold";
  return "green";
}

export function buildDemoUniverse(centerLabel = "나", seed = 7): UniverseData {
  const rand = mulberry32(seed);
  const nodes: UniverseNode[] = [{ id: "me", kind: "me", label: centerLabel, status: "green", weight: 1, parentId: null }];

  CUSTOMERS.forEach((name, ci) => {
    const cid = `c${ci}`;
    const dealCount = 1 + Math.floor(rand() * 5);
    const dealNodes: UniverseNode[] = [];
    for (let d = 0; d < dealCount; d++) {
      const did = `${cid}-d${d}`;
      const status = pickStatus(rand());
      dealNodes.push({
        id: did,
        kind: "deal",
        label: DEALS[Math.floor(rand() * DEALS.length)],
        status,
        weight: rand(),
        parentId: cid,
        reason: status === "red" ? "이슈 1" : status === "yellow" ? `배송 D-${1 + Math.floor(rand() * 13)}` : undefined,
      });
      const partyCount = Math.floor(rand() * 4);
      for (let p = 0; p < partyCount; p++) {
        nodes.push({
          id: `${did}-p${p}`,
          kind: "party",
          label: `${PARTIES[Math.floor(rand() * PARTIES.length)]}${p === 0 ? " · SI" : " · 매입"}`,
          status: rand() < 0.15 ? "yellow" : "green",
          weight: 0.2,
          parentId: did,
        });
      }
    }
    const grey = ci === 12 || ci === 13;
    const worst = dealNodes.some((n) => n.status === "red") ? "red" : dealNodes.some((n) => n.status === "yellow") ? "yellow" : "green";
    nodes.push({
      id: cid,
      kind: "customer",
      label: name,
      status: grey ? "grey" : worst,
      weight: Math.min(1, dealNodes.reduce((s, n) => s + n.weight, 0) / 3),
      parentId: "me",
    });
    nodes.push(...dealNodes);
  });

  return { nodes };
}
