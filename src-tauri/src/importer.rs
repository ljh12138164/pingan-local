use crate::model::*;
use serde_json::Value;
pub fn parse(text:&str,fallback:&str)->Result<Document,String>{
    if text.len()>64*1024*1024{return Err("文件超过 64 MB".into());}
    let v:Value=serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e|format!("JSON 格式不正确：{e}"))?;
    let body=if v.get("schema").is_some(){if v["schema"]!="pingan-local/1"{return Err("不支持该文件格式版本".into());}&v["data"]}else if ["souls","heroes","resources","tasks","guild"].iter().any(|k|v.get(k).is_some()){&v}else{return Err("未识别的数据结构，请使用本应用 JSON 模板或直接读取游戏".into());};
    let mut doc:Document=serde_json::from_value(body.clone()).map_err(|e|format!("字段不符合导入模板：{e}"))?;
    if doc.name.trim().is_empty(){doc.name=fallback.to_string();}
    validate(&doc)?;Ok(doc)
}
