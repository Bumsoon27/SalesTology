"use client";

// 등록된 파트너사를 칩으로 골라 넣는다. 목록에 없는 이름도 추가할 수 있고, 저장 시 파트너로 등록된다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function PartnerPicker({ name, options, placeholder }: { name: string; options: string[]; placeholder: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const hiddenRef = useRef<HTMLInputElement>(null);

  // 폼이 초기화되면 선택도 비운다
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setSelected([]);
      setDraft("");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const toggle = (n: string) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const addDraft = () => {
    const v = draft.trim();
    if (v && !selected.includes(v)) setSelected((s) => [...s, v]);
    setDraft("");
  };
  const extra = selected.filter((s) => !options.includes(s));

  return (
    <div className="space-y-2">
      <input ref={hiddenRef} type="hidden" name={name} value={selected.join(",")} />
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                selected.includes(o) ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"
              }`}
            >
              {selected.includes(o) ? "✓ " : ""}
              {o}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">
          등록된 파트너가 없습니다. <Link href="/partners" className="text-fg underline-offset-4 hover:underline">파트너사 등록</Link>
        </p>
      )}
      {extra.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extra.map((o) => (
            <button key={o} type="button" onClick={() => toggle(o)} className="rounded-full border border-st-yellow/50 px-2.5 py-1 text-xs text-st-yellow">
              + {o} (새 파트너) ✕
            </button>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addDraft();
          }
        }}
        onBlur={addDraft}
        className="field py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}
