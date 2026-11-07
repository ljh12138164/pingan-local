import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillFacts, configResolver, renderSkillText } from './build-skill-facts.mjs';

const dictionary = { 's_参数p1': { segmentId: 'param1', valueType: 'var' }, 's_伤害加成': { segmentId: 'addDmg', valueType: 'per' } };
test('absolute skill parameters remain absolute while percentage parameters scale', () => {
  assert.equal(renderSkillText('上限[s_参数p1_abs]层，伤害[s_伤害加成_per]。', { param1: 4, addDmg: 1.25 }, dictionary), '上限4层，伤害125%。');
  assert.equal(renderSkillText('[s_参数p1_abs] / [s_参数p1] / [s_伤害加成]', { param1: 0, addDmg: 0 }, dictionary), '0 / 0 / 0%');
});
test('missing values, unknown buff/tip references and nonfinite values are never fabricated', () => {
  const text = '[s_参数p1_abs] [buff_2232_1] [tips_11] [s_未知_per]';
  assert.equal(renderSkillText(text, {}, dictionary), text);
  assert.equal(renderSkillText(text, { param1: NaN }, dictionary), text);
  assert.equal(renderSkillText(text, { param1: 4 }, dictionary), '4 [buff_2232_1] [tips_11] [s_未知_per]');
});
test('level-specific numeric overrides resolve through prototypes without leaking other skills', () => {
  const raw = { '[1,1,-1]': { _proto_key: [1,2,-1], param1: 4 }, '[1,2,-1]': { skill_name: '配置技能', combatDesc: '达到[s_参数p1_abs]层', param1: 6, consumeVal: 2 }, '[2,1,-1]': { skill_name: '未请求技能' } };
  const skills = buildSkillFacts(raw, dictionary, { 200: { skills: [1] } });
  assert.deepEqual(Object.keys(skills), ['1']);assert.equal(skills[1].maxLevel, 2);
  assert.equal(skills[1].levels[0].description, '达到4层');assert.equal(skills[1].levels[1].description, '达到6层');assert.equal(skills[1].levels[0].cost, 2);
});
test('prototype cycles fail rather than producing invented descriptions', () => {
  assert.throws(() => buildSkillFacts({ '[1,1,-1]': { _proto_key: [1,2,-1] }, '[1,2,-1]': { _proto_key: [1,1,-1] } }, dictionary, { 200: { skills: [1] } }), /cycle/);
});
test('buff and summon values use their own level and config rather than same-named skill fields', () => {
  const fields = { 'b_数值': { segmentId: 'value1', valueType: 'per' }, 'b2_数值': { segmentId: 'param1', valueType: 'var' }, 'z_生命': { segmentId: 'hpInherit', valueType: 'per' } };
  const row = { buffId: 10, buffLevel: 2, buffId2: 20, buffLevel2: 1, shunshi_xg_value: 140.9, value1: 99, param1: 88 };
  const tables = { buff: configResolver({ '[10,1]': { value1: -0.1 }, '[10,2]': { _proto_key: [10,1], value1: -0.25 }, '[20,1]': { param1: 4 } }), slave: { 140: { hpInherit: 0.3 } } };
  assert.equal(renderSkillText('[b_数值_per] / [b2_数值_abs] / [z_生命]', row, fields, tables), '25% / 4 / 30%');
  assert.equal(renderSkillText('[b_数值_per] / [z_生命]', {}, fields, tables), '[b_数值_per] / [z_生命]');
});
test('known terms, skill references and expanded annotation text retain the original wording', () => {
  const tables = { buff: configResolver({ '[99,1]': { name: '护盾' } }), tips: { 2: { skill_tips_name: '基础概率' } }, skill: (id,level) => id === 5 && level === 2 ? { skill_name: '后续技能' } : undefined };
  const references=[];
  assert.equal(renderSkillText('[buff_99_1][tips_2][skill_5_2][extra_（至多5层）][buff_999_1][extra_999_1]', {}, {}, tables, r=>references.push(r)), '护盾基础概率后续技能（至多5层）[buff_999_1][extra_999_1]');
  assert.deepEqual(references.map(r=>[r.kind,r.id,r.level]), [['buff',99,1],['tips',2,1],['skill',5,2]]);
});
test('referenced explanations are deduplicated, resolve their own fields and stop at named cycles', () => {
  const raw = { '[1,1,-1]': { skill_name:'主技能', combatDesc:'[buff_99_1][buff_99_1]，50%[tips_2]', levDes:'[skill_2_1]' }, '[2,1,-1]': { skill_name:'后续', combatDesc:'返回[skill_1_1]' } };
  const facts=buildSkillFacts(raw, dictionary, { 200:{skills:[1]} }, { buff:{ '[99,1]':{ name:'护盾', buffDesc:'吸收[s_参数p1_abs]点；[tips_2]', param1:-4 } }, tips:{ 2:{skill_tips_name:'基础概率',skill_tips_text:'受命中影响。'} } });
  const row=facts[1].levels[0];
  assert.equal(row.description,'护盾护盾，50%基础概率');
  assert.equal(row.references.length,4);
  assert.equal(row.references.find(r=>r.kind==='buff').description,'吸收4点；基础概率');
  assert.equal(row.references.find(r=>r.id===2&&r.kind==='skill').description,'返回主技能');
  assert.equal(row.references.some(r=>'data' in r),false);
});
