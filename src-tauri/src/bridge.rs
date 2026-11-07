use serde_json::{json,Value};

#[cfg(windows)]
pub fn processes()->Result<Value,String>{
    use windows_sys::Win32::{Foundation::{CloseHandle,INVALID_HANDLE_VALUE},System::Diagnostics::ToolHelp::*};
    unsafe{
        let snap=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);if snap==INVALID_HANDLE_VALUE{return Err(std::io::Error::last_os_error().to_string());}
        let mut entry:PROCESSENTRY32W=std::mem::zeroed();entry.dwSize=std::mem::size_of_val(&entry)as u32;let mut rows=vec![];let mut ok=Process32FirstW(snap,&mut entry);
        while ok!=0{let name=String::from_utf16_lossy(&entry.szExeFile[..entry.szExeFile.iter().position(|c|*c==0).unwrap_or(entry.szExeFile.len())]);if name.eq_ignore_ascii_case("onmyoji.exe"){rows.push(json!({"pid":entry.th32ProcessID,"name":name}));}ok=Process32NextW(snap,&mut entry);}CloseHandle(snap);Ok(json!(rows))
    }
}
#[cfg(not(windows))]pub fn processes()->Result<Value,String>{Ok(json!([]))}
