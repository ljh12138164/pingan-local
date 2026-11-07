//! Read-only, out-of-process adapter for the Windows x64 CPython 3.11 client.
//! No process writes, remote threads, injected modules, or game function calls.
#[cfg(windows)]
mod windows {
    use serde_json::{json, Map, Value};
    use std::{collections::{HashMap,HashSet}, path::PathBuf, time::Instant};
    use windows_sys::Win32::{Foundation::{CloseHandle,HANDLE,INVALID_HANDLE_VALUE},System::{Diagnostics::{Debug::ReadProcessMemory,ToolHelp::*},Threading::{OpenProcess,PROCESS_QUERY_INFORMATION,PROCESS_VM_READ}}};
    type Result<T> = std::result::Result<T,String>;
    struct Handle(HANDLE);
    impl Drop for Handle { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
    enum Source { Desktop(Handle), Android(crate::emulator::Memory) }
    struct Memory { source:Source, types:HashMap<usize,String>, slots:HashMap<usize,Vec<(String,usize)>>, strings:HashMap<usize,String>, started:Instant, bytes:usize }
    fn number(bytes:&[u8],offset:usize)->Result<usize>{Ok(u64::from_le_bytes(bytes.get(offset..offset+8).ok_or("内存结构不完整")?.try_into().unwrap()) as usize)}
    impl Memory {
        fn read(&mut self,addr:usize,n:usize)->Result<Vec<u8>> {
            let limit=if matches!(&self.source,Source::Android(_)){120}else{25};
            if addr<0x10000 || addr.checked_add(n).is_none_or(|end|end>=0x800000000000) || n>32*1024*1024 || self.bytes>512*1024*1024 || self.started.elapsed().as_secs()>limit { return Err("读取范围或耗时超出限制，请保持庭院界面后重试".into()); }
            self.bytes+=n;
            if let Source::Android(memory)=&mut self.source{return memory.read(addr,n);}
            let mut bytes=vec![0u8;n];let mut got=0;
            let Source::Desktop(handle)=&self.source else{unreachable!()};
            if n>0 && unsafe{ReadProcessMemory(handle.0,addr as _,bytes.as_mut_ptr().cast(),n,&mut got)}==0 || got!=n {return Err("游戏数据在读取中变化，或游戏已经退出，请重新读取".into());}
            Ok(bytes)
        }
        fn fresh(&mut self,addr:usize,n:usize)->Result<Vec<u8>>{if let Source::Android(memory)=&mut self.source{memory.fresh(addr,n)}else{self.read(addr,n)}}
        fn ptr(&mut self,addr:usize)->Result<usize>{number(&self.read(addr,8)?,0)}
        fn name(&mut self,addr:usize)->Result<String>{
            let tp=self.ptr(addr+8)?;
            if let Some(s)=self.types.get(&tp){return Ok(s.clone());}
            let p=self.ptr(tp+24)?;let bytes=self.read(p,128)?;
            let len=bytes.iter().position(|b|*b==0).ok_or("游戏对象类型名称无效")?;
            let s=std::str::from_utf8(&bytes[..len]).map_err(|_|"游戏对象类型编码错误")?.to_string();
            self.types.insert(tp,s.clone());Ok(s)
        }
        fn string(&mut self,addr:usize)->Result<String>{
            if let Some(s)=self.strings.get(&addr){return Ok(s.clone());}
            let h=self.read(addr,48)?;let n=number(&h,16)?;
            if n>65_536{return Err("游戏字符串过长".into());}
            let flags=u32::from_le_bytes(h[32..36].try_into().unwrap());let kind=(flags>>2)&7;
            let compact=flags&32!=0;let ascii=flags&64!=0;
            let at=if compact{addr+if ascii{48}else{72}}else{self.ptr(addr+72)?};
            let raw=self.read(at,n*kind as usize)?;
            let s=match kind{
                1=>raw.into_iter().map(char::from).collect(),
                2=>String::from_utf16(&raw.chunks_exact(2).map(|c|u16::from_le_bytes(c.try_into().unwrap())).collect::<Vec<_>>()).map_err(|_|"游戏字符串 UTF-16 无效")?,
                4=>raw.chunks_exact(4).map(|c|char::from_u32(u32::from_le_bytes(c.try_into().unwrap())).ok_or("游戏字符串 UTF-32 无效")).collect::<std::result::Result<String,_>>()?,
                _=>return Err("游戏字符串格式不支持".into()),
            };
            self.strings.insert(addr,s.clone());Ok(s)
        }
        fn dict_keys(&mut self,keys:usize,values:usize)->Result<Vec<(usize,usize)>>{
            let h=self.fresh(keys,32)?;let log=h[9];let kind=h[10];let n=number(&h,24)?;
            if log>24 || kind>2 || n>100_000{return Err("游戏字典结构不支持".into());}
            let size=if kind==0{24}else{16};let raw=self.fresh(keys+32+(1usize<<log),n*size)?;
            let split=if values!=0{self.fresh(values,n*8)?}else{vec![]};let mut out=vec![];
            for i in 0..n{
                let offset=i*size+if kind==0{8}else{0};let key=number(&raw,offset)?;
                let val=if values!=0{number(&split,i*8)?}else{number(&raw,offset+8)?};
                if key!=0&&val!=0{out.push((key,val));}
            }
            Ok(out)
        }
        fn pairs(&mut self,addr:usize)->Result<Vec<(usize,usize)>>{
            for _ in 0..3 {
                let h=self.fresh(addr,48)?;let used=number(&h,16)?;
                if used>100_000{return Err("游戏字典过大".into());}
                let result=self.dict_keys(number(&h,32)?,number(&h,40)?)?;
                if result.len()==used && self.fresh(addr+16,32)?==h[16..48]{return Ok(result);}
            }
            Err("游戏字典在读取中变化，请重试".into())
        }
        fn fields(&mut self,addr:usize)->Result<Vec<(String,usize)>>{
            let name=self.name(addr)?;
            let pairs=match name.as_str(){
                "module"=>{let p=self.ptr(addr+16)?;self.pairs(p)?},
                "dict"=>self.pairs(addr)?,
                "taggeddict.taggeddict"=>{
                    let h=self.read(addr,32)?;let table=number(&h,16)?;let n=number(&h,24)?;
                    if n>100_000{return Err("游戏配置字典过大".into());}
                    let capacity=if n<=63{n}else{n+(n/5).max(1)};
                    let raw=self.read(table,capacity*16)?;let mut pairs=vec![];
                    for i in 0..capacity{let a=number(&raw,i*16)?;let b=number(&raw,i*16+8)?;if a!=0{pairs.push((a&!7,b&!7));}}
                    if pairs.len()!=n{return Err("游戏配置字典布局不支持".into());}pairs
                },
                _=>{
                    let tp=self.ptr(addr+8)?;let flags=self.ptr(tp+168)?;
                    if flags&(1<<29)!=0{self.pairs(addr)?}else{
                        let offset=self.ptr(tp+288)? as isize;
                        let mut dictionary=0;
                        if flags&16!=0{
                            dictionary=self.ptr(addr-24)?;
                            let values=self.ptr(addr-32)?;
                            if dictionary==0 && values!=0{let keys=self.ptr(tp+880)?;let pairs=self.dict_keys(keys,values)?;return self.named(pairs);}
                        }else if offset!=0{
                            let at=if offset>0{addr.checked_add(offset as usize)}else{
                                let basic=self.ptr(tp+32)?;let item=self.ptr(tp+40)?;
                                let count=if item!=0{self.ptr(addr+16)?}else{0};
                                if count>100_000{return Err("游戏对象过大".into());}
                                let size=(basic+count*item+7)&!7;
                                addr.checked_add(size).and_then(|p|p.checked_add_signed(offset))
                            }.ok_or("游戏对象偏移无效")?;
                            dictionary=self.ptr(at)?;
                        }
                        if dictionary!=0{self.pairs(dictionary)?}else{
                            let slots=if let Some(slots)=self.slots.get(&tp){slots.clone()}else{
                                let d=self.ptr(tp+264)?;let descriptors=self.pairs(d)?;let mut slots=vec![];let basic=self.ptr(tp+32)?;
                                for(k,v)in descriptors{if self.name(v)?=="member_descriptor"{
                                    let member=self.ptr(v+40)?;let raw=self.read(member,24)?;let kind=u32::from_le_bytes(raw[8..12].try_into().unwrap());let off=number(&raw,16)?;
                                    if [6,16].contains(&kind)&&off<basic{slots.push((self.string(k)?,off));}
                                }}self.slots.insert(tp,slots.clone());slots
                            };
                            let mut out=vec![];for(k,off)in slots{let val=self.ptr(addr+off)?;if val!=0{out.push((k,val));}}return Ok(out)
                        }
                    }
                }
            };
            self.named(pairs)
        }
        fn named(&mut self,pairs:Vec<(usize,usize)>)->Result<Vec<(String,usize)>>{
            pairs.into_iter().map(|(k,v)|{let value=self.value(k,0)?;let key=match value{Value::String(s)=>s,Value::Number(n)=>n.to_string(),_=>return Err("游戏字典键类型不支持".into())};Ok((key,v))}).collect()
        }
        fn value(&mut self,addr:usize,depth:usize)->Result<Value>{
            if depth>12{return Err("游戏数据嵌套过深".into());}
            let name=self.name(addr)?;
            match name.as_str(){
                "NoneType"=>Ok(Value::Null),
                "str"=>Ok(Value::String(self.string(addr)?)),
                "int"|"bool"=>{
                    let count=self.ptr(addr+16)? as isize;
                    if count.unsigned_abs()>2{return Err("游戏整数超出支持范围".into());}
                    let raw=self.read(addr+24,count.unsigned_abs()*4)?;let mut n=0i64;
                    for(i,chunk)in raw.chunks_exact(4).enumerate(){n|=i64::from(u32::from_le_bytes(chunk.try_into().unwrap()))<<(30*i);}
                    if count<0{n=-n;}Ok(if name=="bool"{json!(n!=0)}else{json!(n)})
                },
                "float"=>{let n=f64::from_le_bytes(self.read(addr+16,8)?.try_into().unwrap());if !n.is_finite(){return Err("游戏属性数值无效".into());}Ok(json!(n))},
                "bytes"=>{let n=self.ptr(addr+16)?;if n>65_536{return Err("游戏字节数据过长".into());}let bytes=self.read(addr+32,n)?;Ok(json!(bytes.iter().map(|b|format!("{b:02x}")).collect::<String>()))},
                "ObjectId"=>{let fields=self.fields(addr)?;let p=fields.iter().find(|(k,_)|k=="_ObjectId__id").map(|(_,v)|*v).ok_or("游戏对象编号结构不支持")?;self.value(p,depth+1)},
                "list"|"tuple"=>{
                    let n=self.ptr(addr+16)?;if n>50_000{return Err("游戏列表过大".into());}
                    let p=if name=="list"{self.ptr(addr+24)?}else{addr+24};let raw=if n==0{vec![]}else{self.read(p,n*8)?};let mut out=Vec::with_capacity(n);
                    for i in 0..n{out.push(self.value(number(&raw,i*8)?,depth+1)?);}Ok(Value::Array(out))
                },
                "set"|"frozenset"=>{
                    let used=self.ptr(addr+24)?;let mask=self.ptr(addr+32)?;
                    if used>50_000||mask>262_143{return Err("游戏集合过大".into());}
                    let table=self.ptr(addr+40)?;let entries=self.read(table,(mask+1)*16)?;let mut values=Vec::with_capacity(used);
                    for entry in entries.chunks_exact(16){let pointer=number(entry,0)?;let hash=number(entry,8)? as isize;if pointer!=0&&hash!=-1{values.push(self.value(pointer,depth+1)?);}}
                    if values.len()!=used{return Err("游戏集合在读取期间发生变化，请重试".into());}Ok(Value::Array(values))
                },
                "dict"|"taggeddict.taggeddict"|"TeamPrefabGroupData"|"TeamPrefabData"=>{let pairs=self.fields(addr)?;let mut out=Map::new();for(k,v)in pairs{out.insert(k,self.value(v,depth+1)?);}Ok(Value::Object(out))},
                "Equip"=>{
                    let fields:HashMap<_,_>=self.fields(addr)?.into_iter().collect();
                    if let Some(&initial)=fields.get("_init_dict"){if self.name(initial)?=="dict"{return self.value(initial,depth+1);}}
                    let mut out=Map::new();for(source,target)in [("_equipId","itemId"),("_base_rindex","base_rindex"),("_qua","qua"),("_strongLevel","level"),("_suitId","suitid"),("_rattr","rattr"),("_lock","lock"),("_single_attr","single_attr")]{if let Some(&p)=fields.get(source){out.insert(target.into(),self.value(p,depth+1)?);}}Ok(Value::Object(out))
                },
                _=>Err(format!("游戏数据类型 {name} 尚未适配")),
            }
        }
        fn selected(&mut self,addr:usize,names:&[&str])->Result<Value>{
            let mut out=Map::new();for(k,v)in self.fields(addr)?{if names.contains(&k.as_str()){out.insert(k,self.value(v,0)?);}}Ok(Value::Object(out))
        }
        fn config(&mut self,module:usize,keys:Option<&HashSet<String>>)->Result<Value>{
            let fields=self.fields(module)?;let map:HashMap<_,_>=fields.into_iter().collect();
            if let Some(&a)=map.get("bin_data"){
                let native=self.ptr(a+16)?;
                if native==0{let data=self.ptr(a+24)?;return self.value(data,0);}
                let bytes=self.ptr(native)?;let n=self.ptr(bytes+16)?;let raw=self.read(bytes+32,n)?;
                return crate::game_codec::decode_selected(&raw,keys);
            }
            self.value(*map.get("data").ok_or("配置模块缺少 data")?,0)
        }
        #[cfg(test)]fn code_constants(&mut self,pointer:usize,depth:usize)->Result<Value>{
            if depth>5{return Ok(Value::Null);}
            let kind=self.name(pointer)?;
            if ["tuple","list"].contains(&kind.as_str()) {let count=self.ptr(pointer+16)?.min(1000);let start=if kind=="list"{self.ptr(pointer+24)?}else{pointer+24};let mut values=vec![];for i in 0..count{let p=self.ptr(start+i*8)?;values.push(self.code_constants(p,depth+1)?);}return Ok(json!(values));}
            if kind=="code"{let names=self.ptr(pointer+32)?;let constants=self.ptr(pointer+24)?;return Ok(json!({"names":self.value(names,0)?,"constants":self.code_constants(constants,depth+1)?}));}
            Ok(self.value(pointer,0).unwrap_or(Value::Null))
        }
    }
    fn module(pid:u32)->Result<(usize,PathBuf)>{unsafe{
        let handle=CreateToolhelp32Snapshot(TH32CS_SNAPMODULE|TH32CS_SNAPMODULE32,pid);
        if handle==INVALID_HANDLE_VALUE{return Err("无法列出游戏模块，请确认运行权限一致".into());}
        let handle=Handle(handle);let mut e:MODULEENTRY32W=std::mem::zeroed();e.dwSize=std::mem::size_of_val(&e) as _;let mut ok=Module32FirstW(handle.0,&mut e);
        while ok!=0{
            let name=String::from_utf16_lossy(&e.szModule[..e.szModule.iter().position(|v|*v==0).unwrap_or(e.szModule.len())]);
            if name.eq_ignore_ascii_case("onmyoji.exe"){
                let path=String::from_utf16_lossy(&e.szExePath[..e.szExePath.iter().position(|v|*v==0).unwrap_or(e.szExePath.len())]);return Ok((e.modBaseAddr as _,PathBuf::from(path)));
            }ok=Module32NextW(handle.0,&mut e);
        }Err("目标不是已运行的阴阳师桌面客户端".into())
    }}
    fn exports(bytes:&[u8],base:usize)->Result<HashMap<String,usize>>{
        let u16at=|p:usize|->Result<usize>{Ok(u16::from_le_bytes(bytes.get(p..p+2).ok_or("游戏 PE 文件不完整")?.try_into().unwrap()) as usize)};
        let pe=super::word(bytes,60)? as usize;
        if bytes.get(pe..pe+4)!=Some(b"PE\0\0") || u16at(pe+4)?!=0x8664 || u16at(pe+24)?!=0x20b{return Err("当前读取器仅支持 Windows x64 客户端".into());}
        let ns=u16at(pe+6)?;let sections=pe+24+u16at(pe+20)?;
        let offset=|rva:usize|->Result<usize>{for i in 0..ns{let p=sections+i*40;let size=super::word(bytes,p+8)?.max(super::word(bytes,p+16)?) as usize;let va=super::word(bytes,p+12)? as usize;if rva>=va&&rva<va+size{return Ok(super::word(bytes,p+20)? as usize+rva-va);}}Err("游戏导出表 RVA 无效".into())};
        let export=offset(super::word(bytes,pe+24+112)? as usize)?;
        let count=super::word(bytes,export+24)? as usize;if count>100_000{return Err("游戏导出表过大".into());}
        let funcs=offset(super::word(bytes,export+28)? as usize)?;let names=offset(super::word(bytes,export+32)? as usize)?;let ords=offset(super::word(bytes,export+36)? as usize)?;let mut result=HashMap::new();
        for i in 0..count{let p=offset(super::word(bytes,names+i*4)? as usize)?;let rest=bytes.get(p..).ok_or("游戏导出名称越界")?;let end=rest.iter().take(512).position(|b|*b==0).ok_or("游戏导出名称无效")?;let name=std::str::from_utf8(&rest[..end]).map_err(|_|"游戏导出名称编码错误")?;let ordinal=u16at(ords+i*2)?;result.insert(name.into(),base+super::word(bytes,funcs+ordinal*4)? as usize);}
        Ok(result)
    }
    fn scroll_fields(mem:&mut Memory,modules:&HashMap<String,usize>)->Result<Value>{
        let Some(&module)=modules.get("ui.huijuan.HuiJuanPanel")else{return Ok(Value::Null)};
        let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();
        let Some(&class)=fields.get("HuiJuanInfoMgr")else{return Ok(Value::Null)};
        let dictionary=mem.ptr(class+264)?;
        let fields:HashMap<_,_>=mem.fields(dictionary)?.into_iter().collect();
        let Some(&method)=fields.get("instance")else{return Ok(Value::Null)};
        let method=if ["classmethod","staticmethod"].contains(&mem.name(method)?.as_str()){mem.ptr(method+16)?}else{method};
        if mem.name(method)?!="function"{return Ok(Value::Null)}
        let namespace=mem.ptr(method+16)?;
        let globals:HashMap<_,_>=mem.fields(namespace)?.into_iter().collect();
        let Some(&instance)=globals.get("m_instance")else{return Ok(Value::Null)};
        if mem.name(instance)?=="NoneType"{return Ok(Value::Null)}
        let mut data=mem.selected(instance,&["serverInfo","selfInfo","unlockDonation","rankInfo"])?;
        if let Some(&config)=globals.get("DATA_PAINTINGS"){
            let mut paintings=mem.config(config,None)?;
            if let Some(rows)=paintings.as_object_mut(){for row in rows.values_mut(){if let Some(row)=row.as_object_mut(){row.retain(|key,_|["id","name","issue","hero_id"].contains(&key.as_str()));}}}
            data["paintings"]=paintings;
        }
        Ok(data)
    }
    fn runtime_fields(mem:&mut Memory,modules:&HashMap<String,usize>,avatar:&HashMap<String,usize>,persistent:&HashMap<String,usize>,out:&mut Map<String,Value>)->Result<()>{
        out.insert("scrollData".into(),scroll_fields(mem,modules).unwrap_or_else(|error|json!({"error":error})));
        if let Some(&module)=modules.get("module.guild.GuildLogic"){
            let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();
            if let Some(&detail)=fields.get("myGuildDetail"){
                let mut guild=mem.selected(detail,&["_id","name","guild_lv","member_count","active_score","funds","active_member_count","create_time","pvp_score","construction","creator","declare","sum_insignia_count","trial_emblem_score","active_rank_pos","pvp_rank_pos","guild_crevice_difficulty","guild_crevice_defeated_difficulty","season_pvp_season"])?;
                let detail:HashMap<_,_>=mem.fields(detail)?.into_iter().collect();
                if let Some(&members)=detail.get("members"){
                    let kind=mem.name(members)?;if !["list","tuple"].contains(&kind.as_str()){return Err("寮成员缓存结构发生变化".into());}
                    let count=mem.ptr(members+16)?;if count>1000{return Err("寮成员数量超出支持范围".into());}
                    let start=if kind=="list"{mem.ptr(members+24)?}else{members+24};let pointers=if count==0{vec![]}else{mem.read(start,count*8)?};let mut rows=vec![];
                    for i in 0..count{rows.push(mem.selected(number(&pointers,i*8)?,&["id","name","level","duty","weekly_feats","last_weekly_feats","total_feats","history_donate","weekly_active_score","join_time","offline_time","pvp_score"])?);}
                    if mem.ptr(members+16)?!=count{return Err("寮成员缓存在读取中变化，请重试".into());}
                    guild["members"]=json!(rows);
                }
                out.insert("guildDetail".into(),guild);
            }
            if let Some(&info)=fields.get("lbs_info"){out.insert("realmInfo".into(),mem.selected(info,&["ls_cards","lbs_growth","already_reward"])?);}
            if let Some(&detail)=fields.get("donateInfo") { out.insert("guildSelectedMember".into(),mem.selected(detail,&["id","name","weekly_feats","last_weekly_feats","weekly_active_score","total_feats","history_donate","pvp_score"])?); }
            if let Some(&tasks)=fields.get("guild_task_info") { out.insert("guildTaskInfo".into(),mem.selected(tasks,&["day_finished_statics","week_finished_statics","last_refresh_task_time","last_change_task_time"])?); }
        }
        if let Some(&record)=avatar.get("set_other").or_else(||persistent.get("set_other")){out.insert("set_other".into(),mem.selected(record,&["herouid","t","frienduid","hreward","card_item"])?);}
        if let Some(&cards)=avatar.get("myJiejieCardDataDict"){
            let mut records=Map::new();for(id,card)in mem.fields(cards)?{records.insert(id,mem.selected(card,&["uid","itemid","totalTime","produceValue"])?);}
            out.insert("realmCards".into(),Value::Object(records));
        }
        if let Some(&friends)=avatar.get("original_cache_local_friends"){
            let fields:HashMap<_,_>=mem.fields(friends)?.into_iter().collect();if let Some(&list)=fields.get("friend_list"){
                let mut records=Map::new();for(id,friend)in mem.fields(list)?{records.insert(id,mem.selected(friend,&["name","weekly_feats","last_weekly_feats","weekly_active_score","total_feats","history_donate","pvp_score"])?);}
                out.insert("friendNames".into(),Value::Object(records));
            }
        }
        Ok(())
    }
    struct Client { mem:Memory, modules:HashMap<String,usize>, avatar:HashMap<String,usize>, persistent:HashMap<String,usize>, player:usize, version:u32 }
    fn open_client(pid:u32)->Result<Client>{
        let(base,path)=module(pid)?;let file=std::fs::read(path).map_err(|e|e.to_string())?;let exports=exports(&file,base)?;
        let handle=unsafe{OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ,0,pid)};
        if handle.is_null(){return Err("无法以只读权限打开游戏，请确认运行权限一致".into());}
        let mut mem=Memory{source:Source::Desktop(Handle(handle)),types:HashMap::new(),slots:HashMap::new(),strings:HashMap::new(),started:Instant::now(),bytes:0};
        let version_addr=*exports.get("Py_Version").ok_or("未找到游戏 Python 版本")?;
        let version=super::word(&mem.read(version_addr,4)?,0)?;
        if version>>16!=0x030b{return Err(format!("游戏 Python 版本 {version:#x} 尚未适配"));}
        // Resolve only the verified getter's RIP-relative data address; no calls.
        let getter=*exports.get("PyThreadState_Get").ok_or("未找到游戏线程状态导出")?;let code=mem.read(getter,16)?;
        if code[..7]!=[0x48,0x83,0xec,0x28,0x48,0x8b,0x05]{return Err("游戏线程状态结构发生变化，请更新读取器".into());}
        let displacement=i32::from_le_bytes(code[7..11].try_into().unwrap()) as isize;
        let state_addr=(getter+11).checked_add_signed(displacement).ok_or("游戏状态地址无效")?;
        let mut state=0;for _ in 0..40{state=mem.ptr(state_addr)?;if state!=0{break;}std::thread::sleep(std::time::Duration::from_millis(5));}
        if state==0{return Err("游戏 Python 线程暂未活动，请保持庭院界面后重试".into());}
        let interp=mem.ptr(state+16)?;from_interpreter(mem,interp,version)
    }
    fn from_interpreter(mut mem:Memory,interp:usize,version:u32)->Result<Client>{
        let module_dict=mem.ptr(interp+0x378)?;
        if mem.name(module_dict)?!="dict"{return Err("游戏解释器结构不匹配".into());}
        let modules:HashMap<_,_>=mem.fields(module_dict)?.into_iter().collect();
        let globals=*modules.get("Globals").ok_or("尚未进入游戏庭院")?;let global_fields:HashMap<_,_>=mem.fields(globals)?.into_iter().collect();
        let player=*global_fields.get("player1").ok_or("尚未登录角色")?;
        if mem.name(player)?!="ClientAvatar"{return Err("尚未登录角色，请进入庭院后读取".into());}
        let avatar:HashMap<_,_>=mem.fields(player)?.into_iter().collect();
        let storage=*avatar.get("_init_bdict").ok_or("游戏角色库存结构不匹配")?;
        let persistent:HashMap<_,_>=mem.fields(storage)?.into_iter().collect();
        Ok(Client{mem,modules,avatar,persistent,player,version})
    }
    fn open_android(root:&str,serial:&str,pid:u32)->Result<Client>{
        let adb=crate::emulator::adb_path(root)?;let maps=crate::emulator::maps(&adb,serial,pid)?;let base=crate::emulator::client_base(&maps)?;
        let transport=crate::emulator::Memory::open(&adb,serial,pid)?;
        let mut mem=Memory{source:Source::Android(transport),types:HashMap::new(),slots:HashMap::new(),strings:HashMap::new(),started:Instant::now(),bytes:0};
        let h=mem.read(base,64)?;if h[..6]!=[0x7f,b'E',b'L',b'F',2,1]||h[18..20]!=[62,0]{return Err("游戏模块不是已经适配的 x86_64 ELF".into());}
        let count=u16::from_le_bytes(h[56..58].try_into().unwrap()) as usize;let size=u16::from_le_bytes(h[54..56].try_into().unwrap()) as usize;if count>256||size!=56{return Err("游戏 ELF 程序头结构不支持".into());}
        let programs=mem.read(base+number(&h,32)?,count*size)?;let mut dynamic=None;
        for row in programs.chunks_exact(size){if super::word(row,0)?==2{dynamic=Some((base+number(row,16)?,number(row,32)?));}}
        let(at,n)=dynamic.ok_or("游戏 ELF 缺少动态表")?;if n>65536{return Err("游戏 ELF 动态表过大".into());}let bytes=mem.read(at,n)?;let mut tags=HashMap::new();
        for row in bytes.chunks_exact(16){let tag=number(row,0)?;if tag==0{break;}tags.insert(tag,number(row,8)?);}
        let pointer=|tag:usize|->Result<usize>{let p=*tags.get(&tag).ok_or("游戏 ELF 缺少符号表字段")?;Ok(if p<base{base+p}else{p})};
        let hash=mem.read(pointer(4)?,8)?;let symbols=super::word(&hash,4)? as usize;let strings=*tags.get(&10).ok_or("游戏 ELF 缺少字符串表大小")?;
        if symbols>200_000||strings>16*1024*1024||tags.get(&11)!=Some(&24){return Err("游戏 ELF 符号表布局不支持".into());}
        let names=mem.read(pointer(5)?,strings)?;let table=mem.read(pointer(6)?,symbols*24)?;let mut exports=HashMap::new();
        for row in table.chunks_exact(24){let offset=super::word(row,0)? as usize;let Some(rest)=names.get(offset..)else{continue};let Some(end)=rest.iter().position(|b|*b==0)else{continue};if let Ok(name)=std::str::from_utf8(&rest[..end]){if ["Py_Version","_PyRuntime"].contains(&name){exports.insert(name.to_owned(),base+number(row,8)?);}}}
        let version=super::word(&mem.read(*exports.get("Py_Version").ok_or("未找到 Android Python 版本")?,4)?,0)?;if version>>16!=0x030b{return Err(format!("Android Python 版本 {version:#x} 尚未适配"));}
        let interp=mem.ptr(*exports.get("_PyRuntime").ok_or("未找到 Android Python 运行时")?+40)?;
        from_interpreter(mem,interp,version)
    }
    pub fn capture_android(root:&str,serial:&str,pid:u32,runtime:bool)->Result<Value>{
        let client=open_android(root,serial,pid)?;let mut raw=if runtime{runtime_capture(client,pid)?}else{full_capture(client,pid)?};
        raw["reader"]["mode"]=json!("adb-external-read-only");raw["reader"]["emulator"]=json!({"root":root,"serial":serial});Ok(raw)
    }
    #[cfg(test)]pub fn research_android(root:&str,serial:&str,pid:u32)->Result<Value>{
        research_client(open_android(root,serial,pid)?)
    }
    #[cfg(test)]pub fn research_desktop(pid:u32)->Result<Value>{research_client(open_client(pid)?)}
    #[cfg(test)]fn research_client(client:Client)->Result<Value>{
        let Client{mut mem,modules,avatar,persistent,..}=client;
        let heroes:Value=serde_json::from_str(include_str!("../data/hero-facts.json")).expect("hero facts");
        let keys:HashSet<String>=heroes.as_object().into_iter().flatten().flat_map(|(_,h)|h["skills"].as_array().into_iter().flatten()).flat_map(|id|(1..=5).map(move|level|json!([id,level]).to_string())).collect();
        let config_name=std::env::var("PINGAN_RESEARCH_CONFIG").unwrap_or_else(|_|"skill".into());
        if config_name=="_modules" { return Ok(json!({"modules":modules.keys().collect::<Vec<_>>()})); }
        if config_name=="_spiritconst" {
            let module=*modules.get("module_new.hunling.hunling_const").ok_or("spirit constants not loaded")?;
            let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();let mut data=Map::new();
            for key in ["MARK_ID_2_YYS_ID","YYS_ID_2_MARK_ID","HUNLING_YYS_ID_LIST","HUNLING_MAX_STACK_NUM"]{if let Some(&pointer)=fields.get(key){data.insert(key.into(),mem.value(pointer,0)?);}}
            return Ok(Value::Object(data));
        }
        if config_name=="_datakeys" {
            let mut data=Map::new();
            for name in ["Globals","com.data","com.data.Data"]{if let Some(&module)=modules.get(name){let mut fields=Map::new();for(key,pointer)in mem.fields(module)?{if ["BUFF","TIPS","HEAD","SKILL"].iter().any(|part|key.to_uppercase().contains(part)){let kind=mem.name(pointer)?;let value=if kind=="DynamicConfigData"{json!(mem.fields(pointer)?.into_iter().map(|(k,p)|(k,mem.value(p,0).unwrap_or(Value::Null))).collect::<Map<_,_>>())}else{Value::Null};fields.insert(key,json!({"type":kind,"fields":value}));}}data.insert(name.into(),Value::Object(fields));}}
            return Ok(Value::Object(data));
        }
        if config_name=="_skillglobals" {
            let mut data=Map::new();
            for name in ["com.data.cdata","com.data.cdata.skill","com.data.cdata.npc_buff","com.data.cdata.error_tips","com.activity.skill.SkillUtil","module_new.hunling.hunling_const"]{
                if let Some(&module)=modules.get(name){
                    let mut fields=Map::new();
                    for(key,pointer)in mem.fields(module)?{if !key.starts_with("__"){let kind=mem.name(pointer)?;fields.insert(key,json!({"type":kind,"module":if kind=="module"{mem.fields(pointer)?.into_iter().find(|(k,_)|k=="__name__").and_then(|(_,p)|mem.value(p,0).ok())}else{None}}));}}
                    data.insert(name.into(),Value::Object(fields));
                }
            }
            return Ok(Value::Object(data));
        }
        if config_name=="_skillmeta" {
            let mut result=Map::new();
            for name in ["module.ghosts.SkillDescLogic","module.ghosts.SkillCell","module.utils.TipUtil","module.UiUtil","com.const"] {
                let Some(&module)=modules.get(name)else{continue};
                let fields=mem.fields(module)?;let mut values=Map::new();let mut functions=vec![];
                for(label,pointer)in fields {
                    if name=="com.const"&&label!="getDefIconPath"{continue;}
                    let kind=mem.name(pointer)?;
                    if kind=="function" {
                        if name=="module.UiUtil"&&! ["skill","buff","desc"].iter().any(|part|label.to_lowercase().contains(part)){continue;}
                        let code=mem.ptr(pointer+48)?;
                        let names=mem.ptr(code+32)?;let constants=mem.ptr(code+24)?;
                        functions.push(json!({"name":label,"names":mem.value(names,0)?,"constants":mem.code_constants(constants,0)?}));
                    }else if !label.starts_with("__") {
                        let value=if kind=="DynamicConfigData"{Some(json!(mem.fields(pointer)?.into_iter().map(|(k,p)|(k,mem.value(p,0).unwrap_or(Value::Null))).collect::<Map<_,_>>()))}else if name!="module.UiUtil"&&["str","dict","tuple","list","int"].contains(&kind.as_str()){mem.value(pointer,0).ok()}else{None};
                        values.insert(label,json!({"type":kind,"value":value}));
                    }
                }
                result.insert(name.into(),json!({"fields":values,"functions":functions}));
            }
            return Ok(Value::Object(result));
        }
        if config_name=="_spiritdata" {
            let mut data=Map::new();
            for(name,&pointer)in avatar.iter().chain(persistent.iter()).filter(|(name,_)|["hunling","qiling"].iter().any(|part|name.to_lowercase().contains(part))){
                data.insert(name.clone(),json!({"type":mem.name(pointer)?,"value":mem.value(pointer,0).unwrap_or(Value::Null)}));
            }
            let mut configs=Map::new();
            for(name,&module)in modules.iter().filter(|(name,_)|name.starts_with("com.data.cdata.")&&["hunling","qiling"].iter().any(|part|name.contains(part))){configs.insert(name.clone(),mem.config(module,None).unwrap_or(Value::Null));}
            data.insert("configs".into(),Value::Object(configs));
            return Ok(Value::Object(data));
        }
        if config_name=="_scrollkeys" {
            let mut data=Map::new();
            for(name,&pointer)in avatar.iter().chain(persistent.iter()).filter(|(name,_)|!name.contains("history")&&["huijuan","puzzle","story","scroll"].iter().any(|part|name.to_lowercase().contains(part))){let kind=mem.name(pointer)?;data.insert(name.clone(),json!({"type":kind,"value":mem.value(pointer,0).unwrap_or(Value::Null)}));}
            let mut module_fields=Map::new();
            for(name,&module)in modules.iter().filter(|(name,_)|["module.puzzle_info.PuzzleInfoLogic","ui.huijuan.HuiJuanPanel","ui.huijuan.HuiJuanStoryNewPanel","ui.huijuan.HuiJuanReviewPanel"].contains(&name.as_str())){
                let mut fields=Map::new();for(key,pointer)in mem.fields(module)?{let kind=mem.name(pointer)?;if !key.starts_with("__")&&!matches!(kind.as_str(),"function"|"module"|"type"){fields.insert(key,json!({"type":kind,"value":mem.value(pointer,0).unwrap_or(Value::Null)}));}}
                module_fields.insert(name.clone(),Value::Object(fields));
            }
            if let Some(&module)=modules.get("ui.huijuan.HuiJuanPanel"){
                let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();
                if let Some(&class)=fields.get("HuiJuanInfoMgr") {let dictionary=mem.ptr(class+264)?;let fields:HashMap<_,_>=mem.fields(dictionary)?.into_iter().collect();let mut globals=HashMap::new();if let Some(&function)=fields.get("instance"){let function=if ["classmethod","staticmethod"].contains(&mem.name(function)?.as_str()){mem.ptr(function+16)?}else{function};if mem.name(function)?=="function"{let namespace=mem.ptr(function+16)?;globals=mem.fields(namespace)?.into_iter().collect();}}data.insert("scrollGlobalKeys".into(),json!(globals.keys().filter(|k|k.contains("PAINT")||k.contains("instance")).collect::<Vec<_>>()));if let Some(&instance)=fields.get("m_instance").or_else(||globals.get("m_instance")){let mut cache=Map::new();for(key,pointer)in mem.fields(instance).unwrap_or_default(){if ["serverInfo","selfInfo","unlockDonation","rankInfo","oldSelfRankParam","oldRankListParam","hero_paint_dict"].contains(&key.as_str()){cache.insert(key,mem.value(pointer,0).unwrap_or(Value::Null));}}data.insert("scrollCache".into(),Value::Object(cache));}if let Some(&module)=globals.get("DATA_PAINTINGS"){data.insert("paintings".into(),mem.config(module,None).unwrap_or(Value::Null));}}
            }
            data.insert("paintingModules".into(),json!(modules.keys().filter(|name|name.contains("paint")||name.contains("HuiJuan")).collect::<Vec<_>>()));
            data.insert("moduleFields".into(),Value::Object(module_fields));return Ok(Value::Object(data));
        }
        if config_name=="_uimeta" || config_name=="_scrollmeta" {
            let mut result=vec![];
            for(name,&module)in modules.iter().filter(|(name,_)|if config_name=="_scrollmeta"{name.starts_with("ui.huijuan.")}else{["ui.PlayerIcon","ui.ItemIcon","headcode","module.commonicon.CommonIconMrg","module.dailytask.DailyTaskLogic","module.guild.tuizhi.GuildBossLogic","ui.shop.shop_libaowu_diedai.DailyLoginRewardCache","mapworld.map_new.RuneLevelLogic","module.fubenlevel.WeekendRune"].contains(&name.as_str())||name.contains("GuildTaskRecord")||name.contains("GuildDailyTask")}){
                let mut functions=mem.fields(module)?;
                for(label,pointer)in functions.clone(){if mem.name(pointer)?=="type"{let dictionary=mem.ptr(pointer+264)?;for(key,value)in mem.fields(dictionary)?{functions.push((format!("{label}.{key}"),value));}}}
                let mut index=0;while index<functions.len().min(2000){let(label,mut pointer)=functions[index].clone();index+=1;if ["classmethod","staticmethod"].contains(&mem.name(pointer)?.as_str()){pointer=mem.ptr(pointer+16)?;}if mem.name(pointer)?!="function"{continue;}if label.matches("wrapped").count()<3{let closure=mem.ptr(pointer+72)?;if closure!=0&&mem.name(closure)?=="tuple"{let count=mem.ptr(closure+16)?.min(20);for i in 0..count{let cell=mem.ptr(closure+24+i*8)?;let nested=mem.ptr(cell+16)?;if nested!=0&&mem.name(nested)?=="function"{functions.push((format!("{label}.wrapped{i}"),nested));}}}}let code=mem.ptr(pointer+48)?;let names=mem.ptr(code+32)?;let names=mem.value(names,0)?;let constants=mem.ptr(code+24)?;let constants=mem.code_constants(constants,0)?;result.push(json!({"module":name,"function":label,"names":names,"constants":constants}));}
            }
            return Ok(json!(result));
        }
        if config_name=="_routinekeys" {
            let mut keys=vec![];
            for(name,&pointer)in avatar.iter().chain(persistent.iter()).filter(|(name,_)|["task","daily","guild","boss","kylin","fengmo","assist","friend","shop","gift","coin","exp","godapp","dashen","cooper","donate","news","region","area"].iter().any(|part|name.to_lowercase().contains(part))){keys.push(json!({"name":name,"type":mem.name(pointer)?}));}
            return Ok(json!(keys));
        }
        if config_name=="_routinefacts" {
            let mut data=Map::new();
            for name in ["new_exp_coin_logic","godapp_reward","godapp_not_recvs","acc_pay_daily_reward_flag","guildDailyFinishList","guild_temp_data","friend_task","friend_donate_record","guild_help_info","guild_shop_log","daily_task","daily_task_timestamp","fengmo_guild_act_info","active_lbs_boss_list"] {
                if let Some(&pointer)=avatar.get(name).or_else(||persistent.get(name)){data.insert(name.into(),mem.value(pointer,0)?);}
            }
            let mut configs=Map::new();
            for name in ["godapp_task2","active_time","daily_gift","guild_task"]{if let Some(&module)=modules.get(&format!("com.data.cdata.{name}")){configs.insert(name.into(),mem.config(module,None)?);}}
            data.insert("configs".into(),Value::Object(configs));
            return Ok(Value::Object(data));
        }
        if config_name=="_guildtaskmeta" {
            let mut result=vec![];
            for(name,&module)in modules.iter().filter(|(name,_)|["module.guild.GuildLogic","avatarmembers.GuildMember"].contains(&name.as_str())){
                let mut functions=mem.fields(module)?;
                for(label,pointer)in functions.clone(){if mem.name(pointer)?=="type"{let dictionary=mem.ptr(pointer+264)?;for(key,value)in mem.fields(dictionary)?{functions.push((format!("{label}.{key}"),value));}}}
                let mut index=0;while index<functions.len().min(1000){let(label,mut pointer)=functions[index].clone();index+=1;if ["classmethod","staticmethod"].contains(&mem.name(pointer)?.as_str()){pointer=mem.ptr(pointer+16)?;}if mem.name(pointer)?!="function"{continue;}if label.to_lowercase().contains("task")&&label.matches("wrapped").count()<3{let closure=mem.ptr(pointer+72)?;if closure!=0&&mem.name(closure)?=="tuple"{let count=mem.ptr(closure+16)?.min(20);for i in 0..count{let cell=mem.ptr(closure+24+i*8)?;let nested=mem.ptr(cell+16)?;if nested!=0&&mem.name(nested)?=="function"{functions.push((format!("{label}.wrapped{i}"),nested));}}}}let code=mem.ptr(pointer+48)?;let names=mem.ptr(code+32)?;let names=mem.value(names,0)?;let constants=mem.ptr(code+24)?;let constants=mem.code_constants(constants,0)?;if ["task","finished","statics"].iter().any(|part|format!("{label}{names}{constants}").to_lowercase().contains(part)){result.push(json!({"module":name,"function":label,"names":names,"constants":constants}));}}
            }
            return Ok(json!(result));
        }
        if config_name=="_profilefacts" {
            let mut data=Map::new();
            for(name,&pointer)in avatar.iter().chain(persistent.iter()).filter(|(name,_)|["pvp","arena","score"].iter().any(|part|name.contains(part))){data.insert(name.clone(),json!({"type":mem.name(pointer)?,"value":if ["int","float"].contains(&mem.name(pointer)?.as_str()){mem.value(pointer,0)?}else{Value::Null}}));}
            return Ok(Value::Object(data));
        }
        if config_name=="_taskkeys" {
            let keys:Vec<_>=avatar.keys().chain(persistent.keys()).filter(|name|["task","daily","donate","prayer","pray","guild","cooperate","head","icon"].iter().any(|part|name.to_lowercase().contains(part))).collect();
            return Ok(json!({"keys":keys}));
        }
        if config_name=="_taskdata" {
            let mut data=Map::new();
            for name in ["godapp_task","dashen_task","guild_beg_times","guildDailyFinishList","guild_help_info","guild_help_heroes","guild_shop_log","guild_house","guild_temp_data","fengmo_guild_act_info","monster_task","monster_task_finished_record","monster_task_reset_time","friend_task","friend_donate_record","donate_infos","head_id","headIcon","headSkin","daily_task","daily_task_event","daily_task_timestamp"] {
                if let Some(&pointer)=avatar.get(name).or_else(||persistent.get(name)) { let value=mem.value(pointer,0).unwrap_or_else(|error|json!({"unreadType":mem.name(pointer).ok(),"error":error}));data.insert(name.into(),value); }
            }
            return Ok(Value::Object(data));
        }
        if config_name=="_guildkeys" {
            let module=*modules.get("module.guild.GuildLogic").ok_or("GuildLogic not loaded")?;
            let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();
            let detail=*fields.get("myGuildDetail").ok_or("Guild detail not loaded")?;
            let detail:HashMap<_,_>=mem.fields(detail)?.into_iter().collect();
            let mut member_keys=HashSet::new();
            if let Some(&members)=detail.get("members") { let count=mem.ptr(members+16)?.min(5);let start=mem.ptr(members+24)?;for i in 0..count { let pointer=mem.ptr(start+i*8)?;for(key,_)in mem.fields(pointer)? {member_keys.insert(key);} } }
            return Ok(json!({"module":fields.keys().collect::<Vec<_>>(),"detail":detail.keys().collect::<Vec<_>>(),"member":member_keys}));
        }
        if config_name=="_guilddata" {
            let module=*modules.get("module.guild.GuildLogic").ok_or("GuildLogic not loaded")?;
            let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();let mut data=Map::new();
            for name in ["weekly_feats","guild_task_info","guild_achieve_info","myTotalFeat","donateInfo"] { if let Some(&pointer)=fields.get(name) {data.insert(name.into(),mem.value(pointer,0).unwrap_or_else(|error|json!({"unreadType":mem.name(pointer).ok(),"error":error})));} }
            return Ok(Value::Object(data));
        }
        if config_name=="_cosmetics" {
            let mut data=Map::new();for name in ["converted_skin_ids","headIcon","headSkin","head_t","space_skin","battle_scene_skin"]{if let Some(&pointer)=avatar.get(name).or_else(||persistent.get(name)){data.insert(name.into(),mem.value(pointer,0)?);}}
            return Ok(Value::Object(data));
        }
        let module=*modules.get(&format!("com.data.cdata.{config_name}")).ok_or("research config module not loaded")?;
        if let Some(path)=std::env::var_os("PINGAN_RESEARCH_BLOB"){
            let fields:HashMap<_,_>=mem.fields(module)?.into_iter().collect();let object=*fields.get("bin_data").ok_or("missing bin_data")?;let native=mem.ptr(object+16)?;let bytes=mem.ptr(native)?;let n=mem.ptr(bytes+16)?;std::fs::write(path,mem.read(bytes+32,n)?).map_err(|e|e.to_string())?;
        }
        let research_keys=std::env::var("PINGAN_RESEARCH_KEYS").ok().map(|text|serde_json::from_str::<HashSet<String>>(&text).map_err(|e|e.to_string())).transpose()?;
        mem.config(module,research_keys.as_ref().or(if config_name=="skill"{Some(&keys)}else{None}))
    }
    pub fn capture_runtime(pid:u32)->Result<Value>{
        runtime_capture(open_client(pid)?,pid)
    }
    fn task_fields(mem:&mut Memory,modules:&HashMap<String,usize>,avatar:&HashMap<String,usize>,persistent:&HashMap<String,usize>,out:&mut Map<String,Value>)->Result<()>{
        for name in ["daily_task","daily_task_timestamp"]{if let Some(&pointer)=avatar.get(name).or_else(||persistent.get(name)){out.insert(name.into(),mem.value(pointer,0)?);}}
        let mut routine=Map::new();
        for name in ["godapp_task","dashen_task","guild_beg_times","guildDailyFinishList","guild_help_info","guild_house","monster_task","monster_task_reset_time"]{if let Some(&pointer)=avatar.get(name).or_else(||persistent.get(name)){routine.insert(name.into(),mem.value(pointer,0)?);}}
        out.insert("routineProgress".into(),Value::Object(routine));
        for(name,keys)in [("active_time",Some(HashSet::from(["guild_boss".to_string()]))),("godapp_task2",Some(HashSet::from(["201".to_string()]))),("daily_task",None)]{
            if let Some(&module)=modules.get(&format!("com.data.cdata.{name}")){out.get_mut("configs").ok_or("任务配置容器缺失")?[name]=mem.config(module,keys.as_ref())?;}
        }
        Ok(())
    }
    fn runtime_capture(client:Client,pid:u32)->Result<Value>{
        let Client{mut mem,modules,avatar,persistent,player,version}=client;
        let mut out=Map::new();out.insert("player".into(),mem.selected(player,&["_name","short_id","server_id"])?);
        runtime_fields(&mut mem,&modules,&avatar,&persistent,&mut out)?;
        for name in ["friend_lbs_card_time","friend_lbs_card_lock_time"]{if let Some(&p)=avatar.get(name){out.insert(name.into(),mem.value(p,0)?);}}
        if let Some(id)=out.get("set_other").and_then(|v|v["herouid"].as_str()){
            if let Some(&heroes)=avatar.get("heroes"){
                if let Some((_,hero))=mem.fields(heroes)?.into_iter().find(|(key,_)|key==id){let mut records=Map::new();records.insert(id.to_owned(),mem.selected(hero,&["_name"])?);out.insert("heroes".into(),Value::Object(records));}
            }
        }
        let mut configs=Map::new();let mut currency_keys=HashSet::new();let constant_keys=HashSet::from(["643".to_string()]);
        for name in ["JJCard","Constant","currency"]{if let Some(&module)=modules.get(&format!("com.data.cdata.{name}")){
            let keys=match name{"Constant"=>Some(&constant_keys),"currency"=>Some(&currency_keys),_=>None};let data=mem.config(module,keys)?;
            if name=="JJCard"{for row in data.as_object().into_iter().flatten().map(|(_,v)|v){for id in row["reward"].as_array().into_iter().flatten(){currency_keys.insert(id.as_str().map(str::to_owned).unwrap_or_else(||id.to_string()));}}}
            configs.insert(name.into(),data);
        }}
        out.insert("configs".into(),Value::Object(configs));
        task_fields(&mut mem,&modules,&avatar,&persistent,&mut out)?;
        out.insert("reader".into(),json!({"mode":"external-read-only","python":format!("{version:#x}"),"pid":pid,"capturedAt":chrono::Utc::now().to_rfc3339(),"milliseconds":mem.started.elapsed().as_millis()}));
        Ok(Value::Object(out))
    }
    pub fn capture(pid:u32)->Result<Value>{
        full_capture(open_client(pid)?,pid)
    }
    fn full_capture(client:Client,pid:u32)->Result<Value>{
        let Client{mut mem,modules,avatar,persistent,player,version}=client;
        let mut out=Map::new();
        out.insert("player".into(),mem.selected(player,&["_name","short_id","level","server_id","headIcon","headSkin","inventory_version","heroes_version"])?);
        for name in ["headIcon","headSkin","pvp_score"] { if out["player"].get(name).is_none() { if let Some(&pointer)=avatar.get(name).or_else(||persistent.get(name)) { out["player"][name]=mem.value(pointer,0)?; } } }
        for name in ["inventory","currency","currency_lgt","currency_n","heroes_bag","daily_task","daily_task_event","daily_task_reward","taskInfo","plotDupInfo","heroTeamPrefabs","heroTeamPrefabGroup","soulCards","lbscards","lbscards_bag","guild_info","daily_task_timestamp","daily_task_act_recved","new_daily_task_act_recv","lbs_room","friend_lbs_card_time","friend_lbs_card_lock_time","guild_week_feats","history_guild_donate","inventory_fold_logic","inventory_extend_logic","job_list","hunling_logic"]{
            let p=if name.ends_with("_logic"){persistent.get(name)}else{avatar.get(name).or_else(||persistent.get(name))};
            if let Some(&p)=p{out.insert(name.into(),mem.value(p,0)?);}
        }
        runtime_fields(&mut mem,&modules,&avatar,&persistent,&mut out)?;
        let hero_dict=*avatar.get("heroes").ok_or("游戏式神库存未载入")?;let mut heroes=Map::new();
        if let Some(&record)=avatar.get("recordparam").or_else(||persistent.get("recordparam")){
            let selected=mem.selected(record,&["can_not_donate_currency","locked_hero_piece"])?;
            out.insert("boundShards".into(),selected.get("can_not_donate_currency").cloned().unwrap_or(json!({})));
            out.insert("lockedShards".into(),selected.get("locked_hero_piece").cloned().unwrap_or(json!([])));
        }
        for(id,hero)in mem.fields(hero_dict)?{
            let selected=mem.selected(hero,&["heroId","_name","_level","_star","_awake","_equips","rattr","lock","skillList","_heroTempData","all_attrs"])?;
            // Keep only factual fields used in our own calculations.
            let mut selected=selected;
            if let Some(template)=selected.get_mut("_heroTempData").and_then(Value::as_object_mut){template.retain(|k,_|["type","rarity","attackDelta","defenseDelta","hpDelta","atkStarSt","defStarSt","hpStarSt","baseSpeed","baseCritRate","baseCritPower","debuffEnhance","awakeIncAttackDelta","awakeIncDefenseDelta","awakeIncHpDelta","awakeIncBaseSpeed","awakeIncBaseCritRate","awakeIncBaseCritPower","awakeAttr","book","needSuiPianId"].contains(&k.as_str()));}
            heroes.insert(id,selected);
        }
        out.insert("heroes".into(),Value::Object(heroes));
        let mut currency_keys:HashSet<String>=out.get("currency").and_then(Value::as_object).map(|v|v.iter().filter(|(_,n)|n.as_f64().is_some_and(|n|n>0.0)).map(|(k,_)|k.clone()).collect()).unwrap_or_default();
        let mut configs=Map::new();
        let constant_keys=HashSet::from(["643".to_string()]);
        for name in ["equip_init","equip_attr","equip_upgrade","equip_suit","JJCard","currency","hero","growth","star_level","daily_task","Constant","awakestory_cn","achieve_job"]{
            if let Some(&module)=modules.get(&format!("com.data.cdata.{name}")){
                let keys=match name{"currency"=>Some(&currency_keys),"Constant"=>Some(&constant_keys),_=>None};
                let mut data=mem.config(module,keys).map_err(|e|format!("{name}：{e}"))?;
                if name=="JJCard"{for row in data.as_object().into_iter().flatten().map(|(_,v)|v){for id in row["reward"].as_array().into_iter().flatten(){currency_keys.insert(id.as_str().map(str::to_owned).unwrap_or_else(||id.to_string()));}}}
                if name=="hero"{if let Some(rows)=data.as_object_mut(){for row in rows.values_mut(){if let Some(row)=row.as_object_mut(){row.retain(|k,_|["type","name","book","needSuiPianId","rarity","story"].contains(&k.as_str()));}}}}
                if ["awakestory_cn","achieve_job"].contains(&name){if let Some(rows)=data.as_object_mut(){for row in rows.values_mut(){if let Some(row)=row.as_object_mut(){row.retain(|k,_|["activityId","content","cond_val","reward"].contains(&k.as_str()));}}}}
                configs.insert(name.into(),data);
            }
        }
        out.insert("configs".into(),Value::Object(configs));
        task_fields(&mut mem,&modules,&avatar,&persistent,&mut out)?;
        if let Source::Android(memory)=&mut mem.source{memory.clear();}
        let after=mem.selected(player,&["inventory_version","heroes_version"])?;
        if ["inventory_version","heroes_version"].iter().any(|k|out["player"][k]!=after[k]){return Err("库存版本在读取过程中改变，请保持庭院界面重新读取".into());}
        out.insert("reader".into(),json!({"mode":"external-read-only","python":format!("{version:#x}"),"pid":pid,"capturedAt":chrono::Utc::now().to_rfc3339(),"milliseconds":mem.started.elapsed().as_millis()}));
        Ok(Value::Object(out))
    }
}
fn word(bytes:&[u8],at:usize)->std::result::Result<u32,String>{Ok(u32::from_le_bytes(bytes.get(at..at+4).ok_or("数据不完整")?.try_into().unwrap()))}
#[cfg(windows)]pub use windows::capture;
#[cfg(windows)]pub use windows::capture_runtime;
#[cfg(windows)]pub use windows::capture_android;
#[cfg(all(windows,test))]pub use windows::research_android;
#[cfg(all(windows,test))]pub use windows::research_desktop;
#[cfg(not(windows))]pub fn capture_android(_: &str,_: &str,_:u32,_:bool)->std::result::Result<serde_json::Value,String>{Err("模拟器读取当前仅支持 Windows".into())}
#[cfg(not(windows))]pub fn capture_runtime(_:u32)->std::result::Result<serde_json::Value,String>{Err("实时读取仅支持 Windows x64".into())}
#[cfg(not(windows))]pub fn capture(_:u32)->std::result::Result<serde_json::Value,String>{Err("实时读取仅支持 Windows x64".into())}

