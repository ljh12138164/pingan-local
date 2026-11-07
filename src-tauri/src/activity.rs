use rusqlite::{params, Connection};
use serde_json::{json, Value};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
pub fn setup(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS activity(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));").map_err(err)
}
fn kind(input: &Value) -> Result<&str> {
    match input["kind"].as_str() { Some(k @ ("task" | "notice")) => Ok(k), _ => Err("记录分类无效".into()) }
}
pub fn execute(db: &mut Connection, operation: &str, input: &Value) -> Result<Value> {
    match operation {
        "activity_list" => {
            let mut q = db.prepare("SELECT kind,data FROM activity ORDER BY rowid DESC").map_err(err)?;
            let rows = q.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(err)?;
            let (mut tasks, mut notices) = (vec![], vec![]);
            for row in rows { let (kind, data) = row.map_err(err)?; let value: Value = serde_json::from_str(&data).map_err(err)?; if kind == "task" { tasks.push(value); } else { notices.push(value); } }
            Ok(json!({"tasks":tasks,"notices":notices}))
        }
        "activity_put" => {
            let kind = kind(input)?; let record = &input["record"];
            let id = record["id"].as_str().filter(|s| !s.is_empty() && s.len() <= 100).ok_or("记录编号无效")?;
            for key in ["title", "createdAt"] { if record[key].as_str().filter(|s| !s.is_empty() && s.len() <= 200).is_none() { return Err(format!("记录字段 {key} 无效")); } }
            if kind == "task" && !matches!(record["status"].as_str(), Some("done" | "failed")) { return Err("仅保存已结束的后台任务".into()); }
            if kind == "notice" && !matches!(record["category"].as_str(), Some("error" | "reminder")) { return Err("通知分类无效".into()); }
            let text = record.to_string(); if text.len() > 2_200_000 { return Err("记录超过本地日志大小限制".into()); }
            let tx = db.transaction().map_err(err)?;
            tx.execute("INSERT INTO activity VALUES(?1,?2,?3) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data", params![kind,id,text]).map_err(err)?;
            tx.execute("DELETE FROM activity WHERE kind=?1 AND id NOT IN (SELECT id FROM activity WHERE kind=?1 ORDER BY rowid DESC LIMIT ?2)", params![kind,if kind == "task" {50} else {100}]).map_err(err)?;
            tx.commit().map_err(err)?; Ok(json!(true))
        }
        "activity_update" => {
            let kind = kind(input)?; let ids = input["ids"].as_array().filter(|a| a.len() <= 100).ok_or("记录编号列表无效")?;
            let tx = db.transaction().map_err(err)?;
            for id in ids { let id = id.as_str().ok_or("记录编号无效")?;
                let text: Option<String> = tx.query_row("SELECT data FROM activity WHERE kind=?1 AND id=?2", params![kind,id], |r| r.get(0)).optional().map_err(err)?;
                if let Some(text) = text { let mut record: Value = serde_json::from_str(&text).map_err(err)?;
                    for key in ["read", "hidden"] { if let Some(value) = input[key].as_bool() { record[key] = json!(value); } }
                    tx.execute("UPDATE activity SET data=?1 WHERE kind=?2 AND id=?3", params![record.to_string(),kind,id]).map_err(err)?;
                }
            }
            tx.commit().map_err(err)?; Ok(json!(true))
        }
        _ => Err("未知任务中心操作".into()),
    }
}
use rusqlite::OptionalExtension;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn journal_retains_bounded_results_and_reversible_notices() {
        let mut db = Connection::open_in_memory().unwrap(); setup(&db).unwrap();
        for n in 0..55 { execute(&mut db,"activity_put",&json!({"kind":"task","record":{"id":format!("t{n}"),"title":"计算","createdAt":"2026-10-28","status":"done","result":{"ids":["000123"],"speed":17.999999}}})).unwrap(); }
        let rows=execute(&mut db,"activity_list",&json!({})).unwrap(); assert_eq!(rows["tasks"].as_array().unwrap().len(),50); assert_eq!(rows["tasks"][0]["result"]["speed"],17.999999);
        let notice=json!({"kind":"notice","record":{"id":"n1","title":"到期","createdAt":"2026-10-28","category":"reminder","read":false,"hidden":false}});
        execute(&mut db,"activity_put",&notice).unwrap();
        execute(&mut db,"activity_update",&json!({"kind":"notice","ids":["n1"],"read":true,"hidden":true})).unwrap();
        assert_eq!(execute(&mut db,"activity_list",&json!({})).unwrap()["notices"][0]["hidden"],true);
        execute(&mut db,"activity_update",&json!({"kind":"notice","ids":["n1"],"hidden":false})).unwrap();
        let restored=execute(&mut db,"activity_list",&json!({})).unwrap(); assert_eq!(restored["notices"][0]["hidden"],false); assert_eq!(restored["notices"][0]["read"],true);
        assert!(execute(&mut db,"activity_put",&json!({"kind":"task","record":{"id":"x","title":"x","createdAt":"x","status":"running"}})).is_err());
        assert!(execute(&mut db,"activity_put",&json!({"kind":"other"})).is_err());
    }
}
