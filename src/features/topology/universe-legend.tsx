import { STATUS_LABEL, type NodeStatus, type UniverseData } from "./types";

const DOT: Record<NodeStatus, string> = {
  red: "bg-st-red shadow-[0_0_8px_var(--st-red)]",
  yellow: "bg-st-yellow shadow-[0_0_8px_var(--st-yellow)]",
  green: "bg-accent shadow-[0_0_8px_var(--accent)]",
  grey: "bg-st-grey",
  hold: "border border-dashed border-st-grey",
};

// 범례: 색을 못 구분해도 상태명·건수로 알 수 있게 (설계서 §1.2-6)
export function UniverseLegend({ data }: { data: UniverseData }) {
  const deals = data.nodes.filter((n) => n.kind === "deal");
  const customers = data.nodes.filter((n) => n.kind === "customer");
  const count = (s: NodeStatus) => deals.filter((n) => n.status === s).length;
  const items: [NodeStatus, number][] = [
    ["red", count("red")],
    ["yellow", count("yellow")],
    ["green", count("green")],
    ["grey", customers.filter((n) => n.status === "grey").length],
  ];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface/70 px-4 py-2 text-xs backdrop-blur">
      {items.map(([s, c]) => (
        <span key={s} className="flex items-center gap-1.5 text-muted">
          <span className={`h-2 w-2 rounded-full ${DOT[s]}`} />
          {STATUS_LABEL[s]} <span className="font-medium text-fg">{c}</span>
        </span>
      ))}
    </div>
  );
}