#[cfg(all(test,windows))]
mod tests{
    #[test]#[ignore="requires explicit rooted emulator runtime validation"]fn live_android_runtime_capture(){
        let root=std::env::var("PINGAN_MUMU_ROOT").unwrap();let serial=std::env::var("PINGAN_ADB_SERIAL").unwrap();let pid=std::env::var("PINGAN_ANDROID_PID").unwrap().parse().unwrap();let path=std::env::var("PINGAN_RUNTIME_PATH").unwrap();
        let raw=super::capture_android(&root,&serial,pid,true).unwrap();assert!(raw["inventory"].is_null());assert!(raw["routineProgress"].is_object());assert!(raw["daily_task_timestamp"].is_number());
        std::fs::write(path,serde_json::to_vec(&raw).unwrap()).unwrap();println!("Android runtime capture: {} ms",raw["reader"]["milliseconds"]);
    }
    #[test]#[ignore="requires explicit rooted emulator research"]fn live_skill_catalog(){
        let root=std::env::var("PINGAN_MUMU_ROOT").unwrap();let serial=std::env::var("PINGAN_ADB_SERIAL").unwrap();let pid=std::env::var("PINGAN_ANDROID_PID").unwrap().parse().unwrap();
        let facts=super::research_android(&root,&serial,pid).unwrap();let path=std::env::var("PINGAN_SKILL_PATH").unwrap();std::fs::write(path,serde_json::to_vec(&facts).unwrap()).unwrap();println!("Research records: {}",facts.as_object().map(|v|v.len()).or_else(||facts.as_array().map(|v|v.len())).unwrap_or(0));
    }
    #[test]#[ignore="requires explicit logged-in desktop game research"]fn live_desktop_catalog(){
        let pid=std::env::var("PINGAN_DESKTOP_PID").unwrap().parse().unwrap();let path=std::env::var("PINGAN_SKILL_PATH").unwrap();
        let facts=super::research_desktop(pid).unwrap();std::fs::write(path,serde_json::to_vec(&facts).unwrap()).unwrap();println!("Desktop research records: {}",facts.as_object().map(|v|v.len()).or_else(||facts.as_array().map(|v|v.len())).unwrap_or(0));
    }
    #[test]
    #[ignore = "requires a rooted Android emulator and explicit PINGAN_ANDROID_PATH"]
    fn live_android_capture(){
        let path=std::env::var("PINGAN_ANDROID_PATH").expect("explicit output path required");let root=std::env::var("PINGAN_MUMU_ROOT").unwrap();let serial=std::env::var("PINGAN_ADB_SERIAL").unwrap();let pid=std::env::var("PINGAN_ANDROID_PID").unwrap().parse().unwrap();
        let raw=super::capture_android(&root,&serial,pid,false).unwrap();std::fs::write(path,serde_json::to_vec(&raw).unwrap()).unwrap();let(doc,warnings)=crate::game_convert::convert(&raw).unwrap();println!("Android: {} souls, {} heroes, {} shards, {} ms; {:?}",doc.souls.len(),doc.heroes.len(),doc.shards.len(),raw["reader"]["milliseconds"],warnings);
    }
    #[test]
    #[ignore = "requires a running, logged-in game and PINGAN_RUNTIME_PATH"]
    fn live_runtime_capture(){
        let path=std::env::var("PINGAN_RUNTIME_PATH").expect("explicit output path required");
        let ps=crate::bridge::processes().unwrap();let pid=ps[0]["pid"].as_u64().expect("game must be running") as u32;
        let raw=super::capture_runtime(pid).unwrap();assert!(raw["inventory"].is_null());assert!(raw["player"]["short_id"].is_number());
        let status=crate::realm::status(&raw);let guild=crate::realm::guild(&raw);
        std::fs::write(path,serde_json::to_vec(&serde_json::json!({"raw":raw,"realmStatus":status,"guildSnapshot":guild})).unwrap()).unwrap();
        println!("Runtime capture: {} ms",raw["reader"]["milliseconds"]);
    }
    #[test]
    #[ignore = "requires a running, logged-in game and PINGAN_CAPTURE_PATH"]
    fn live_read_only_capture(){
        let path=std::env::var("PINGAN_CAPTURE_PATH").expect("explicit output path required");
        let ps=crate::bridge::processes().unwrap();let pid=ps[0]["pid"].as_u64().expect("game must be running") as u32;
        let raw=super::capture(pid).unwrap();
        std::fs::write(path,serde_json::to_vec(&raw).unwrap()).unwrap();
        println!("Captured {} souls and {} heroes; {} ms",raw["inventory"].as_object().map_or(0,|v|v.len()),raw["heroes"].as_object().map_or(0,|v|v.len()),raw["reader"]["milliseconds"]);
    }
}
