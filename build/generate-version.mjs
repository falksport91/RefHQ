import fs from "node:fs/promises";

const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const metadata = {
  app: "law18ref",
  name: "Law18Referee Management",
  version: packageJson.version,
  updated_at: new Date().toISOString(),
};

const commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.SOURCE_VERSION;
if (commit) metadata.commit = commit;

await fs.writeFile(
  new URL("../public/version.json", import.meta.url),
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);
