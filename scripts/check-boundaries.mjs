// PR 에서 A/B 영역 경계와 마이그레이션 규칙을 검사한다 (설계서 §11).
//  - a/* 브랜치는 B 영역을, b/* 브랜치는 A 영역을 수정할 수 없다.
//  - 마이그레이션 파일명은 YYYYMMDDHHMMSS_{a|b}_설명.sql
//  - 이미 main 에 있는 마이그레이션 파일은 수정·삭제할 수 없다 (새 파일로 고친다).
//  - B 마이그레이션은 공용 테이블(teams/profiles/companies)과 A 테이블을 변경할 수 없다.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.env.BASE_REF ?? "origin/main";
const branch = process.env.HEAD_BRANCH ?? "";
const area = branch.startsWith("a/") ? "a" : branch.startsWith("b/") ? "b" : null;

const diff = execSync(`git diff --name-status ${base}...HEAD`, { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status: status[0], path: paths.at(-1) };
  });

const A_PATHS = ["src/app/(auth)/", "src/app/(core)/", "src/features/topology/", "src/features/notifications/", "src/features/deals/"];
const B_PATHS = ["src/app/sos/", "src/features/sos/"];
const MIGRATION_RE = /^supabase\/migrations\/\d{14}_(a|b)_[a-z0-9_]+\.sql$/;
const SHARED_TABLES = /\b(alter|drop|truncate)\s+table\s+(if\s+exists\s+)?(public\.)?(teams|profiles|companies|deals|deal_\w+|issues|activity_log|notification_reads)\b/i;

const errors = [];
const warnings = [];

for (const { status, path } of diff) {
  if (area === "a" && B_PATHS.some((p) => path.startsWith(p))) {
    errors.push(`A 브랜치가 B 영역을 수정했습니다: ${path}`);
  }
  if (area === "b" && A_PATHS.some((p) => path.startsWith(p))) {
    errors.push(`B 브랜치가 A 영역을 수정했습니다: ${path} → A 담당에게 PR/이슈로 요청하세요.`);
  }
  if (path.startsWith("src/shared/") || path === "src/proxy.ts") {
    warnings.push(`공용 영역 변경: ${path} (상대 담당 리뷰 필요, 작은 PR로 분리 권장)`);
  }

  if (path.startsWith("supabase/migrations/")) {
    if (status === "M" || status === "D" || status === "R") {
      errors.push(`기존 마이그레이션 파일은 수정·삭제·이름변경할 수 없습니다: ${path} → 새 마이그레이션을 만드세요.`);
      continue;
    }
    const m = path.match(MIGRATION_RE);
    if (!m) {
      errors.push(`마이그레이션 파일명 규칙 위반: ${path} (예: 20261021093000_a_deals.sql)`);
      continue;
    }
    if (area && m[1] !== area) {
      errors.push(`${area.toUpperCase()} 브랜치에 ${m[1].toUpperCase()} 영역 마이그레이션이 있습니다: ${path}`);
    }
    if (m[1] === "b") {
      const sql = readFileSync(path, "utf8");
      if (SHARED_TABLES.test(sql)) {
        errors.push(`B 마이그레이션이 공용/A 테이블을 변경합니다: ${path} → A에 요청하세요.`);
      }
    }
  }
}

if (!area) warnings.push(`브랜치 이름이 a/ 또는 b/ 로 시작하지 않습니다: "${branch}"`);

for (const w of warnings) console.log(`::warning::${w}`);
for (const e of errors) console.log(`::error::${e}`);

if (errors.length) {
  console.log(`\n경계 규칙 위반 ${errors.length}건`);
  process.exit(1);
}
console.log(`경계 검사 통과 (변경 파일 ${diff.length}개, 영역: ${area ?? "미지정"})`);
