use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type Stats = BTreeMap<String, f64>;
pub const ATTRS: [&str; 11] = ["attack", "attack_pct", "hp", "hp_pct", "defense", "defense_pct", "speed", "crit", "crit_damage", "hit", "resist"];

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Soul {
    pub id: String,
    pub set: String,
    pub slot: u8,
    pub quality: u8,
    pub level: u8,
    pub main: String,
    pub value: f64,
    pub sub: Stats,
    pub innate: Stats,
    pub locked: bool,
    pub equipped: String,
    pub initial_substats: Option<u8>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Hero {
    pub id: String,
    pub name: String,
    pub rarity: String,
    pub level: u8,
    pub star: u8,
    pub awakened: bool,
    pub shards: u32,
    pub base: Stats,
    pub bonus: Stats,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Resource { pub name: String, pub amount: f64, pub unit: String }

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Task { pub id: String, pub name: String, pub done: bool, pub category: String, pub period:String }

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct GuildMember { pub id: String, pub name: String, pub level: u16, pub contribution: f64, pub note: String }

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDef {
    pub name: String,
    pub two_piece: Stats,
    pub six_piece: Stats,
}

impl<'de> Deserialize<'de> for SetDef {
    fn deserialize<D:serde::Deserializer<'de>>(deserializer:D)->Result<Self,D::Error>{
        #[derive(Default,Deserialize)]
        #[serde(rename_all="camelCase",default)]
        struct StoredSet {name:String,two_piece:Stats,six_piece:Option<Stats>}
        let stored=StoredSet::deserialize(deserializer)?;
        // Old archives lack this field. Explicit empty/custom values are retained.
        let six_piece=stored.six_piece.unwrap_or_else(||crate::game_convert::bundled_set_definitions().iter().find(|s|s.name==stored.name).map(|s|s.six_piece.clone()).unwrap_or_default());
        Ok(Self{name:stored.name,two_piece:stored.two_piece,six_piece})
    }
}

#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(default)]
pub struct ShardRecord{pub id:String,pub name:String,pub quantity:u32,pub normal:Option<u32>,pub bound:Option<u32>,pub contracts:Option<u32>,pub target:Option<u32>}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Document {
    pub name: String,
    pub souls: Vec<Soul>,
    pub heroes: Vec<Hero>,
    pub resources: Vec<Resource>,
    pub tasks: Vec<Task>,
    pub guild: Vec<GuildMember>,
    pub sets: Vec<SetDef>,
    pub shards: Vec<ShardRecord>,
    pub extras: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String, pub name: String, pub weights: Stats, pub keep: f64, pub observe: f64,
    #[serde(default)] pub model: Option<String>,
    #[serde(default)] pub description: String,
    #[serde(default)] pub cards: Vec<RuleCard>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleCard {
    pub id: String, pub name: String, pub enabled: bool, pub sets: Vec<String>, pub slots: Vec<u8>,
    pub mains: BTreeMap<String, Vec<String>>, pub initial: Vec<u8>, pub core: Vec<String>, pub normal: Vec<String>,
    pub scene: String, pub core_base: f64, pub normal_base: f64, pub core_upgrade: f64, pub normal_upgrade: f64,
    pub keep: f64, pub observe: f64,
}
pub fn validate_rule(rule: &Rule) -> Result<(), String> {
    check_stats(&rule.weights)?;
    if rule.id.is_empty() || rule.name.trim().is_empty() || rule.name.chars().count() > 100 || !rule.keep.is_finite() || !rule.observe.is_finite() || rule.observe < 0.0 || rule.keep < rule.observe { return Err("规则名称不能为空，保留阈值应不低于观察阈值，且阈值不能为负数".into()); }
    if rule.model.as_deref().is_some_and(|v| v != "conditions" && v != "weighted") { return Err("不支持的评分方式".into()); }
    if rule.cards.len() > 200 { return Err("每份标准最多包含 200 条规则".into()); }
    let mut ids = std::collections::HashSet::new();
    for c in &rule.cards {
        if c.id.is_empty() || !ids.insert(&c.id) || c.name.trim().is_empty() || c.slots.iter().any(|n| !(1..=6).contains(n)) || c.initial.iter().any(|n| !(2..=4).contains(n)) || !["all", "pve", "pvp"].contains(&c.scene.as_str()) { return Err("规则编号、名称或条件不合法".into()); }
        if c.core.iter().chain(&c.normal).any(|k| !ATTRS.contains(&k.as_str())) || c.core.iter().any(|k| c.normal.contains(k)) || c.mains.iter().any(|(slot, keys)| !["1", "2", "3", "4", "5", "6"].contains(&slot.as_str()) || keys.iter().any(|k| !ATTRS.contains(&k.as_str()))) { return Err("核心与一般属性不能重复，属性条件需要有效名称".into()); }
        if [c.core_base,c.normal_base,c.core_upgrade,c.normal_upgrade,c.keep,c.observe].iter().any(|v| !v.is_finite() || !(0.0..=100.0).contains(v)) || c.keep < c.observe { return Err("计分与阈值需为 0–100，且保留不低于观察".into()); }
    }
    Ok(())
}

pub fn default_rule() -> Rule {
    Rule { id: "default".into(), name: "通用副属性参考".into(), keep: 18.0, observe: 12.0, model: None, description: String::new(), cards: Vec::new(),
        weights: [("speed", 2.0), ("crit", 1.8), ("crit_damage", 1.4), ("attack_pct", 1.2), ("hp_pct", 0.6), ("defense_pct", 0.4), ("hit", 0.8), ("resist", 0.8), ("attack", 0.2), ("hp", 0.2), ("defense", 0.2)].into_iter().map(|(k,v)|(k.into(),v)).collect() }
}

pub fn roll_size(attr: &str) -> f64 {
    match attr { "speed" | "crit" | "attack_pct" | "hp_pct" | "defense_pct" => 2.7, "crit_damage" | "hit" | "resist" => 3.6, "attack" => 24.3, "hp" => 102.6, "defense" => 4.5, _ => 1.0 }
}

pub fn validate(doc: &Document) -> Result<(), String> {
    if doc.name.trim().is_empty() || doc.name.chars().count() > 100 { return Err("档案名称需要 1–100 个字符".into()); }
    if doc.souls.len() > 50_000 || doc.heroes.len() > 20_000 || doc.resources.len() > 10_000 || doc.tasks.len() > 10_000 || doc.guild.len() > 10_000 { return Err("导入记录过多，请拆分文件".into()); }
    let mut ids = std::collections::HashSet::new();
    for s in &doc.souls {
        if s.id.is_empty() || !ids.insert(s.id.as_str()) { return Err(format!("御魂 ID 为空或重复：{}", s.id)); }
        if !(1..=6).contains(&s.slot) || !(1..=6).contains(&s.quality) || s.level > 15 { return Err(format!("御魂 {} 的号位、星级或等级不合法", s.id)); }
        if s.set.trim().is_empty() || !ATTRS.contains(&s.main.as_str()) || !s.value.is_finite() || s.value < 0.0 { return Err(format!("御魂 {} 的套装或主属性不合法", s.id)); }
        check_stats(&s.sub)?;
        check_stats(&s.innate)?;
        if s.sub.len() > 4 { return Err(format!("御魂 {} 的副属性超过四条", s.id)); }
    }
    ids.clear();
    for h in &doc.heroes {
        if h.id.is_empty() || h.name.trim().is_empty() || !ids.insert(h.id.as_str()) || h.star > 6 || h.level > 60 { return Err("式神 ID、名称或培养数据不合法".into()); }
        check_stats(&h.base)?;
        check_stats(&h.bonus)?;
    }
    for r in &doc.resources { if r.name.trim().is_empty() || !r.amount.is_finite() || r.amount < 0.0 { return Err("资源名称和数量不合法".into()); } }
    ids.clear();
    for t in &doc.tasks { if t.id.is_empty() || !ids.insert(t.id.as_str()) || t.name.trim().is_empty() { return Err("任务 ID 重复、为空或缺少名称".into()); } }
    ids.clear();
    for g in &doc.guild { if g.id.is_empty() || !ids.insert(g.id.as_str()) || g.name.trim().is_empty() || !g.contribution.is_finite() || g.contribution < 0.0 { return Err("寮成员 ID、名称或贡献值不合法".into()); } }
    for s in &doc.sets { check_stats(&s.two_piece)?; check_stats(&s.six_piece)?; }
    Ok(())
}

pub fn check_stats(stats: &Stats) -> Result<(), String> {
    for (k, v) in stats { if !ATTRS.contains(&k.as_str()) || !v.is_finite() || *v < 0.0 || *v > 1e9 { return Err(format!("无效属性：{k}，数值必须是非负有限数")); } }
    Ok(())
}
