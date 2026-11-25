const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const envLocalPath = path.join(frontendRoot, '.env.local');
const environmentPath = path.join(frontendRoot, 'src', 'environments', 'environment.ts');

function readEnvLocal(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((values, line) => {
      const separator = line.indexOf('=');
      if (separator === -1) {
        return values;
      }

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
      return values;
    }, {});
}

const localEnv = readEnvLocal(envLocalPath);
const license = process.env.PRIMEUI_LICENSE || localEnv.PRIMEUI_LICENSE;

if (license) {
  fs.writeFileSync(
    envLocalPath,
    `PRIMEUI_LICENSE=${license}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
}

fs.mkdirSync(path.dirname(environmentPath), { recursive: true });
fs.writeFileSync(
  environmentPath,
  `export const environment = {\n  primeUiLicense: ${JSON.stringify(license || '')}\n};\n`,
  'utf8'
);
