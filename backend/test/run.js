// Run original assertion suites in separate processes. Never use the application's database.
const { spawnSync } = require("node:child_process");
const { randomUUID, randomBytes } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const units = ["filesystemExamples", "bufferExamples", "streamExamples", "fileStorageExamples", "retryExamples", "jobQueueRetryExamples", "jobWorkerRetryExamples", "jobServiceRetryExamples"];
const integration = ["exportModelExamples", "jsonExportExamples", "csvExportExamples", "reportFileExamples", "exportJobExamples", "exportQueueExamples", "idempotencyExamples", "databaseRetryExamples", "exportApiExamples"];
const root = mkdtempSync(join(tmpdir(), "task-hardening-"));
const failures = [];
let total = 0;
const env = { ...process.env, JOB_QUEUE_MODE: "memory", EXPORT_ROOT: root, JWT_SECRET: randomBytes(32).toString("hex"), LOG_LEVEL: "silent" };
function run(file, args = []) {
  total++; console.log(`\nRUNNING ${file}`);
  const result = spawnSync(process.execPath, [file, ...args], { env, stdio: "inherit", timeout: 180000 });
  if (result.status !== 0) failures.push(file);
}
async function main() {
  const unitOnly = process.argv.includes("--unit"), integrationOnly = process.argv.includes("--integration");
  if (!integrationOnly) {
    run("test/hardening.unit.test.js");
    run("test/milestone12.errors.test.js");
    run("test/milestone11.services.test.js");
    for (const name of units) run(`test/legacy/${name}.js`);
  }
  if (!unitOnly) {
    const mongoose = require("mongoose");
    const bcrypt = require("bcrypt");
    const db = `task_hardening_test_${randomUUID().replaceAll("-", "")}`;
    // A distinct database name overrides the connection string's default database.
    // Use a local/fresh MongoDB server. TEST_MONGO_URI must allow create/drop of test databases.
    const uri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017";
    const slash = uri.indexOf("/", uri.indexOf("://") + 3);
    const question = uri.indexOf("?");
    const base = slash >= 0 && (question < 0 || slash < question) ? uri.slice(0, slash) : question >= 0 ? uri.slice(0, question) : uri;
    const query = question >= 0 ? uri.slice(question) : "";
    env.MONGO_URI = `${base}/${db}${query}`;
    env.TEST_ADMIN_EMAIL = "admin@example.invalid"; env.TEST_USER_EMAIL = "user@example.invalid";
    env.TEST_ADMIN_PASSWORD = randomBytes(18).toString("hex"); env.TEST_USER_PASSWORD = randomBytes(18).toString("hex");
    try {
      await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      const User = require("../src/models/userModel"), Task = require("../src/models/taskModel");
      await User.createIndexes();
      const [admin, user] = await User.create([{ name: "Fixture Admin", email: env.TEST_ADMIN_EMAIL, password: await bcrypt.hash(env.TEST_ADMIN_PASSWORD, 12), role: "admin" }, { name: "Fixture User", email: env.TEST_USER_EMAIL, password: await bcrypt.hash(env.TEST_USER_PASSWORD, 12), role: "user" }]);
      await Task.create([{ title: "Fixture admin task", createdBy: admin._id }, { title: "Fixture assigned task", createdBy: admin._id, assignedTo: user._id }, { title: "Fixture user task", createdBy: user._id }]);
      for (const name of integration) run(`test/legacy/${name}.js`);
      run("test/hardening.integration.test.js");
      run("test/milestone12.api.test.js");
    } finally {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === db && db.startsWith("task_hardening_test_")) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
main().catch(error => { console.error("Test setup failed:", error.message); failures.push("test setup"); }).finally(() => { rmSync(root, { recursive: true, force: true }); console.log(`\nSuites executed: ${total}; failed: ${failures.length}`); if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; } });
