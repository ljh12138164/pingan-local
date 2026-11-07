import assert from 'node:assert/strict';
import {build} from 'esbuild';
await build({entryPoints:['src/soulGrowth.ts','src/soulScoring.ts'],outdir:'work/growth-legacy-test',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
const {totalGrowth,growthScore}=await import('../work/growth-legacy-test/soulGrowth.mjs');
const soul={id:'legacy',sub:{speed:2.5}};
assert.equal(totalGrowth(soul,undefined),null);assert.equal(totalGrowth(soul,{initial:4}),null);assert.equal(totalGrowth(soul,{initial:4,attributes:{}}),null);
const fact={hands:1,base:1,low:2,high:3};assert.equal(totalGrowth(soul,{initial:4,attributes:{speed:fact}}),growthScore(2.5,fact).total);
console.log('PASS: historical captures without growth attributes remain unknown and do not crash; complete facts retain computed growth.');
