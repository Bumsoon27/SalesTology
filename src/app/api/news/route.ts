import { NextResponse, type NextRequest } from "next/server";

// 관련 뉴스 (고객사·SI·매입처 이름 검색). 네이버 검색 API 사용 — 서버에서만 키를 쓴다.
// 키 발급: https://developers.naver.com → 애플리케이션 등록 → 검색 API
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

export type NewsItem = { title: string; link: string; description: string; pubDate: string };

const strip = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return NextResponse.json({ items: [], configured: false });

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=6&sort=date`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }, cache: "no-store" });
  if (!res.ok) return NextResponse.json({ items: [], configured: true, error: `뉴스 검색 실패 (${res.status})` }, { status: 502 });

  const json = (await res.json()) as { items: { title: string; originallink: string; link: string; description: string; pubDate: string }[] };
  const items: NewsItem[] = json.items.map((i) => ({
    title: strip(i.title),
    link: i.originallink || i.link,
    description: strip(i.description),
    pubDate: i.pubDate,
  }));
  return NextResponse.json({ items, configured: true });
}
