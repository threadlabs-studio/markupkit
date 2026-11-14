#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [folder] = process.argv.slice(2);
if (!folder) {
  console.error("Name the folder to create: npm create markupkit@latest my-app");
  process.exit(1);
}
const root = resolve(folder);
if (existsSync(root) && readdirSync(root).length > 0) {
  console.error(`${folder} already has files in it. Choose a new or empty folder.`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
cpSync(fileURLToPath(new URL("template", import.meta.url)), root, { recursive: true });
// npm leaves .gitignore out of published packages, so the template keeps it as _gitignore.
renameSync(join(root, "_gitignore"), join(root, ".gitignore"));
const manifest = join(root, "package.json");
const app = JSON.parse(readFileSync(manifest, "utf8"));
app.name = basename(root).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+/, "") || "markupkit-app";
app.dependencies["@threadlabs/markupkit"] = `^${version}`;
writeFileSync(manifest, JSON.stringify(app, null, 2) + "\n");

const run = /^(pnpm|yarn|bun)\//.exec(process.env.npm_config_user_agent ?? "")?.[1] ?? "npm";
console.log(`
Created ${folder}. Next:

  cd ${relative(process.cwd(), root) || "."}
  ${run} install
  ${run} run dev
`);
