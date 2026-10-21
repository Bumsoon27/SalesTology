"use client";

// 모바일에서 '앱으로 설치' 안내. Android/Chrome 은 설치 버튼, iOS Safari 는 홈 화면 추가 방법을 보여준다.
import { useEffect, useState } from "react";
import { LogoMark } from "./logo";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "st-install-dismissed";

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone || wasDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari 는 설치 이벤트가 없으므로 안내만 (모바일 화면에서만)
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    const t = isIos && window.innerWidth < 768 ? setTimeout(() => setIos(true), 1500) : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDeferred(null);
    setIos(false);
  };

  if (!deferred && !ios) return null;
  return (
    <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-2xl md:inset-x-auto md:right-4 md:w-80">
      <LogoMark size={40} />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-fg">SalesTology 앱으로 쓰기</p>
        <p className="text-muted">{ios ? "공유 버튼 → '홈 화면에 추가'를 누르세요" : "홈 화면에 설치하면 앱처럼 바로 열립니다"}</p>
      </div>
      {deferred && (
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            close();
          }}
          className="rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-bg"
        >
          설치
        </button>
      )}
      <button type="button" onClick={close} className="px-1 text-muted" aria-label="닫기">
        ✕
      </button>
    </div>
  );
}
