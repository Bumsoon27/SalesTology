"use client";

// '나'를 중심으로 한 작은 우주 (설계서 §6.3~6.4).
// d3-force 로 궤도·부채꼴·충돌을 계산하고, SVG 속성은 d3-selection 으로 직접 갱신한다(React 재렌더 없음).
import { useEffect, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomTransform } from "d3-zoom";
import { computeTargets, nodeRadius, orbitRadius } from "./layout";
import type { NodeStatus, UniverseData, UniverseNode } from "./types";

type SimNode = UniverseNode & SimulationNodeDatum & { r: number; phase: number; tx: number; ty: number };
type SimLink = SimulationLinkDatum<SimNode> & { id: string };

const CORE: Record<UniverseNode["kind"], string> = {
  me: "#ffffff",
  member: "#e6e9ff",
  customer: "#d9deff",
  deal: "#aab4e6",
  party: "#7c84a8",
};
const GLOW: Record<NodeStatus, string> = {
  red: "var(--st-red)",
  yellow: "var(--st-yellow)",
  green: "var(--accent)",
  grey: "transparent",
  hold: "transparent",
};

type Props = {
  data: UniverseData;
  /** false 면 장식용(로그인 배경): 줌·클릭·호버 없음 */
  interactive?: boolean;
  /** 처음에 관계사(party)까지 펼칠지 */
  expandAll?: boolean;
  onSelect?: (node: UniverseNode) => void;
  /** 이 노드로 화면을 옮기고 확대한다 (검색·티커) */
  focusId?: string | null;
  className?: string;
};

