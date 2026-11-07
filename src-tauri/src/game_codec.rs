//! Bounded decoder for the game's in-memory configuration blobs.
//! Developed from the current client's binary format; never executes game code.
use serde_json::{Map, Number, Value};

type Result<T> = std::result::Result<T, String>;

pub fn decode(bytes: &[u8]) -> Result<Value> {
    decode_selected(bytes,None)
}
pub fn decode_selected(bytes: &[u8], keys: Option<&std::collections::HashSet<String>>) -> Result<Value> {
    let count = word(bytes, 0)? as usize;
    if count > 200_000 { return Err("配置字符串数量超出范围".into()); }
    let pool = 4usize.checked_add((count + 1) * 4).ok_or("配置长度溢出")?;
    let mut offsets = Vec::with_capacity(count + 1);
    for i in 0..=count { offsets.push(word(bytes, 4 + i * 4)? as usize); }
    if offsets.windows(2).any(|v| v[0] > v[1]) { return Err("配置字符串索引无序".into()); }
    let base = pool.checked_add(offsets[count]).ok_or("配置长度溢出")?;
    let root = base.checked_add(word(bytes, base)? as usize).ok_or("配置长度溢出")?;
    let mut reader = Reader { bytes, offsets, pool, base, remaining: 1_000_000, keys };
    reader.value(&mut root.clone(), 0, 0)
}

fn word(bytes: &[u8], at: usize) -> Result<u32> {
    let end = at.checked_add(4).ok_or("配置偏移溢出")?;
    Ok(u32::from_le_bytes(bytes.get(at..end).ok_or("配置数据不完整")?.try_into().unwrap()))
}

