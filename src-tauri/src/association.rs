use crate::model::*;
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::collections::BTreeMap;

#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Plan{pub id:String,pub name:String,#[serde(default)]pub description:String,pub average_ratio:f64,pub weights:[f64;3],pub levels:BTreeMap<String,BTreeMap<String,u8>>,pub thresholds:BTreeMap<String,[f64;2]>}
pub fn default_plan()->Plan{serde_json::from_str(include_str!("../data/association.json")).expect("bundled association facts")}
pub fn validate(plan:&Plan)->Result<(),String>{
 if plan.id.is_empty()||plan.id.chars().count()>100||plan.name.trim().is_empty()||plan.name.chars().count()>100||plan.description.chars().count()>2000{return Err("方案名称、编号或说明不合法".into());}
 if !plan.average_ratio.is_finite()||plan.average_ratio<0.01||plan.average_ratio>1.0||plan.weights.iter().any(|v|!v.is_finite()||*v<0.0||*v>100.0){return Err("平均成长比例应为1%–100%，权重应为0–100".into());}
 let defaults=default_plan();if plan.levels.len()!=defaults.levels.len()||plan.levels.iter().any(|(metric,rows)|!defaults.levels.contains_key(metric)||rows.iter().any(|(attr,level)|!ATTRS.contains(&attr.as_str())||*level>3)){return Err("指标或关联等级不合法".into());}
 if plan.thresholds.len()!=defaults.thresholds.len()||plan.thresholds.iter().any(|(attr,values)|!defaults.thresholds.contains_key(attr)||values.iter().any(|v|!v.is_finite()||*v<0.0||*v>1e9)||values[0]>values[1]){return Err("升档阈值应为非负数，二级起点不能高于一级".into());}Ok(())
}
pub fn effective_levels(plan:&Plan,metric:&str,base:&Stats,minimums:&Stats)->BTreeMap<String,u8>{
 let mut levels=plan.levels.get(metric).cloned().unwrap_or_default();
 for(attr,[second,first])in &plan.thresholds{let Some(min)=minimums.get(attr)else{continue};let extra=min-base.get(attr).copied().unwrap_or(0.0);let promoted=if extra>=*first{1}else if extra>=*second{2}else{continue};let existing=levels.get(attr).copied().unwrap_or(0);if existing==0||existing>promoted{levels.insert(attr.clone(),promoted);} }
 levels
}
fn maxima()->Stats{serde_json::from_str::<Value>(include_str!("../data/upgrade.json")).unwrap()["rollMax"].as_object().unwrap().iter().map(|(k,v)|(k.clone(),v.as_f64().unwrap())).collect()}
fn set_share(soul:&Soul,count:usize,sets:&[SetDef])->Stats{sets.iter().find(|d|d.name==soul.set).filter(|_|count>=2).map(|d|d.two_piece.iter().map(|(k,v)|(k.clone(),v*if count>=6{2.0}else{1.0}/count as f64)).collect()).unwrap_or_default()}
pub fn combination_score(souls:&[&Soul],sets:&[SetDef],plan:&Plan,metric:&str,base:&Stats,minimums:&Stats)->f64{let levels=effective_levels(plan,metric,base,minimums);souls.iter().map(|s|evaluate(s,plan,&levels,&set_share(s,souls.iter().filter(|a|a.set==s.set).count(),sets))["current"].as_f64().unwrap()).sum()}
pub fn evaluate(soul:&Soul,plan:&Plan,levels:&BTreeMap<String,u8>,share:&Stats)->Value{
 let max=maxima();let mut rows=Vec::new();let mut score=0.0;
 for attr in ATTRS{let level=levels.get(attr).copied().unwrap_or(0);if level==0{continue;}let weight=plan.weights[usize::from(level-1)];let sub=soul.sub.get(attr).copied().unwrap_or(0.0);let innate=soul.innate.get(attr).copied().unwrap_or(0.0);let set=share.get(attr).copied().unwrap_or(0.0);let average=max[attr]*plan.average_ratio;let points=(sub+innate+set)/average*weight;score+=points;rows.push(json!({"attribute":attr,"level":level,"sub":sub,"innate":innate,"setShare":set,"average":average,"weight":weight,"points":points}));}
 let mut forecast=score;let mut available=soul.sub.keys().cloned().collect::<Vec<_>>();let mut nodes=5-soul.level/3;
 while available.len()<4&&nodes>0{let next=ATTRS.iter().filter(|k|**k!=soul.main&&!available.iter().any(|a|a==**k)).max_by(|a,b|{let weight=|key:&&&str|levels.get(**key).filter(|l|**l>0).map(|l|plan.weights[usize::from(*l-1)]).unwrap_or(0.0);weight(a).total_cmp(&weight(b))}).unwrap();let level=levels.get(*next).copied().unwrap_or(0);if level>0{forecast+=plan.weights[usize::from(level-1)];}available.push((*next).into());nodes-=1;}
 let best=available.iter().filter_map(|a|levels.get(a)).filter(|l|**l>0).map(|l|plan.weights[usize::from(*l-1)]).fold(0.0,f64::max);forecast+=f64::from(nodes)*best;
 json!({"current":score,"forecast":forecast,"remaining":5-soul.level/3,"contributions":rows})
}
pub fn preview(doc:&Document,input:&Value)->Result<Value,String>{
 let plan:Plan=if input["plan"].is_null(){default_plan()}else{serde_json::from_value(input["plan"].clone()).map_err(|_|"关联分方案格式无效")?};validate(&plan)?;
 let metric=input["metric"].as_str().unwrap_or("crit_output");if !plan.levels.contains_key(metric){return Err("不支持的关联分指标".into());}
 let base:Stats=serde_json::from_value(input["base"].clone()).map_err(|_|"基础面板格式无效")?;let minimums:Stats=serde_json::from_value(input["minimums"].clone()).map_err(|_|"最低属性格式无效")?;check_stats(&base)?;check_stats(&minimums)?;let levels=effective_levels(&plan,metric,&base,&minimums);
 let context_ids:Vec<String>=serde_json::from_value(input["contextIds"].clone()).map_err(|_|"装备上下文格式无效")?;if context_ids.len()>6{return Err("装备上下文最多六枚御魂".into());}
 let equipped:Vec<_>=doc.souls.iter().filter(|s|context_ids.contains(&s.id)).collect();if equipped.len()!=context_ids.len(){return Err("装备上下文包含不存在或重复御魂".into());}
 if equipped.iter().map(|s|s.slot).collect::<std::collections::BTreeSet<_>>().len()!=equipped.len(){return Err("装备上下文的号位不能重复".into());}
 let include_three=input["includeThree"].as_bool().unwrap_or(false);let mut rows=Vec::new();
 for soul in doc.souls.iter().filter(|s|s.quality==6&&(include_three||s.initial_substats!=Some(3))){
  let count=equipped.iter().filter(|s|s.slot!=soul.slot&&s.set==soul.set).count()+1;
  let share=set_share(soul,count,&doc.sets);
  let mut result=evaluate(soul,&plan,&levels,&share);result["id"]=json!(soul.id);result["slot"]=json!(soul.slot);result["initialKnown"]=json!(soul.initial_substats.is_some());result["innateKnown"]=json!(true);rows.push(result);
 }
 rows.sort_by(|a,b|b["forecast"].as_f64().unwrap().total_cmp(&a["forecast"].as_f64().unwrap()).then_with(||a["id"].as_str().cmp(&b["id"].as_str())));
 Ok(json!({"plan":plan,"metric":metric,"base":base,"minimums":minimums,"levels":levels,"contextIds":context_ids,"includeThree":include_three,"rows":rows,"model":"当前分=Σ[(副属性+固有属性+已激活两件套分摊)÷(六星最大成长×平均比例)×关联权重]；主属性不计分。预测分在剩余节点先补足四条，再将全部强化分给最相关属性，每次使用配置的平均成长；是乐观估算，不是成功概率或实际战斗提升。套装分摊按替换同号位后的实际件数均分，两件套六件时计两次；不含四件套触发或六件套额外机制。三条初始默认排除，未知初始条数仍保留并标明。"}))
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn levels_promote_at_exact_threshold_without_downgrade(){let p=default_plan();let base=Stats::from([("speed".into(),100.0)]);assert_eq!(effective_levels(&p,"crit_output",&base,&Stats::from([("speed".into(),119.99)] )).get("speed"),None);assert_eq!(effective_levels(&p,"crit_output",&base,&Stats::from([("speed".into(),120.0)]))["speed"],2);assert_eq!(effective_levels(&p,"crit_output",&base,&Stats::from([("speed".into(),125.0)]))["speed"],1);assert_eq!(effective_levels(&p,"speed",&base,&Stats::from([("speed".into(),120.0)]))["speed"],1);}
 #[test]fn score_excludes_main_and_projects_only_remaining_nodes(){let p=default_plan();let soul=Soul{id:"s".into(),set:"set".into(),slot:2,quality:6,level:0,main:"crit".into(),value:55.0,sub:Stats::from([("crit".into(),2.7),("attack_pct".into(),2.7),("hp".into(),100.0),("defense".into(),5.0)]),..Soul::default()};let levels=effective_levels(&p,"crit_output",&Stats::new(),&Stats::new());let r=evaluate(&soul,&p,&levels,&Stats::new());assert!((r["current"].as_f64().unwrap()-6.0).abs()<1e-9);assert!((r["forecast"].as_f64().unwrap()-26.0).abs()<1e-9);let mut full=soul;full.level=15;let r=evaluate(&full,&p,&levels,&Stats::new());assert_eq!(r["current"],r["forecast"]);}
 #[test]fn invalid_plan_rejected(){let mut p=default_plan();assert!(validate(&p).is_ok());p.thresholds.get_mut("speed").unwrap()[0]=26.0;assert!(validate(&p).is_err());p=default_plan();p.levels.get_mut("speed").unwrap().insert("speed".into(),4);assert!(validate(&p).is_err());}
 #[test]fn fourth_attribute_cannot_duplicate_main_and_innate_never_grows(){let p=default_plan();let soul=Soul{id:"new".into(),set:"A".into(),slot:6,quality:6,level:12,main:"crit".into(),value:55.0,sub:Stats::from([("hp".into(),100.0),("defense".into(),5.0),("resist".into(),3.0)]),innate:Stats::from([("crit".into(),2.7)]),..Soul::default()};let levels=BTreeMap::from([("crit".into(),1)]);let r=evaluate(&soul,&p,&levels,&Stats::new());assert!((r["current"].as_f64().unwrap()-4.0).abs()<1e-9);assert_eq!(r["current"],r["forecast"]);}
 #[test]fn replacement_context_activates_and_divides_only_real_set_pieces(){let p=default_plan();let mut doc=Document{sets:vec![SetDef{name:"A".into(),two_piece:Stats::from([("crit".into(),15.0)]),..SetDef::default()}],..Document::default()};doc.souls=(1..=6).map(|slot|Soul{id:format!("s{slot}"),set:"A".into(),slot,quality:6,level:15,initial_substats:Some(4),..Soul::default()}).collect();let mut input=json!({"plan":p,"metric":"crit","base":{},"minimums":{},"contextIds":[]});let no_context=preview(&doc,&input).unwrap();assert_eq!(no_context["rows"][0]["current"],0.0);input["contextIds"]=json!(["s1","s2"]);let pair=preview(&doc,&input).unwrap();let r=pair["rows"].as_array().unwrap().iter().find(|r|r["id"]=="s1").unwrap();assert!((r["contributions"][0]["setShare"].as_f64().unwrap()-7.5).abs()<1e-9);let all:Vec<_>=doc.souls.iter().collect();assert!((combination_score(&all,&doc.sets,&p,"crit",&Stats::new(),&Stats::new())-30.0/2.7*4.0).abs()<1e-9);input["contextIds"]=json!(["s1","s1"]);assert!(preview(&doc,&input).is_err());input["contextIds"]=json!(["missing"]);assert!(preview(&doc,&input).is_err());}
 #[test]fn unknown_initial_is_retained_and_plan_is_captured(){let mut doc=Document::default();doc.souls=(1..=3).map(|n|Soul{id:n.to_string(),quality:6,level:0,slot:n,initial_substats:if n==1{Some(3)}else if n==2{Some(4)}else{None},..Soul::default()}).collect();let mut input=json!({"metric":"crit","base":{},"minimums":{},"contextIds":[]});let r=preview(&doc,&input).unwrap();assert_eq!(r["rows"].as_array().unwrap().len(),2);assert_eq!(r["plan"]["weights"],json!([4.0,2.0,1.0]));assert_eq!(r["rows"].as_array().unwrap().iter().find(|r|r["id"]=="3").unwrap()["initialKnown"],false);input["includeThree"]=json!(true);assert_eq!(preview(&doc,&input).unwrap()["rows"].as_array().unwrap().len(),3);}
}

