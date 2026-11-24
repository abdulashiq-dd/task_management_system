
const CSV_COLUMNS = Object.freeze([
  "id",
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "tags",
  "isOverdue",
  "overdueAt",
  "createdBy",
  "assignedTo",
  "createdAt",
  "updatedAt"
]);

// ==========================================
// 1. CONVERT VALUES TO CSV TEXT
// ==========================================

function normalizeValue(value) {

  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);

}

// ==========================================
// 2. FORMULA INJECTION PROTECTION
// ==========================================

function preventFormulaInjection(value) {

  const dangerousPrefix =
    /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u;

  if (dangerousPrefix.test(value)) {
    return "'" + value;
  }

  return value;

}

// ==========================================
// 3. ESCAPE CSV VALUES
// ==========================================

function escapeCSVValue(value) {

  const normalized = normalizeValue(value);

  const protectedValue =
    preventFormulaInjection(normalized);

  const escaped = protectedValue.replace(
    /"/g,
    '""'
  );

  return `"${escaped}"`;

}

// ==========================================
// 4. GENERATE CSV HEADER
// ==========================================

function generateCSVHeader() {

  return CSV_COLUMNS
    .map(escapeCSVValue)
    .join(",") + "\r\n";

}

// ==========================================
// 5. GENERATE INDIVIDUAL CSV ROW
// ==========================================

function generateCSVRow(task) {

  return CSV_COLUMNS

    .map(column => escapeCSVValue(task[column]))

    .join(",") + "\r\n";

}

// ==========================================
// 6. EXPORT FUNCTIONS
// ==========================================

module.exports = {
  CSV_COLUMNS,
  normalizeValue,
  preventFormulaInjection,
  escapeCSVValue,
  generateCSVHeader,
  generateCSVRow
};