export function Universe({ data, interactive = true, expandAll = false, onSelect, focusId, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const flyToRef = useRef<((id: string) => void) | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // 화면 크기를 감지해 중심과 궤도 크기를 다시 계산한다
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize((prev) => (prev && Math.abs(prev.width - width) < 40 && Math.abs(prev.height - height) < 40 ? prev : { width, height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !size) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const svg = select(svgEl);
    svg.selectAll("*").remove();
    const { width, height } = size;
    const scale = Math.max(0.6, Math.min(width, height) / 760);

    // ── 배경 별 ─────────────────────────────────────
    const stars = svg.append("g").attr("class", "stars");
    const starRand = (i: number) => {
      const x = Math.sin(i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 220; i++) {
      stars
        .append("circle")
        .attr("cx", starRand(i) * width)
        .attr("cy", starRand(i + 999) * height)
        .attr("r", starRand(i + 77) < 0.92 ? 0.6 : 1.1)
        .attr("fill", "#fff")
        .attr("opacity", 0.08 + starRand(i + 5) * 0.35)
        .attr("class", i % 7 === 0 ? "twinkle" : null)
        .style("animation-delay", `${(starRand(i + 3) * 4).toFixed(2)}s`);
    }

    // ── 필터(발광) ──────────────────────────────────
    const defs = svg.append("defs");
    const blur = defs.append("filter").attr("id", "u-glow").attr("x", "-200%").attr("y", "-200%").attr("width", "500%").attr("height", "500%");
    blur.append("feGaussianBlur").attr("stdDeviation", 4);

    const world = svg.append("g");
    const linkLayer = world.append("g");
    const nodeLayer = world.append("g");
    const labelLayer = world.append("g");

    // ── 데이터 ──────────────────────────────────────
    const all = new Map<string, SimNode>();
    for (const n of data.nodes) {
      all.set(n.id, { ...n, r: nodeRadius(n), phase: Math.random() * Math.PI * 2, tx: 0, ty: 0 });
    }
    const childrenOf = new Map<string, string[]>();
    for (const n of data.nodes) if (n.parentId) childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n.id]);

    const expanded = new Set<string>(expandAll ? data.nodes.filter((n) => n.kind === "deal").map((n) => n.id) : []);
    const isVisible = (n: SimNode) => n.kind !== "party" || (n.parentId != null && expanded.has(n.parentId));

    const sim = forceSimulation<SimNode, SimLink>()
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.kind === "party" ? -4 : -10)).distanceMax(160))
      .force("collide", forceCollide<SimNode>((d) => d.r + (d.kind === "customer" ? 10 : 4)).iterations(2))
      .force("x", forceX<SimNode>((d) => d.tx).strength((d) => (d.kind === "me" ? 0.5 : 0.14)))
      .force("y", forceY<SimNode>((d) => d.ty).strength((d) => (d.kind === "me" ? 0.5 : 0.14)))
      .alphaDecay(0.03)
      .velocityDecay(0.35);

    // 유휴 움직임: 노드마다 다른 위상으로 아주 작게 흔들린다
    if (!reduceMotion) {
      sim.force("drift", () => {
        const t = performance.now() / 1000;
        for (const n of sim.nodes()) {
          if (n.kind === "me") continue;
          n.vx = (n.vx ?? 0) + Math.cos(t * 0.35 + n.phase) * 0.018;
          n.vy = (n.vy ?? 0) + Math.sin(t * 0.3 + n.phase) * 0.018;
        }
      });
    }

    let linkSel = linkLayer.selectAll<SVGLineElement, SimLink>("line");
    let nodeSel = nodeLayer.selectAll<SVGGElement, SimNode>("g.node");
    let labelSel = labelLayer.selectAll<SVGTextElement, SimNode>("text");

    let firstRun = true;
    const update = () => {
      const visible = [...all.values()].filter(isVisible);
      const targets = computeTargets(visible);
      for (const n of visible) {
        const t = targets.get(n.id)!;
        const R = orbitRadius(t.depth, scale);
        n.tx = width / 2 + Math.cos(t.angle) * R;
        n.ty = height / 2 + Math.sin(t.angle) * R;
        if (n.x == null) {
          // 새로 보이는 노드는 부모 자리에서 퍼져 나온다
          const p = n.parentId ? all.get(n.parentId) : undefined;
          n.x = p?.x ?? n.tx;
          n.y = p?.y ?? n.ty;
        }
      }
      for (const n of all.values()) {
        if (!isVisible(n)) {
          n.x = undefined;
          n.y = undefined;
        }
      }
      const links: SimLink[] = visible
        .filter((n) => n.parentId && all.has(n.parentId) && isVisible(all.get(n.parentId)!))
        .map((n) => ({ id: n.id, source: n.parentId!, target: n.id }));

      linkSel = linkSel
        .data(links, (d) => d.id)
        .join((e) => e.append("line").attr("class", "link"));

      nodeSel = nodeSel
        .data(visible, (d) => d.id)
        .join((enter) => {
          const g = enter.append("g").attr("class", (d) => `node k-${d.kind}`);
          g.append("circle")
            .attr("class", (d) => `glow s-${d.status}`)
            .attr("r", (d) => d.r * (d.kind === "me" ? 1.7 : 2.1))
            .attr("fill", (d) => (d.kind === "me" ? "#fff" : GLOW[d.status]))
            .attr("filter", "url(#u-glow)")
            .style("animation-delay", (d) => `${(d.phase % 5).toFixed(2)}s`);
          g.append("circle")
            .attr("class", "core")
            .attr("r", (d) => d.r)
            .attr("fill", (d) => (d.status === "grey" || d.status === "hold" ? "var(--st-grey)" : CORE[d.kind]))
            .attr("stroke", (d) => (d.status === "red" || d.status === "yellow" ? GLOW[d.status] : "none"))
            .attr("stroke-width", 1.2)
            .attr("stroke-dasharray", (d) => (d.status === "hold" ? "2 2" : null));
          g.append("title").text((d) => [d.label, d.reason].filter(Boolean).join(" · "));
          return g;
        });

      labelSel = labelSel
        .data(interactive ? visible.filter((d) => d.kind !== "party" || expanded.has(d.parentId ?? "")) : [], (d) => d.id)
        .join((e) =>
          e
            .append("text")
            .attr("class", (d) => `label k-${d.kind}`)
            .attr("text-anchor", "middle")
            .text((d) => (d.kind === "deal" && d.reason ? `${d.label} · ${d.reason}` : d.label)),
        );

      sim.nodes(visible);
      sim.force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => ((l.target as SimNode).kind === "party" ? 34 : 60) * scale)
          .strength((l) => ((l.target as SimNode).kind === "customer" ? 0.02 : 0.2)),
      );
      if (firstRun) {
        // 첫 화면은 미리 자리를 잡아 둔 뒤 그린다 (로딩 시 튀는 움직임 방지)
        firstRun = false;
        sim.alpha(1).stop();
        for (let i = 0; i < 220; i++) sim.tick();
        sim.alpha(0.05).restart();
      } else {
        sim.alpha(0.6).restart();
      }
      if (interactive) bindInteractions();
    };

    // ── 호버·클릭 ───────────────────────────────────
    const neighborhood = (id: string) => {
      const set = new Set<string>();
      const addWithAncestors = (x: string) => {
        set.add(x);
        let cur = all.get(x);
        while (cur?.parentId) {
          set.add(cur.parentId);
          cur = all.get(cur.parentId);
        }
      };
      addWithAncestors(id);
      // 같은 회사가 다른 사업에도 있으면 그 자리까지 함께 밝힌다 (파트너 연관도)
      const ref = all.get(id)?.refId;
      if (ref) for (const n of all.values()) if (n.refId === ref) addWithAncestors(n.id);
      const walk = (x: string) => (childrenOf.get(x) ?? []).forEach((c) => (set.add(c), walk(c)));
      walk(id);
      return set;
    };

    function bindInteractions() {
      nodeSel
        .on("mouseenter", (_, d) => {
          const hl = neighborhood(d.id);
          svg.classed("focusing", true);
          nodeSel.classed("hl", (n) => hl.has(n.id));
          labelSel.classed("hl", (n) => hl.has(n.id));
          linkSel.classed("hl", (l) => hl.has(l.id));
        })
        .on("mouseleave", () => {
          svg.classed("focusing", false);
          nodeSel.classed("hl", false);
          labelSel.classed("hl", false);
          linkSel.classed("hl", false);
        })
        .on("click", (event, d) => {
          event.stopPropagation();
          if (d.kind === "deal" && (childrenOf.get(d.id)?.length ?? 0) > 0) {
            if (expanded.has(d.id)) expanded.delete(d.id);
            else expanded.add(d.id);
            update();
          }
          onSelectRef.current?.(d);
        });
    }

    // ── 줌·팬 ───────────────────────────────────────
    const applyZoomClass = (t: ZoomTransform) => {
      svg.classed("far", t.k < 0.6).classed("near", t.k >= 1.4);
    };
    if (interactive) {
      const z = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (e) => {
          world.attr("transform", e.transform.toString());
          applyZoomClass(e.transform);
        });
      svg.call(z).on("dblclick.zoom", null);
      svg.call(z.transform, zoomIdentity);

      // 노드로 부드럽게 이동·확대. 왼쪽 상세 패널에 가리지 않게 오른쪽으로 비켜 둔다
      flyToRef.current = (id: string) => {
        const target = all.get(id);
        if (!target) return;
        if (target.kind === "party" && target.parentId && !expanded.has(target.parentId)) {
          expanded.add(target.parentId);
          update();
        }
        nodeSel.classed("focused", (n) => n.id === id);
        const from = zoomTransform(svgEl);
        const k = 1.6;
        // 왼쪽 패널(약 412px)을 뺀 나머지 영역의 가운데로 (좁은 화면은 패널이 거의 덮으므로 가운데)
        const offsetX = width >= 640 ? 206 : 0;
        const startAt = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - startAt) / 600);
          const e = 1 - Math.pow(1 - p, 3);
          const tx = width / 2 + offsetX - k * (target.x ?? width / 2);
          const ty = height / 2 - k * (target.y ?? height / 2);
          const t = zoomIdentity
            .translate(from.x + (tx - from.x) * e, from.y + (ty - from.y) * e)
            .scale(from.k + (k - from.k) * e);
          svg.call(z.transform, t);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
    }

    sim.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      labelSel.attr("x", (d) => d.x ?? 0).attr("y", (d) => (d.y ?? 0) + d.r + 13);
    });

    update();
    // 시뮬레이션이 완전히 멈추지 않게 해 천천히 떠다니게 한다
    sim.alphaTarget(reduceMotion ? 0 : 0.02);

    return () => {
      sim.stop();
      flyToRef.current = null;
    };
  }, [data, interactive, expandAll, size]);

  // 검색·티커로 고른 노드로 이동 (자리를 잡을 시간을 조금 준다)
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => flyToRef.current?.(focusId), 350);
    return () => clearTimeout(t);
  }, [focusId, data, size]);

  return <svg ref={svgRef} className={`universe h-full w-full ${className ?? ""}`} />;
}
