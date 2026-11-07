import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesHero } from '../src/heroSearch.ts';

for (const query of ['神堕八岐大蛇', '神蛇', 'shenduobaqidashe', 'SDBQDS', '神堕 bqds', '  神蛇  ', 'dc25']) {
  test(`finds 神堕八岐大蛇 using ${query}`, () => assert.equal(matchesHero('神堕八岐大蛇', query, '1234d3dc25'), true));
}
test('supports polyphonic pinyin', () => assert.equal(matchesHero('不知火', 'buzhihuo'), true));
test('keeps character order', () => assert.equal(matchesHero('神堕八岐大蛇', '蛇神'), false));
test('rejects unrelated names', () => assert.equal(matchesHero('辉夜姬', 'sdbqds'), false));
test('empty query shows every name', () => assert.equal(matchesHero('辉夜姬', '  '), true));
