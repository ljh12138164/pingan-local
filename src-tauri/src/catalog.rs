use crate::model::*;
use serde::Deserialize;
#[derive(Clone,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CatalogSet { pub id:String, pub name:String, pub two_piece:Stats }
#[derive(Deserialize)]
pub struct Catalog { pub sets:Vec<CatalogSet>, pub heroes:Vec<Hero> }
pub fn builtin()->Catalog{
    let mut catalog:Catalog=serde_json::from_str(include_str!("../data/catalog.json")).expect("内置事实目录格式错误");
    let templates:serde_json::Value=serde_json::from_str(include_str!("../data/hero-stats.json")).expect("内置基础属性格式错误");
    for hero in &mut catalog.heroes{let(base,bonus)=crate::game_convert::hero_stats(&templates[&hero.id],40,6,true,&serde_json::Value::Null);hero.base=base;hero.bonus=bonus;}
    catalog
}