struct Reader<'a> { bytes: &'a [u8], offsets: Vec<usize>, pool: usize, base: usize, remaining: usize, keys:Option<&'a std::collections::HashSet<String>> }
impl Reader<'_> {
    fn take(&self, at: &mut usize, n: usize) -> Result<&[u8]> {
        let end = at.checked_add(n).ok_or("配置偏移溢出")?;
        let result = self.bytes.get(*at..end).ok_or("配置数据不完整")?;
        *at = end; Ok(result)
    }
    fn byte(&self, at: &mut usize) -> Result<u8> { Ok(self.take(at, 1)?[0]) }
    fn var(&self, at: &mut usize) -> Result<u64> {
        let mut value = 0u64;
        for shift in (0..70).step_by(7) {
            let byte = self.byte(at)?;
            if shift == 63 && byte > 1 { return Err("配置整数溢出".into()); }
            value |= u64::from(byte & 127) << shift;
            if byte < 128 { return Ok(value); }
        }
        Err("配置整数过长".into())
    }
    fn count(&self, at: &mut usize) -> Result<usize> {
        let n = self.var(at)?;
        if n > 200_000 { return Err(format!("配置集合超出范围（偏移 {}，数量 {n}）",*at)); }
        Ok(n as usize)
    }
    fn reference(&self, offset: u64) -> Result<usize> {
        self.base.checked_add(usize::try_from(offset).map_err(|_| "配置偏移溢出")?).filter(|n| *n < self.bytes.len()).ok_or("配置引用越界".into())
    }
    fn key(value: Value) -> Result<String> {
        match value {
            Value::String(s) => Ok(s), Value::Number(n) => Ok(n.to_string()),
            Value::Array(ref values) if values.iter().all(|v|v.is_number()||v.is_string()) => Ok(value.to_string()),
            _ => Err("配置键类型不支持".into())
        }
    }
    fn value(&mut self, at: &mut usize, tag: u8, depth: usize) -> Result<Value> {
        if depth > 32 || self.remaining == 0 { return Err("配置嵌套或大小超出范围".into()); }
        self.remaining -= 1;
        let tag = if tag == 0 { self.byte(at)? } else { tag };
        let flags = tag & 240;
        match tag & 15 {
            1 => {
                let n = self.var(at)?;
                if flags == 16 { Ok(Value::from(((n >> 1) as i64) ^ -((n & 1) as i64))) } else { Ok(Value::from(n)) }
            }
            2 => {
                let n = match flags {
                    16 => f32::from_le_bytes(self.take(at, 4)?.try_into().unwrap()) as f64,
                    32 => f64::from_le_bytes(self.take(at, 8)?.try_into().unwrap()),
                    _ => return Err("配置浮点格式不支持".into()),
                };
                Number::from_f64(n).map(Value::Number).ok_or("配置包含无效浮点数".into())
            }
            3 => Ok(Value::Bool(self.byte(at)? != 0)),
            4 => Ok(Value::Null),
            5 => {
                let index = self.count(at)?;
                let start = *self.offsets.get(index).ok_or("配置字符串索引越界")?;
                let end = *self.offsets.get(index + 1).ok_or("配置字符串索引越界")?;
                let raw = self.bytes.get(self.pool + start..self.pool + end).ok_or("配置字符串越界")?;
                Ok(Value::String(std::str::from_utf8(raw).map_err(|_| "配置字符串编码错误")?.into()))
            }
            11 => { let offset = self.var(at)?; let mut cursor = self.reference(offset)?; self.value(&mut cursor, 0, depth + 1) }
            7 | 8 | 12 => {
                let uniform = if flags & 32 != 0 { self.byte(at)? } else { 0 };
                let n = self.count(at)?;
                let mut result = Vec::with_capacity(n);
                for _ in 0..n {
                    let val = if flags & 64 != 0 {
                        if tag & 15 == 8 { self.take(at, 4)?; }
                        let offset = u32::from_le_bytes(self.take(at, 4)?.try_into().unwrap());
                        let mut cursor = self.reference(offset.into())?;
                        self.value(&mut cursor, uniform, depth + 1)?
                    } else { self.value(at, uniform, depth + 1)? };
                    result.push(val);
                }
                Ok(Value::Array(result))
            }
            6 => {
                let mut result = Map::new();
                if flags & 128 != 0 {
                    let offset = self.var(at)?;
                    let mut schema = self.reference(offset)?;
                    let n = self.count(&mut schema)?;
                    let optional = self.count(&mut schema)?;
                    if optional > n { return Err("配置可选字段数量错误".into()); }
                    let bitmap = if optional==0{Vec::new()}else if flags&64!=0{
                        let offset=self.var(at)?;let mut cursor=self.reference(offset)?;
                        self.take(&mut cursor,optional.div_ceil(8))?.to_vec()
                    }else{self.take(at, optional.div_ceil(8))?.to_vec()};
                    for i in 0..n {
                        let key = Self::key(self.value(&mut schema, 5, depth + 1)?)?;
                        let kind = self.byte(&mut schema)?;
                        if i < optional && bitmap[i / 8] & (1 << (i % 8)) == 0 { continue; }
                        result.insert(key, self.value(at, kind, depth + 1)?);
                    }
                } else {
                    let key_tag = if flags & 16 != 0 { self.byte(at)? } else { 0 };
                    let value_tag = if flags & 32 != 0 { self.byte(at)? } else { 0 };
                    let n = self.count(at)?;
                    for _index in 0..n {
                        let mut cursor = *at;
                        if flags & 64 != 0 {
                            self.take(at, 4)?;
                            let offset = u32::from_le_bytes(self.take(at, 4)?.try_into().unwrap());
                            cursor = self.reference(offset.into())?;
                        }
                        let key = Self::key(self.value(&mut cursor, key_tag, depth + 1)?)?;
                        if depth==0 && flags&64!=0 && self.keys.is_some_and(|keys|!keys.contains(&key)){continue;}
                        let val = self.value(&mut cursor, value_tag, depth + 1)?;
                        result.insert(key, val);
                        if flags & 64 == 0 { *at = cursor; }
                    }
                }
                Ok(Value::Object(result))
            }
            _ => Err(format!("配置类型 {tag:#x} 尚未适配")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]#[ignore="requires own config blob"]fn own_skill_blob(){
        let bytes=std::fs::read(std::env::var("PINGAN_RESEARCH_BLOB").unwrap()).unwrap();
        if std::env::var_os("PINGAN_RESEARCH_ALL").is_some(){
            let value=decode(&bytes).unwrap();
            std::fs::write(std::env::var("PINGAN_SKILL_PATH").unwrap(),serde_json::to_vec(&value).unwrap()).unwrap();
            println!("Decoded {} own file records",value.as_object().unwrap().len());return;
        }
        let facts:Value=serde_json::from_str(include_str!("../data/hero-facts.json")).unwrap();
        let mut ids:std::collections::HashSet<String>= facts.as_object().into_iter().flatten().flat_map(|(_,h)|h["skills"].as_array().into_iter().flatten()).flat_map(|id|(0..=5).flat_map(move|level|(-1..=10).map(move|variant|serde_json::json!([id,level,variant]).to_string()))).collect();
        let mut value=decode_selected(&bytes,Some(&ids)).unwrap();
        loop{
            let before=ids.len();
            for row in value.as_object().unwrap().values(){
                if row["_proto_key"].is_array(){ids.insert(row["_proto_key"].to_string());}
                for text in row.as_object().into_iter().flatten().filter_map(|(_,v)|v.as_str()){
                    for token in text.split('[').skip(1).filter_map(|part|part.split(']').next()){
                        let Some(reference)=token.strip_prefix("skill_").or_else(||token.strip_prefix("extra_"))else{continue};
                        let mut parts=reference.split('_');
                        let Some(id)=parts.next().and_then(|v|v.parse::<u64>().ok())else{continue};
                        let level=parts.next().and_then(|v|v.parse::<u64>().ok()).unwrap_or(1);
                        for variant in [-1,1,0]{ids.insert(serde_json::json!([id,level,variant]).to_string());}
                    }
                }
            }
            if before==ids.len(){break;}value=decode_selected(&bytes,Some(&ids)).unwrap();
        }
        println!("Selected {}",value.as_object().unwrap().len());
        if let Ok(path)=std::env::var("PINGAN_SKILL_PATH"){std::fs::write(path,serde_json::to_vec(&value).unwrap()).unwrap();}
    }
    #[test]fn tuple_skill_keys_keep_id_and_level_distinct(){
        assert_eq!(Reader::key(serde_json::json!([2001,1])).unwrap(),"[2001,1]");
        assert_ne!(Reader::key(serde_json::json!([2001,1])).unwrap(),Reader::key(serde_json::json!([2001,5])).unwrap());
        assert!(Reader::key(serde_json::json!([[2001],1])).is_err());
    }
    #[test]
    fn decodes_pool_and_references_and_rejects_truncation() {
        // Own synthetic fixture: pool ["speed"], body [reference target, root].
        let mut b = vec![];
        for n in [1u32, 0, 5] { b.extend(n.to_le_bytes()); }
        b.extend(b"speed");
        b.extend(6u32.to_le_bytes()); b.extend([1, 57]);
        b.extend([0x16, 5, 1, 0, 11, 4]);
        assert_eq!(decode(&b).unwrap()["speed"], 57);
        for end in 0..b.len() { assert!(decode(&b[..end]).is_err()); }
    }
    #[test]
    fn rejects_reference_cycles() {
        let mut b=vec![];
        for n in [0u32, 0, 4] { b.extend(n.to_le_bytes()); }
        b.extend([11, 4]);
        assert!(decode(&b).is_err());
    }
    #[test]fn shared_schema_can_reference_its_optional_bitmap(){
        // Pool ["x"], schema at body+4, bitmap at body+8, root at body+9.
        let mut b=vec![];for n in [1u32,0,1]{b.extend(n.to_le_bytes());}b.push(b'x');
        b.extend(9u32.to_le_bytes());b.extend([1,1,0,1,1,0xc6,4,8,57]);
        assert_eq!(decode(&b).unwrap()["x"],57);
    }
}
