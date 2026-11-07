use serde_json::{json,Value};
use std::{fs::{self,OpenOptions},io::Write,path::Path};

pub fn write(input:&Value)->Result<Value,String>{
    let path=Path::new(input["path"].as_str().ok_or("缺少保存路径")?);
    let extension=path.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase();
    if extension!="png"&&extension!="zip"{return Err("仅允许导出 .png 图片或 .zip 图片包".into());}
    let token=input["token"].as_str().filter(|s|s.len()==36&&s.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-')).ok_or("导出标识无效")?;
    let temporary=path.with_file_name(format!(".{}.{}.part",path.file_name().and_then(|v|v.to_str()).ok_or("文件名无效")?,token));
    if input["abort"].as_bool()==Some(true){if temporary.exists(){fs::remove_file(&temporary).map_err(|e|e.to_string())?;}return Ok(json!({"cancelled":true}));}
    let offset=input["offset"].as_u64().ok_or("缺少分块位置")?;
    let total=input["total"].as_u64().filter(|v|*v>0&&*v<=1024*1024*1024).ok_or("图片包应小于1GB")?;
    let bytes:Vec<u8>=serde_json::from_value(input["bytes"].clone()).map_err(|_|"图片字节格式无效")?;
    if bytes.is_empty()||bytes.len()>1024*1024||offset.checked_add(bytes.len() as u64).is_none_or(|v|v>total){return Err("导出分块大小或位置无效".into());}
    let mut file=if offset==0{
        if !(extension=="png"&&bytes.starts_with(b"\x89PNG\r\n\x1a\n")||extension=="zip"&&bytes.starts_with(b"PK\x03\x04")){return Err("图片或图片包格式无效".into());}
        OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?
    }else{
        let file=OpenOptions::new().append(true).open(&temporary).map_err(|e|e.to_string())?;
        if file.metadata().map_err(|e|e.to_string())?.len()!=offset{return Err("导出分块顺序不一致，请重新导出".into());}file
    };
    file.write_all(&bytes).map_err(|e|e.to_string())?;
    let finished=offset+bytes.len() as u64==total;
    if finished{file.sync_all().map_err(|e|e.to_string())?;drop(file);fs::rename(&temporary,path).map_err(|e|e.to_string())?;}
    Ok(json!({"saved":finished,"written":offset+bytes.len() as u64}))
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn chunks_preserve_existing_file_until_complete_and_abort_removes_partial(){
  let path=std::env::temp_dir().join(format!("pingan-image-{}.png",crate::store::id()));let token="12345678-1234-1234-1234-123456789012";
  fs::write(&path,b"old-file").unwrap();let bytes=b"\x89PNG\r\n\x1a\nimage-data";
  let request=|offset:usize,data:&[u8]|json!({"path":path,"token":token,"total":bytes.len(),"offset":offset,"bytes":data});
  assert!(write(&request(0,&[1,2,3])).is_err());assert_eq!(fs::read(&path).unwrap(),b"old-file");
  assert_eq!(write(&request(0,&bytes[..8])).unwrap()["saved"],false);assert_eq!(fs::read(&path).unwrap(),b"old-file");
  assert!(write(&request(9,&bytes[8..])).is_err());assert!(write(&request(0,&bytes[..8])).is_err());
  write(&json!({"path":path,"token":token,"abort":true})).unwrap();assert_eq!(fs::read(&path).unwrap(),b"old-file");
  write(&request(0,&bytes[..8])).unwrap();assert_eq!(write(&request(8,&bytes[8..])).unwrap()["saved"],true);assert_eq!(fs::read(&path).unwrap(),bytes);
  assert!(write(&json!({"path":path.with_extension("exe"),"token":token,"abort":true})).is_err());
  assert!(write(&json!({"path":path,"token":"../bad","abort":true})).is_err());
  let zip=path.with_extension("zip");assert!(write(&json!({"path":zip,"token":token,"total":bytes.len(),"offset":0,"bytes":bytes})).is_err());
  let archive=b"PK\x03\x04zip-data";write(&json!({"path":zip,"token":token,"total":archive.len(),"offset":0,"bytes":archive})).unwrap();assert_eq!(fs::read(&zip).unwrap(),archive);
  fs::remove_file(path).unwrap();fs::remove_file(zip).unwrap();
 }
}
