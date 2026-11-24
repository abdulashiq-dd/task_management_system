const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
let count = 0, failed = 0;
function check(path) { count++; const result = spawnSync(process.execPath, ["--check", path], { stdio: "inherit" }); if (result.status !== 0) failed++; }
function walk(dir) { for (const ent of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, ent.name); if (ent.isDirectory()) walk(path); else if (ent.name.endsWith(".js")) check(path); } }
check("server.js"); for (const dir of ["src", "test", "scripts", "learning-examples"]) walk(dir);
console.log(`${count - failed}/${count} JavaScript files passed syntax checks`); process.exitCode = failed ? 1 : 0;
