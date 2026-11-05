import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/logo-data.ts', import.meta.url));
const logo = mode => {
  const image = readFileSync(new URL(`../assets/markee-logo-${mode}.png`, import.meta.url));
  return `export const ${mode}Logo: string = 'data:image/png;base64,${image.toString('base64')}';`;
};
const content = `// Generated from the Markee logo artwork used by Gardens. Run npm run build to refresh.\n${logo('light')}\n${logo('dark')}\n`;
writeFileSync(source, content);
