import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function configResolver(raw = {}) {
  const cache = new Map();
  return function resolve(key, seen = new Set()) {
    if (cache.has(key)) return cache.get(key);
    if (seen.has(key)) throw Error(`Config prototype cycle: ${key}`);
    const row = raw[key];
    if (!row) return undefined;
    seen.add(key);
    const result = { ...(row._proto_key ? resolve(JSON.stringify(row._proto_key), seen) : {}), ...row };
    cache.set(key, result);
    return result;
  };
}

export function renderSkillText(text, row, dictionary, tables = {}, onReference) {
  return String(text || '').replace(/\[([^\]]+)\]/g, (token, name) => {
    const reference = name.match(/^(buff|tips|skill|extra)_(\d+)(?:_(\d+))?$/);
    if (reference) {
      const [,kind,id,level='1'] = reference;
      const data = kind === 'tips' ? tables.tips?.[id] : kind === 'buff' ? tables.buff?.(JSON.stringify([Number(id),Number(level)])) : tables.skill?.(Number(id),Number(level));
      const label = data?.[kind === 'tips' ? 'skill_tips_name' : kind === 'buff' ? 'name' : 'skill_name'];
      if (typeof label !== 'string' || !label) return token;
      onReference?.({ kind, id: Number(id), level: Number(level), name: label, data });
      return label;
    }
    if (name.startsWith('extra_') && !/^extra_\d/.test(name)) return name.slice(6);
    const match = name.match(/^((?:s|b|b2|z)_.+?)(?:_(per|int|var|abs|str))?$/);
    if (!match || !dictionary[match[1]]) return token;
    const field = dictionary[match[1]], prefix = match[1].split('_')[0];
    const source = prefix === 's' ? row : prefix === 'z' ? tables.slave?.[String(Math.trunc(row.shunshi_xg_value))] : tables.buff?.(JSON.stringify([row[prefix === 'b2' ? 'buffId2' : 'buffId'],row[prefix === 'b2' ? 'buffLevel2' : 'buffLevel']]));
    const value = source?.[field.segmentId], type = match[2] || field.valueType;
    if (type === 'str') return typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? String(value) : token;
    if (typeof value !== 'number' || !Number.isFinite(value)) return token;
    const amount = Math.abs(value);
    return type === 'per' ? `${Number((amount * 100).toFixed(3))}%` : String(Number((type === 'int' ? Math.trunc(amount) : amount).toFixed(3)));
  }).replace(/<[^>]+>/g, '');
}

export function buildSkillFacts(raw, dictionary, heroes, configs = {}) {
  const resolve = configResolver(raw);
  const skill = (id, level) => [-1,1,0].map(variant => resolve(JSON.stringify([id,level,variant]))).find(Boolean);
  const tables = { buff: configResolver(configs.buff), tips: configs.tips, slave: configs.slave, skill };
  const skills = {};
  for (const id of new Set(Object.values(heroes).flatMap(h => h.skills))) {
    const levels = [];
    for (let level = 1; level <= 5; level++) {
      const row = skill(id,level);
      if (!row) continue;
      const references = new Map();
      const collect = reference => { const key = `${reference.kind}:${reference.id}:${reference.level}`; if (!references.has(key) && references.size < 200) references.set(key,reference); };
      const render = text => renderSkillText(text, row, dictionary, tables, collect);
      const entry = { level, name: row.skill_name, description: render(row.combatDesc || row.desc), baseDescription: render(row.desc), upgrade: render(row.levDes), cost: row.consumeVal };
      for (const reference of references.values()) {
        const data = reference.data;
        reference.description = renderSkillText(reference.kind === 'tips' ? data.skill_tips_text : reference.kind === 'buff' ? data.buffDesc : data.combatDesc || data.desc, data, dictionary, tables, collect);
      }
      if (references.size) entry.references = [...references.values()].map(({data,...reference}) => reference);
      levels.push(entry);
    }
    if (levels.length) skills[id] = { name: levels[0].name, maxLevel: Math.max(...levels.map(l => l.level)), levels };
  }
  return skills;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (![4,7].includes(paths.length)) throw Error('Usage: node scripts/build-skill-facts.mjs <skill.json> <dict_skill.json> <hero-facts.json> <output.json> [buff.json tips.json slave.json]');
  const [raw, dictionary, heroes] = paths.slice(0, 3).map(p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')));
  const configs = paths.length === 7 ? Object.fromEntries(['buff','tips','slave'].map((key,index) => [key,JSON.parse(fs.readFileSync(paths[index+4],'utf8').replace(/^\uFEFF/,''))])) : {};
  const skills = buildSkillFacts(raw, dictionary, heroes, configs);
  fs.writeFileSync(paths[3], JSON.stringify(skills, null, 2));
  console.log(`Built ${Object.keys(skills).length} independently sourced skills; unresolved references remain explicit.`);
}
