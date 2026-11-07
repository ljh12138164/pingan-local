import defaults from '../src-tauri/data/association.json';
import {attrs,labels} from './types';
export interface AssociationPlan{id:string;name:string;description:string;averageRatio:number;weights:[number,number,number];levels:Record<string,Record<string,number>>;thresholds:Record<string,[number,number]>}
export const defaultAssociation=defaults as unknown as AssociationPlan;
export const associationMetrics:Record<string,string>={crit_output:'伤害输出面板',damage:'暴击期望输出',healing:'治疗面板',defense_output:'防御输出面板',hit_resist:'命抗双修',...Object.fromEntries(['attack','hp','defense','speed','crit','crit_damage','hit','resist'].map(k=>[k,labels[k]]))};
export function validateAssociation(p:AssociationPlan):string|null{
 if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.description!=='string'||p.description.length>2000)return '方案名称需要1–100个字符，说明最多2000字';
 if(!Number.isFinite(p.averageRatio)||p.averageRatio<0.01||p.averageRatio>1||!Array.isArray(p.weights)||p.weights.length!==3||p.weights.some(v=>!Number.isFinite(v)||v<0||v>100))return '平均成长比例应为1%–100%，权重应为0–100';
 if(!p.levels||Object.keys(p.levels).length!==Object.keys(defaultAssociation.levels).length||Object.entries(p.levels).some(([k,v])=>!Object.hasOwn(defaultAssociation.levels,k)||!v||typeof v!=='object'||Array.isArray(v)||Object.entries(v).some(([a,l])=>!attrs.includes(a)||!Number.isInteger(l)||l<0||l>3)))return '指标或关联等级无效';
 if(!p.thresholds||Object.keys(p.thresholds).length!==Object.keys(defaultAssociation.thresholds).length||Object.entries(p.thresholds).some(([k,v])=>!Object.hasOwn(defaultAssociation.thresholds,k)||!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)||n<0||n>1e9)||v[0]>v[1]))return '升档阈值应为非负数，二级起点不能高于一级';return null;
}
export function associationPlans(settings:Record<string,unknown>){const stored=Array.isArray(settings.associationPlans)?settings.associationPlans as AssociationPlan[]:[];const seen=new Set(['default']);return [defaultAssociation,...stored.filter(p=>{if(validateAssociation(p)||seen.has(p.id))return false;seen.add(p.id);return true;})];}
const drafts=new Map<string,{plan:AssociationPlan;metric:string}>();
export function associationDraft(key:string){const draft=drafts.get(key);return draft?structuredClone(draft):undefined;}
export function rememberAssociationDraft(key:string,draft:{plan:AssociationPlan;metric:string}|null){if(draft)drafts.set(key,structuredClone(draft));else drafts.delete(key);}
export function associationCompleteness(known:boolean){return known?'已知数据完整':'固有属性未读取，仅含已知数据';}
