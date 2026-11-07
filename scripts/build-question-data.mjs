import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ts from 'typescript';

// Pin the public MIT-licensed data blobs; never execute downloaded TypeScript.
const repo = 'zzliux/assttyys_autojs';
const blobs = { questions: '5c99dbadaa4247ad90337dfcd159d3fc0899164e', license: '7e788c8eecee2293ef4bb283852772e33fa13a8a' };
async function readBlob(sha) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${sha}`, { headers: { 'User-Agent': 'pingan-local-data-builder' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw Error(`GitHub blob ${sha}: ${res.status}`);
  const data = await res.json();
  if (data.encoding !== 'base64') throw Error('Expected base64 blob');
  return Buffer.from(data.content, 'base64').toString('utf8');
}
const source = process.argv[2] ? await fs.readFile(process.argv[2], 'utf8') : await readBlob(blobs.questions);
const sourceFile = ts.createSourceFile('questions.ts', source, ts.ScriptTarget.Latest, true);
const exported = sourceFile.statements.find(ts.isExportAssignment)?.expression;
if (!exported || !ts.isArrayLiteralExpression(exported)) throw Error('Expected an exported static array');
const grouped = new Map();
for (const item of exported.elements) {
  if (!ts.isObjectLiteralExpression(item)) throw Error('Expected static question object');
  const fields = {};
  for (const prop of item.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.initializer)) throw Error('Expected literal question fields');
    fields[prop.name.getText(sourceFile)] = prop.initializer.text.trim();
  }
  if (!fields.question || !fields.ans || Object.keys(fields).some(k => !['question', 'ans'].includes(k))) throw Error('Unexpected question shape');
  const answers = grouped.get(fields.question) ?? new Set();
  answers.add(fields.ans); grouped.set(fields.question, answers);
}
if (grouped.size < 700) throw Error('Question data unexpectedly small');
// Pipe-separated strings in this automation dataset mix OCR aliases with answers.
// Exclude these ambiguous variants instead of presenting OCR guesses as answers.
const questions = [...grouped].map(([question, answers], index) => ({ id: index + 1, question, answers: [...answers].filter(a => !a.includes('|')) })).filter(q => q.answers.length);
const license = process.argv[3] ? await fs.readFile(process.argv[3], 'utf8') : await readBlob(blobs.license);
if (!license.startsWith('MIT License') || !license.includes('Copyright (c) 2019 Chaos')) throw Error('Unexpected license');
const output = { source: `https://github.com/${repo}/blob/master/src/common/fmmxQuestionList.ts`, blob: blobs.questions, license: 'MIT', copyright: 'Copyright (c) 2019 Chaos', fetchedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(source).digest('hex'), excluded: grouped.size - questions.length, questions };
await fs.mkdir('licenses', { recursive: true });
await fs.mkdir('public/licenses', { recursive: true });
await fs.writeFile('licenses/assttyys-questions-MIT.txt', license);
await fs.writeFile('public/licenses/assttyys-questions-MIT.txt', license);
await fs.writeFile('src/data/questions.json', JSON.stringify(output));
console.log(JSON.stringify({ questions: questions.length, answers: new Set(questions.flatMap(q => q.answers)).size, conflicts: questions.filter(q => q.answers.length > 1), sha256: output.sha256 }));
