// Generates shared/rules-schema.json from Zod for the frontend Monaco editor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ruleSetInputZ } from '../src/rules/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, '..', 'shared', 'rules-schema.json');
const schema = zodToJsonSchema(ruleSetInputZ, 'RuleSetInput');
fs.writeFileSync(out, JSON.stringify(schema, null, 2));
console.log(`wrote ${out}`);
