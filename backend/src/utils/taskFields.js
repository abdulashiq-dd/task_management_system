const { createError } = require("./httpError");
const FIELDS = ["title", "description", "status", "priority", "dueDate", "tags"];
function taskFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw createError("Task body must be an object");
  const fields = {};
  for (const key of Object.keys(input)) {
    if (!FIELDS.includes(key)) throw createError(`Unsupported task field: ${key}`);
    fields[key] = input[key];
  }
  if (!Object.keys(fields).length) throw createError("Provide at least one valid task field");
  return fields;
}
module.exports = { taskFields };
