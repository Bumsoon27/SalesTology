// 토폴로지 화면용 노드·링크 (설계서 §6.2). DB 행은 build-graph 에서 이 형태로 바뀐다.
export type NodeKind = "me" | "member" | "customer" | "deal" | "party";

// 설계서 §4 상태. hold = 보류(on_hold)
export type NodeStatus = "red" | "yellow" | "green" | "grey" | "hold";

export type UniverseNode = {
  id: string;
  kind: NodeKind;
  label: string;
  status: NodeStatus;
  /** 0~1. 크기·밝기에 쓰는 연관도 (고객사: 진행 중 사업 금액 합, 사업: 금액) */
  weight: number;
  parentId: string | null;
  /** 상태 사유 요약 (예: "이슈 2", "배송 D-5") */
  reason?: string;
  /** 실제 회사 id. 같은 회사가 여러 자리에 나타나면 호버 시 함께 빛난다 (설계서 §6.2) */
  refId?: string;
};

export type UniverseData = {
  nodes: UniverseNode[];
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  red: "이슈",
  yellow: "확인 필요",
  green: "정상",
  grey: "소원",
  hold: "보류",
};
