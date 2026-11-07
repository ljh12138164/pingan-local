//! NetEase's public product data, independent of the reference application.
use crate::{model::*,game_convert};
use serde_json::{json,Value};
use std::{collections::BTreeMap,io::Read,sync::OnceLock};
type Result<T> = std::result::Result<T,String>;
pub fn identity(link:&str)->Result<(String,String)>{
    let u=reqwest::Url::parse(link.trim()).map_err(|_|"请输入完整的阴阳师藏宝阁商品链接")?;
    if u.scheme()!="https"||u.host_str()!=Some("yys.cbg.163.com")||!u.username().is_empty()||u.password().is_some()||u.port().is_some(){return Err("仅支持网易阴阳师藏宝阁的 HTTPS 商品链接".into());}
    let segments:Vec<_>=u.path_segments().into_iter().flatten().collect();
    let from_path=segments.iter().position(|s|*s=="equip").and_then(|i|Some((segments.get(i+1)?.to_string(),segments.get(i+2)?.to_string())));
    let query:BTreeMap<_,_>=u.query_pairs().map(|(k,v)|(k.into_owned(),v.into_owned())).collect();
    let(server,sn)=from_path.or_else(||Some((query.get("serverid")?.clone(),query.get("ordersn").or_else(||query.get("game_ordersn"))?.clone()))).ok_or("链接缺少服务器与商品编号")?;
    if server.parse::<u32>().ok().filter(|s|*s>0).is_none()||sn.is_empty()||sn.len()>120||!sn.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'_'){return Err("商品链接中的服务器或商品编号无效".into());}
    Ok((server,sn))
}
pub fn fetch(link:&str)->Result<(Document,Vec<String>)>{
    let(server,sn)=identity(link)?;
    let client=reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let response=client.get("https://yys.cbg.163.com/cgi/api/get_equip_detail").query(&[("serverid",server),("ordersn",sn)]).send().map_err(|e|format!("藏宝阁连接失败：{e}"))?.error_for_status().map_err(|e|format!("藏宝阁返回错误：{e}"))?;
    let mut bytes=vec![];response.take(16*1024*1024+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;if bytes.len()>16*1024*1024{return Err("商品数据超过 16 MB".into());}
    let body:Value=serde_json::from_slice(&bytes).map_err(|_|"藏宝阁返回了非 JSON 内容，可能需要在官网完成验证后重试")?;
    convert(&body)
}
fn templates()->&'static Value{static DATA:OnceLock<Value>=OnceLock::new();DATA.get_or_init(||serde_json::from_str(include_str!("../data/hero-stats.json")).expect("bundled hero facts"))}
fn equipment()->&'static Value{static DATA:OnceLock<Value>=OnceLock::new();DATA.get_or_init(||serde_json::from_str(include_str!("../data/equipment.json")).expect("bundled equipment facts"))}
fn numeric(v:&Value)->Option<f64>{v.as_f64().or_else(||v.as_str()?.trim_end_matches('%').parse().ok())}
pub fn convert(body:&Value)->Result<(Document,Vec<String>)>{
    if body["status"].as_i64()!=Some(1){return Err(body["msg"].as_str().unwrap_or("商品不存在、已不可查看，或接口需要验证").into());}
    let equip=&body["equip"];let desc:Value=match &equip["equip_desc"]{Value::String(s)=>serde_json::from_str(s).map_err(|_|"商品详情 JSON 无效")?,Value::Object(_)=>equip["equip_desc"].clone(),_=>return Err("该商品缺少可解析的角色详情".into())};
    let mut doc=Document{name:format!("藏宝阁 · {}",desc["name"].as_str().unwrap_or("公开商品")),..Document::default()};
    let mut warnings=vec!["这是商品上架时的公开快照，不代表当前实时库存；价格和交易不参与本地导入。".into()];
    let mut rounded=0;let mut owners=BTreeMap::new();let mut details=BTreeMap::new();let mut onmyoji=vec![];
    for(id,h)in desc["heroes"].as_object().ok_or("商品式神库存格式不受支持")?{
        if h["heroId"].as_u64().is_some_and(|id|id<200){onmyoji.push(json!({"name":h["name"],"level":h["level"],"attrs":h["attrs"]}));continue;}
        let level=h["level"].as_u64().unwrap_or(0).min(255) as u8;let star=h["star"].as_u64().unwrap_or(0).min(255) as u8;let awake=h["awake"].as_u64().unwrap_or(0)!=0;
        let template=h["heroId"].to_string();let(base,bonus)=game_convert::hero_stats(&templates()[&template],level,star,awake,&Value::Null);let mut base=base;
        for(raw,attr)in [("攻击","attack"),("生命","hp"),("防御","defense"),("速度","speed"),("暴击","crit")]{if let Some(v)=numeric(&h["attrs"][raw]["val"]){if base.get(attr).is_none_or(|actual|(actual-v).abs()>1.01){base.insert(attr.into(),v);rounded+=1;}}}
        if let Some(equips)=h["equips"].as_array(){for eid in equips{if let Some(eid)=eid.as_str(){if owners.insert(eid.to_owned(),id.clone()).is_some(){return Err("商品中同一枚御魂出现多个装备归属".into());}}}}
        details.insert(id.clone(),json!({"templateId":h["heroId"],"skills":h["skinfo"],"locked":h["lock"]}));
        doc.heroes.push(Hero{id:id.clone(),name:h["name"].as_str().unwrap_or("未知式神").into(),rarity:match h["rarity"].as_u64(){Some(1)=>"N",Some(2)=>"R",Some(3)=>"SR",Some(4)=>"SSR",Some(5)=>"SP",Some(6)=>"UR",_=>"MATERIAL"}.into(),level,star,awakened:awake,base,bonus,..Hero::default()});
    }
    for(id,soul)in desc["inventory"].as_object().ok_or("商品御魂库存格式不受支持")?{
        let mut soul=soul.clone();if let Some(pair)=soul["single_attr"].as_array(){let kind=match pair.first().and_then(Value::as_str){Some("攻击加成")=>1,Some("生命加成")=>2,Some("防御加成")=>3,Some("暴击")=>4,Some("效果命中")=>5,Some("效果抵抗")=>6,_=>return Err("商品包含尚未适配的首领御魂独有属性".into())};soul["single_attr"]=json!(kind);}
        let mut row=game_convert::soul(id,&soul,equipment()).map_err(|e|format!("商品御魂 {id}：{e}"))?;row.equipped=owners.get(id).cloned().unwrap_or_default();doc.souls.push(row);
    }
    doc.sets=equipment()["equip_suit"].as_object().into_iter().flat_map(|sets|sets.values()).filter_map(game_convert::set_definition).collect();
    let mut fragments:BTreeMap<String,ShardRecord>=BTreeMap::new();
    for row in desc["hero_fragment"].as_object().into_iter().flatten().map(|(_,v)|v){let id=row["hero_id"].to_string();let entry=fragments.entry(id.clone()).or_insert_with(||ShardRecord{id,name:row["name"].as_str().unwrap_or("未知式神").into(),quantity:0,..ShardRecord::default()});entry.quantity=entry.quantity.saturating_add(row["num"].as_u64().unwrap_or(0).min(u32::MAX as u64) as u32);}
    doc.shards=fragments.into_values().collect();
    for(key,name,unit)in [("money","金币","枚"),("goyu","勾玉","枚"),("strength","体力","点"),("soul_jade","御札","枚"),("hunyu","魂玉","枚"),("gameble_card","神秘符咒","张"),("ar_gamble_card","现世符咒","张"),("redheart","友情点","点"),("medal","勋章","枚")]{if let Some(amount)=numeric(&desc[key]){doc.resources.push(Resource{name:name.into(),amount,unit:unit.into()});}}
    // Historical products can use older character stats. Recover only an
    // explicitly displayed total, retaining the site's rounding uncertainty.
    for hero in &mut doc.heroes{
        let equipped:Vec<_>=doc.souls.iter().filter(|s|s.equipped==hero.id).collect();let p=crate::engine::panel_with_bonus(&equipped,&hero.base,&hero.bonus,&doc.sets);
        for(raw,a)in [("暴击伤害","crit_damage"),("效果命中","hit"),("效果抵抗","resist")]{if let Some(display)=numeric(&desc["heroes"][&hero.id]["attrs"][raw]["val"]){if (p[a]-display).abs()>1.01{let gear=p[a]-hero.base.get(a).copied().unwrap_or(0.0);hero.base.insert(a.into(),(display-gear).max(0.0));rounded+=1;}}}
    }
    if rounded>0{warnings.push(format!("{rounded} 项式神基础属性采用官网显示值或从公开总值扣除装备加成，可能受取整影响；其他基础属性使用已校准的成长参数。"));}
    doc.extras=json!({"heroDetails":details,"onmyoji":onmyoji,"cbg":{"serverId":equip["serverid"],"ordersn":equip["game_ordersn"],"sourceTime":desc["olt"],"fetchedAt":chrono::Utc::now().to_rfc3339()}});
    validate(&doc)?;Ok((doc,warnings))
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn links_cannot_redirect_to_arbitrary_hosts(){assert!(identity("https://example.com/cgi/mweb/equip/21/test").is_err());assert!(identity("https://yys.cbg.163.com.evil.test/cgi/mweb/equip/21/test").is_err());assert_eq!(identity("https://yys.cbg.163.com/cgi/mweb/equip/21/2021-abc?view_loc=test").unwrap(),("21".into(),"2021-abc".into()));}
    #[test]#[ignore="requires an explicit public fixture"]fn public_product(){
        let path=std::env::var("PINGAN_CBG_FIXTURE").unwrap();let body:Value=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();let(doc,warnings)=convert(&body).unwrap();let raw:Value=serde_json::from_str(body["equip"]["equip_desc"].as_str().unwrap()).unwrap();assert_eq!(doc.souls.len(),raw["inventory"].as_object().unwrap().len());
        let names:BTreeMap<_,_>=[("生命","hp"),("防御","defense"),("攻击","attack"),("生命加成","hp_pct"),("防御加成","defense_pct"),("攻击加成","attack_pct"),("速度","speed"),("暴击","crit"),("暴击伤害","crit_damage"),("效果命中","hit"),("效果抵抗","resist")].into();
        let mut soul_differences=vec![];for soul in &doc.souls{for(i,row)in raw["inventory"][&soul.id]["attrs"].as_array().unwrap().iter().enumerate(){let a=names[row[0].as_str().unwrap()];let v=numeric(&row[1]).unwrap();let actual=if i==0{soul.value}else{soul.sub.get(a).copied().unwrap_or(0.0)};if (actual-v).abs()>1.01{soul_differences.push(json!({"attr":a,"actual":actual,"display":v}));}}}
        let mut panel_differences=vec![];let mut comparable=0;
        for hero in &doc.heroes{if ["attack","hp","defense","speed","crit","crit_damage"].iter().any(|k|!hero.base.contains_key(*k)){continue;}
            comparable+=1;let equipped:Vec<_>=doc.souls.iter().filter(|s|s.equipped==hero.id).collect();let panel=crate::engine::panel_with_bonus(&equipped,&hero.base,&hero.bonus,&doc.sets);
            for(raw_name,a)in [("攻击","attack"),("生命","hp"),("防御","defense"),("速度","speed"),("暴击","crit"),("暴击伤害","crit_damage"),("效果命中","hit"),("效果抵抗","resist")]{let field=&raw["heroes"][&hero.id]["attrs"][raw_name];if let Some(mut expected)=numeric(&field["val"]){expected+=numeric(&field["add_val"]).unwrap_or(0.0);if (panel[a]-expected).abs()>2.01{panel_differences.push(json!({"template":raw["heroes"][&hero.id]["heroId"],"attr":a,"actual":panel[a],"display":expected}));}}}
        }
        println!("Public product: {} souls, {} heroes, {} fragments, {} notices; soul display differences {}, {} comparable panels, panel differences {}; samples {}",doc.souls.len(),doc.heroes.len(),doc.shards.len(),warnings.len(),soul_differences.len(),comparable,panel_differences.len(),serde_json::to_string(&panel_differences.iter().take(10).collect::<Vec<_>>()).unwrap());
        assert!(soul_differences.is_empty(),"{:?}",soul_differences.iter().take(5).collect::<Vec<_>>());assert!(panel_differences.is_empty(),"{:?}",panel_differences);
        if let Ok(path)=std::env::var("PINGAN_CBG_REPORT"){std::fs::write(path,json!({"souls":doc.souls.len(),"heroes":doc.heroes.len(),"comparablePanels":comparable,"soulDifferences":soul_differences,"panelDifferences":panel_differences}).to_string()).unwrap();}
    }
}
