type Result<T> = std::result::Result<T, String>;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;

pub const SOURCE: &str = "https://yys-guide.online/teams";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub name: String,
    #[serde(default)] pub template_id: String,
    #[serde(default)] pub soul: String,
    #[serde(default)] pub stats: String,
    #[serde(default)] pub skill_note: String,
    #[serde(default)] pub star: u8,
    #[serde(default)] pub level: u8,
    #[serde(default)] pub skills: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lineup {
    pub id: String,
    pub name: String,
    pub scene: String,
    pub dungeon: String,
    #[serde(default)] pub author: String,
    #[serde(default)] pub source_url: String,
    #[serde(default)] pub notes: String,
    #[serde(default)] pub code: String,
    #[serde(default)] pub members: Vec<Member>,
}

pub fn validate(team: &Lineup) -> Result<()> {
    if team.id.is_empty() || team.id.len() > 150 || team.name.trim().is_empty() || team.name.chars().count() > 120 {
        return Err("请填写阵容名称（最多 120 字）".into());
    }
    if !matches!(team.scene.as_str(), "pve" | "pvp") || team.members.is_empty() || team.members.len() > 6 {
        return Err("阵容需要选择 PVE / PVP，并填写 1–6 位式神".into());
    }
    if team.dungeon.chars().count() > 120 || team.author.chars().count() > 120 || team.notes.len() > 30000 || team.code.len() > 30000 || team.source_url.len() > 2000 {
        return Err("阵容资料过长，请缩短后保存".into());
    }
    if !team.source_url.is_empty() {
        let url = reqwest::Url::parse(&team.source_url).map_err(|_| "来源链接应为完整的 HTTP / HTTPS 链接")?;
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
            return Err("来源链接应为完整的 HTTP / HTTPS 链接".into());
        }
    }
    for member in &team.members {
        if member.name.trim().is_empty() || member.name.chars().count() > 100 || member.template_id.len() > 100 || member.soul.chars().count() > 200 || member.stats.chars().count() > 500 || member.skill_note.chars().count() > 500 || member.star > 6 || member.level > 40 || member.skills.len() > 3 || member.skills.iter().any(|x| *x > 5) {
            return Err("成员名称不能为空；星级 0–6、等级 0–40、三项技能 0–5（0 表示不限制）".into());
        }
    }
    Ok(())
}

fn text(value: &Value, key: &str) -> String { value[key].as_str().unwrap_or("").trim().to_string() }

// Public catalogue is fetched only on request. It has no account or original-app dependency.
pub fn parse_public(value: Value) -> Result<Vec<Lineup>> {
    let rows = value.as_array().ok_or("公开阵容接口格式已变化，保留本机资料，请稍后重试")?;
    if rows.is_empty() || rows.len() > 2000 { return Err("公开阵容接口数量异常，保留本机资料".into()); }
    let mut teams = Vec::with_capacity(rows.len());
    let mut ids = std::collections::HashSet::new();
    for row in rows {
        let id = format!("public:{}", text(row, "id"));
        if id == "public:" || !ids.insert(id.clone()) { return Err("公开阵容存在缺失或重复编号，保留本机资料".into()); }
        let members = row["members"].as_array().ok_or("公开阵容成员格式已变化")?.iter().map(|m| Member {
            name: text(m, "shikigami_name"), template_id: text(m, "shikigami_id"),
            soul: [text(m,"soul4_name"), text(m,"soul2_name")].into_iter().filter(|s|!s.is_empty()).collect::<Vec<_>>().join(" + "),
            stats: [text(m,"attrs"), text(m,"stats"), text(m,"metric"), text(m,"limit")].into_iter().filter(|s|!s.is_empty()).collect::<Vec<_>>().join(" · "),
            skill_note: text(m,"skill"), ..Member::default()
        }).collect();
        // Notes stay plain text. Never render third-party HTML or evaluate imported codes.
        let desc = text(row,"desc");
        let notes = serde_json::from_str::<Vec<Value>>(&desc).ok().map(|blocks| blocks.iter().map(|b|format!("{}\n{}",text(b,"title"),text(b,"content"))).collect::<Vec<_>>().join("\n\n")).unwrap_or(desc);
        let team = Lineup { id, name: text(row,"name"), scene: "pve".into(), dungeon: text(row,"dungeon"), author: text(row,"author"), source_url: SOURCE.into(), notes, code: text(row,"qr_text"), members };
        validate(&team)?; teams.push(team);
    }
    Ok(teams)
}

pub fn fetch_public() -> Result<Vec<Lineup>> {
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let response = client.get("https://yys-guide.online/api/teams").send().map_err(|_|"无法连接公开阵容资料站；已有本机资料仍可使用")?.error_for_status().map_err(|_|"公开阵容资料站暂时不可用；已有本机资料仍可使用")?;
    let mut bytes=Vec::new(); response.take(8_000_001).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len()>8_000_000 { return Err("公开阵容资料超过大小限制，保留本机资料".into()); }
    parse_public(serde_json::from_slice(&bytes).map_err(|_|"公开阵容接口返回了无效数据，保留本机资料")?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn public_catalogue_is_validated_before_replacing_cache() {
        let row=json!({"id":"team1","name":"测试","dungeon":"魂土","members":[{"shikigami_name":"山兔","shikigami_id":"205"}],"desc":"[{\"title\":\"配速\",\"content\":\"先行动\"}]","source_url":"javascript:alert(1)"});
        let teams=parse_public(json!([row.clone()])).unwrap();
        assert_eq!(teams[0].source_url,SOURCE); assert_eq!(teams[0].notes,"配速\n先行动");
        assert!(parse_public(json!([row.clone(),row])).is_err()); assert!(parse_public(json!([])).is_err());
        let mut bad=teams[0].clone(); bad.source_url="javascript:alert(1)".into();assert!(validate(&bad).is_err());
        bad.source_url="https://example.com".into();bad.members[0].skills=vec![6];assert!(validate(&bad).is_err());
    }
}
