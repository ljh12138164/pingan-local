// Isolated browser test: all API responses are synthetic, no real profile DB is read.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('work/beta42-ui');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const soul = (id, slot, main, speed = 17) => ({ id, set: '测试套装', slot, main, quality: 6, level: 15, value: main === 'speed' ? 57 : 55, sub: { speed }, locked: false, equipped: '' });
const souls = [soul('head', 2, 'speed'), soul('foot', 4, 'resist', 16.9999), soul('tail', 4, 'hit', 18), soul('other', 6, 'crit'), soul('legacy', 1, 'attack', 19)];
const data = { name: '合成测试角色', souls, heroes: [], resources: [], tasks: [], guild: [], sets: [], extras: { soulGrowth: Object.fromEntries(souls.slice(0, 4).map(s => [s.id, { initial: 4, attributes: { speed: { hands: 6, base: 3, low: .8, high: 1 } } }])) } };
const profile = { id: 'test', name: data.name, source: 'json', createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z', soulCount: 5 };
const state = { version: '0.4.0', profiles: [profile], activeId: 'test', data, settings: { theme: 'dark' }, rules: [{ id: 'test', name: '测试评分', weights: { speed: 1 }, keep: 10, observe: 5 }], snapshots: [{ id: 'old', profileId: 'test', name: '测试旧快照', createdAt: '2026-11-01T00:00:00Z' }], events: [], catalog: [], databasePath: 'synthetic-only' };
await page.route('**/api/execute', async route => {
  const { operation } = route.request().postDataJSON();
  let result = {};
  if (operation === 'bootstrap' || operation === 'select_profile') result = state;
  else if (operation === 'activity_list') result = { tasks: [], notices: [] };
  else if (operation === 'get_snapshot') result = { ...data, souls: [souls[0]], extras: { soulGrowth: { head: data.extras.soulGrowth.head } } };
  else if (operation === 'speed_overview') result = { scatter: { objective: 159, ids: ['head'] }, exact: true, ranked: [], slots: [], model: 'synthetic test only' };
  await route.fulfill({ json: { result } });
});
async function capture(name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); }
async function downloaded(button) {
  const next = page.waitForEvent('download'); await button.click();
  const file = await next; const dest = path.join(out, file.suggestedFilename()); await file.saveAs(dest);
  return fs.readFile(dest);
}
try {
  await page.goto(process.env.PINGAN_TEST_URL ?? 'http://127.0.0.1:47830/#speed');
  const panel = page.getByRole('region', { name: '速度资产统计' });
  await panel.waitFor();
  const cards = panel.locator('.speed-asset-cards');
  assert.deepEqual(await cards.locator('strong').allTextContents(), ['1', '1', '1', '3', '4']);
  await panel.getByText(/当前有 1 枚速度御魂缺少强化次数/).waitFor();
  const png = await downloaded(panel.getByRole('button', { name: '分享速度统计图' }));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 900);
  const fourth = panel.locator('fieldset').filter({ has: page.getByText('4号位主属性 · 多选', { exact: true }) });
  await fourth.getByLabel('效果命中', { exact: true }).check();
  assert.deepEqual(await cards.locator('strong').allTextContents(), ['1', '0', '1', '3', '3']);
  await fourth.getByLabel('效果抵抗', { exact: true }).check();
  assert.deepEqual(await cards.locator('strong').allTextContents(), ['1', '1', '1', '3', '4']);
  const csv = (await downloaded(panel.getByRole('button', { name: '导出速度资产 CSV' }))).toString('utf8');
  assert.ok(csv.includes('效果命中 / 效果抵抗')); assert.ok(csv.includes('16.9999')); assert.ok(csv.includes('强化次数未读取'));
  await capture('speed-dark-desktop');
  await page.getByRole('button', { name: '计算套装排名', exact: true }).click();
  await page.getByText(/不限套装最佳候选速度加成/).waitFor();
  await page.getByLabel('数据版本', { exact: true }).selectOption('old');
  await page.getByText(/只读历史：/).waitFor();
  assert.deepEqual(await cards.locator('strong').allTextContents(), ['1', '0', '0', '1', '1']);
  assert.equal(await page.getByText(/不限套装最佳候选速度加成/).count(), 0);
  await page.getByRole('button', { name: '回到当前档案', exact: true }).click();
  assert.deepEqual(await cards.locator('strong').allTextContents(), ['1', '1', '1', '3', '4']);
  await page.goto('http://127.0.0.1:47830/#radar');
  const radarFourth = page.locator('fieldset').filter({ has: page.getByText('4号位主属性 · 多选', { exact: true }) });
  await radarFourth.getByLabel('效果命中', { exact: true }).check();
  await page.getByRole('button', { name: '六号位对比', exact: true }).click();
  const fourthRow = page.locator('[data-radar-group="4号位"]');
  assert.equal(await fourthRow.locator('td').first().textContent(), '1');
  const radarCsv = (await downloaded(page.getByRole('button', { name: '导出对比', exact: true }))).toString('utf8');
  assert.ok(radarCsv.includes('4号位：效果命中'));
  await page.getByRole('button', { name: '重置库存筛选', exact: true }).click();
  assert.equal(await fourthRow.locator('td').first().textContent(), '2');
  await capture('radar-dark-desktop');
  for (const theme of ['light', 'dark']) for (const width of [1360, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await capture(`radar-${theme}-${width}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'radar body overflow');
    await page.goto('http://127.0.0.1:47830/#speed');
    await panel.waitFor();
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await capture(`speed-${theme}-${width}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'speed body overflow');
    await page.goto('http://127.0.0.1:47830/#radar');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: cards, raw thresholds, multi-select, CSV/PNG downloads, historical/current snapshots, ranking invalidation, radar totals/reset, light/dark and 1360/800/390 layouts. Synthetic API only.');
} finally { await browser.close(); }
