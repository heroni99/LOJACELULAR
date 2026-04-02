import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const candidatePaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(__dirname, "../../../../.env"),
  resolve(__dirname, "../../../../../../../.env")
];

for (const envPath of candidatePaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}
