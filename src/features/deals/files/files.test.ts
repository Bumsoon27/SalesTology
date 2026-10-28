import { describe, expect, it } from "vitest";
import { checkFile, cleanName, extOf, formatBytes, MAX_FILE_BYTES, NAME_MAX } from "./files";

describe("checkFile", () => {
  it("확장자로 형식을 정한다 (대소문자 무시)", () => {
    expect(checkFile("견적서.PDF", 1000)).toEqual({ ok: true, name: "견적서.PDF", mime: "application/pdf" });
    expect(checkFile("제안서.hwp", 1000)).toMatchObject({ ok: true, mime: "application/x-hwp" });
  });
  it("허용 안 되는 형식·크기·빈 값은 거절", () => {
    for (const n of ["악성.html", "x.svg", "run.exe", "noext", ".pdf"]) expect(checkFile(n, 10).ok).toBe(false);
    expect(checkFile("a.pdf", 0).ok).toBe(false);
    expect(checkFile("a.pdf", MAX_FILE_BYTES + 1).ok).toBe(false);
    expect(checkFile("a.pdf", MAX_FILE_BYTES).ok).toBe(true);
    expect(checkFile(1, 10).ok).toBe(false);
    expect(checkFile("a.pdf", Number.NaN).ok).toBe(false);
  });
});

describe("cleanName·extOf·formatBytes", () => {
  it("경로·제어 문자를 지우고 길이를 줄이되 확장자는 지킨다", () => {
    expect(cleanName("../../etc/pa\u0000ss.pdf")).toBe("....etcpass.pdf");
    expect(cleanName("  a   b.pdf ")).toBe("a b.pdf");
    const long = cleanName(`${"가".repeat(300)}.docx`);
    expect(long.length).toBe(NAME_MAX);
    expect(long.endsWith(".docx")).toBe(true);
    expect(extOf("a.tar.ZIP")).toBe("zip");
    expect(formatBytes(1536)).toBe("2KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0MB");
  });
});
