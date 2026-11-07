import catalogue from './data/collections.json';
import type { Document } from './types';

export const collectionCategories: Record<string,string>={skin:'式神皮肤',onmyoji:'阴阳师皮肤',frame:'头像框',yard:'庭院',space:'空间装扮',paper:'小纸人'};
const categoryTypes:Record<number,string>={41:'skin',905:'onmyoji',903:'frame',924:'frame',904:'yard',912:'space',45:'paper'};
export interface CollectionItem {id:string;name:string;category:string;description:string;star:number|null}
export const collectionCatalogue=catalogue.items as CollectionItem[];
export const collectionSource=catalogue.source;

// Absence from a balance snapshot never proves an unlock is missing.
export function collectionBalances(data:Document|null|undefined):Map<string,number>{
 const result=new Map<string,number>();
 for(const resource of data?.resources??[]){const id=resource.name.match(/ · #(\d+)$/)?.[1];if(id&&Number.isFinite(resource.amount)&&resource.amount>0)result.set(id,resource.amount);}
 return result;
}
export function collectionItems(data:Document|null|undefined):CollectionItem[]{
 const items=new Map(collectionCatalogue.map(item=>[item.id,item]));
 const details=data?.extras?.resourceDetails as Record<string,{type?:number;description?:string}>|undefined;
 for(const resource of data?.resources??[]){
  const id=resource.name.match(/ · #(\d+)$/)?.[1];const category=id?categoryTypes[details?.[id]?.type??-1]:undefined;
  if(id&&category&&!items.has(id))items.set(id,{id,category,name:resource.name.replace(/ · #\d+$/,''),description:details?.[id]?.description?.replace(/<[^>]*>/g,'')??'',star:null});
 }
 return [...items.values()];
}
