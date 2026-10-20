// npm install 시 git 훅 경로를 등록한다. git 저장소가 아닌 곳(Vercel 빌드 등)에서는 조용히 건너뛴다.
import { execSync } from "node:child_process";

try {
  execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
  // git 이 없거나 저장소가 아님
}
