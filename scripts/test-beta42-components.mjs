import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
await build({ entryPoints: ['src/SpeedAssetPanel.tsx', 'src/pages/Radar.tsx', 'src/speedShare.ts'], outdir: 'work/beta42-components', bundle: true, platform: 'node', format: 'esm', packages: 'external', outExtension: { '.js': '.mjs' }, plugins: [{ name: 'synthetic-context', setup(b) {
  b.onResolve({ filter: /(^|\/)context$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  b.onResolve({ filter: /(^|\/)api$/ }, () => ({ path: 'api', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'context' ? 'export const useApp=()=>globalThis.fixtureContext;' : 'export const download=async()=>true;export const downloadImageExport=async()=>true;export const csv=rows=>JSON.stringify(rows);' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'css' }));
} }] });
const { default: Panel } = await import('../work/beta42-components/SpeedAssetPanel.mjs');
const { default: Radar } = await import('../work/beta42-components/pages/Radar.mjs');
const { speedSummaryPng } = await import('../work/beta42-components/speedShare.mjs');
const fact = { initial: 4, attributes: { speed: { hands: 6, base: 3, low: .8, high: 1 } } };
const souls = [ { id: 'head', set: '测试套装', slot: 2, quality: 6, level: 15, main: 'speed', value: 57, sub: { speed: 17 }, locked: false, equipped: '' } ];
const data = { name: '<测试角色>', souls, heroes: [], resources: [], tasks: [], guild: [], sets: [], extras: { soulGrowth: { head: fact } } };
const state = { activeId: 'test', data, profiles: [{ id: 'test', updatedAt: '2026-11-08' }], settings: {}, rules: [] };
function context(patch = {}) { globalThis.fixtureContext = { state, history: null, notify: () => {}, ...patch }; }

test('speed panel renders all five categories, filters, actions and confirmed detail IDs', () => {
  context(); const html = renderToStaticMarkup(React.createElement(Panel));
  for (const text of ['头', '脚', '尾', '真17', '满速御魂', '4号位主属性', '6号位主属性', '分享速度统计图', '导出速度资产 CSV', '测试套装 · head']) assert.ok(html.includes(text), text);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 4);
});
test('legacy data shows explicit unknown coverage and does not expose guessed rows', () => {
  context({ state: { ...state, data: { ...data, extras: {} } } });
  const html = renderToStaticMarkup(React.createElement(Panel));
  assert.ok(html.includes('当前有 1 枚速度御魂缺少强化次数'));
  assert.ok(html.includes('暂无可确认的此类御魂'));
  assert.ok(!html.includes('测试套装 · head'));
});
test('empty state and absent profile render safely without enabling downloads', () => {
  context({ state: null }); const html = renderToStaticMarkup(React.createElement(Panel));
  assert.ok(html.includes('disabled=""')); assert.ok(html.includes('当前筛选下没有此类御魂'));
});
test('radar renders all new main-attribute groups and clear filter semantics', () => {
  context(); const html = renderToStaticMarkup(React.createElement(Radar));
  for (const text of ['2号位主属性', '4号位主属性', '6号位主属性', '重置库存筛选', '1/3/5号位不受影响']) assert.ok(html.includes(text), text);
});
test('PNG renderer includes the provided card counts, version, filters and unknown coverage', async () => {
  const drawn = [];
  const ctx = { fillRect() {}, fillText(value) { drawn.push(value); } };
  const canvas = { getContext: () => ctx, toBlob(callback, mime) { assert.equal(mime, 'image/png'); callback(new Blob(['test-adapter-only'])); } };
  globalThis.document = { createElement: () => canvas };
  const bytes = await speedSummaryPng({ name: '测试角色', version: '历史版本 · 测试快照', filters: '4号位：命中 / 抵抗', unknown: 7, counts: [{ label: '头', count: 3 }, { label: '满速御魂', count: 12 }] });
  for (const value of ['历史版本 · 测试快照', '4号位：命中 / 抵抗', '3', '12', '强化次数未读取：7 枚（不计入统计）']) assert.ok(drawn.includes(value), value);
  assert.equal(canvas.width, 1200); assert.equal(canvas.height, 900); assert.ok(bytes.length > 0);
});
test('PNG renderer reports unsupported canvas and failed encoding instead of returning success', async () => {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  await assert.rejects(speedSummaryPng({}), /不支持图片生成/);
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }), toBlob(callback) { callback(null); } }) };
  await assert.rejects(speedSummaryPng({ name: '', version: '', filters: '', unknown: 0, counts: [] }), /图片生成失败/);
});
