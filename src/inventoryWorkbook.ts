import type {Document,Soul} from './types';
import {attrs,labels,percent} from './types';
export interface InventoryExport {souls:Soul[];data:Document;owners:Map<string,string>;discarded:Set<string>;values:Map<string,{score:number|null;growth:number|null}>;metadata:[string,string|number][]}
export async function inventoryWorkbook(input:InventoryExport):Promise<Uint8Array>{
 const {default:ExcelJS}=await import('exceljs');
 const book=new ExcelJS.Workbook();book.creator='平安手札';book.created=new Date();
 const sheet=book.addWorksheet('御魂筛选结果',{views:[{state:'frozen',xSplit:2,ySplit:1}]});
 const attributeColumns=(prefix:string)=>attrs.map(key=>`${prefix}·${labels[key]}${percent.has(key)?' (%)':''}`);
 const headers=['实例编号','套装','号位','星级','等级','装备式神','锁定','本地弃置','主属性','主属性数值','成长总分','自定义参考评分',...attributeColumns('副属性'),...attributeColumns('固有属性')];
 sheet.columns=headers.map((header,i)=>({header,width:i===0?28:i===1||i===5?20:i===8?18:16}));
 for(const soul of input.souls){const value=input.values.get(soul.id);sheet.addRow([soul.id,soul.set,soul.slot,soul.quality,soul.level,input.owners.get(soul.equipped)??soul.equipped,soul.locked?'是':'否',input.discarded.has(soul.id)?'是':'否',labels[soul.main]??soul.main,soul.value,value?.growth??null,value?.score??null,...attrs.map(key=>soul.sub[key]??null),...attrs.map(key=>soul.innate?.[key]??null)]);}
 sheet.autoFilter={from:{row:1,column:1},to:{row:input.souls.length+1,column:headers.length}};
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF355BB5'}};sheet.getRow(1).height=30;
 for(let i=10;i<=headers.length;i++)sheet.getColumn(i).numFmt='0.000';
 const info=book.addWorksheet('导出说明');info.columns=[{header:'项目',width:30},{header:'内容',width:100}];
 info.addRows([['档案名称',input.data.name],['导出时间',new Date().toISOString()],['导出数量',input.souls.length],...input.metadata,['导出范围','当前全部筛选结果，包含未显示的后续分页；按当前界面顺序排列。'],['数据说明','空白数值表示属性不存在或尚未读取，不替换为 0；副属性和固有属性分别列出。'],['百分比单位','标注 (%) 的单元格已使用游戏面板百分数，例如暴击 15 表示 15%。主属性数值单位由主属性名称确定。'],['评分说明','成长总分和自定义参考评分沿用当前界面结果；不代表实战伤害或官方算法。']]);
 info.getRow(1).font={bold:true};info.getColumn(2).alignment={wrapText:true,vertical:'top'};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
