import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const elements=new Map(),values=new Map(),uploads=[],windowEvents=new Map(),documentEvents=new Map(),timers=new Map();let timerId=0;
function element(){return {style:{},set id(value){elements.set(value,this);},classList:{add(){},remove(){}},append(){},prepend(){},after(){},showModal(){this.open=true},close(){this.open=false},addEventListener(){},open:false,disabled:false};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
let records=[{id:'one',studentId:'student-1',name:'Local renamed photo',originalName:'one.jpg',data:new TextEncoder().encode('first').buffer,mimeType:'image/jpeg',type:'image',savedAt:1},{id:'two',studentId:'student-4',name:'Student four audio',originalName:'two.m4a',data:new TextEncoder().encode('voice').buffer,mimeType:'audio/mp4',type:'audio',savedAt:2}];
let savedManifest,failDownload=false,latest=null,beginCount=0,offline=false;
const context={console,Blob,URLSearchParams,crypto:globalThis.crypto,TextEncoder,Uint8Array,setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),window:{addEventListener:(name,fn)=>windowEvents.set(name,fn)},location:{search:'',pathname:'/'},history:{replaceState(){}},make:element,$:get,document:{querySelector:element,body:element(),createTextNode:text=>text,addEventListener:(name,fn)=>documentEvents.set(name,fn),visibilityState:'visible'},sharing:false,toast(){},Date,Set,Object,JSON,Error,
 studentNames:['Mina','Jin','','Hidden student'],teacherNames:['Hana','Sun','','Teacher four'],studentCount:2,activeStudent:0,weeklyHomeworkMemos:{'student-1:2026-10-12':'Read'},selectedIds:new Set(),updateStudentTabs(){},async reload(){},localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
 async transact(mode,fn){return fn({getAll:()=>records.slice(),put:r=>{records.push(r);return r;}});},
 async fetch(url,options={}){const q=new URL(url,'https://school.test').searchParams,action=q.get('action');
  if(action==='status'){if(offline)throw Error('Offline');return Response.json({user:'Parent',accountKey:'parent-account',backup:latest});}
  if(action==='begin'){savedManifest=JSON.parse(options.body);beginCount++;return Response.json({snapshot:'snapshot-'+beginCount,uploadIds:savedManifest.files.filter(f=>!latest||!['one','two'].includes(f.id)).map(f=>f.id)});}
  if(action==='upload'){uploads.push(q.get('id'));return Response.json({ok:true});}
  if(action==='complete'){latest={snapshot:q.get('snapshot'),savedAt:3,count:savedManifest.files.length};return Response.json(latest);}
  if(action==='manifest')return Response.json({...savedManifest,studentNames:['Restored Mina','Jin','','Hidden student'],memos:{'student-1:2026-10-12':'Restored note'},snapshot:latest.snapshot,savedAt:3});
  if(action==='file'){if(failDownload)return new Response('failure',{status:500});return new Response(q.get('id')==='one'?'first':'voice');}
  throw Error('Unexpected action '+action);
 }
};vm.createContext(context);vm.runInContext(fs.readFileSync('public/cloud-backup.js','utf8'),context);
await get('cloud-backup-open').onclick();await get('cloud-backup-save').onclick();assert.deepEqual(uploads,['one','two']);assert.equal(savedManifest.files[1].studentId,'student-4');assert.deepEqual(savedManifest.memos,{'student-1:2026-10-12':'Read'});
records=records.slice(0,1);failDownload=true;await get('cloud-backup-restore').onclick();assert.equal(context.studentNames[0],'Mina');assert.equal(records.length,1);
failDownload=false;await get('cloud-backup-restore').onclick();assert.equal(records.length,2);assert.equal(records[0].name,'Local renamed photo');assert.equal(context.studentNames[0],'Restored Mina');assert.equal(context.weeklyHomeworkMemos['student-1:2026-10-12'],'Restored note');assert.equal(new TextDecoder().decode(records[1].data),'voice');
await get('cloud-backup-restore').onclick();assert.equal(records.length,2);
console.log('PASS: backs up all student tabs, restores missing files without duplicates, keeps existing files, preserves profiles on incomplete restore, restores names and weekly notes.');
await vm.runInContext('runCloudBackup(true)',context);const currentCount=beginCount;await vm.runInContext('runCloudBackup(true)',context);assert.equal(beginCount,currentCount,'unchanged data is not uploaded again');
context.weeklyHomeworkMemos['student-1:2026-10-12']='New homework';await vm.runInContext('runCloudBackup(true)',context);assert.equal(beginCount,currentCount+1);assert.equal(savedManifest.memos['student-1:2026-10-12'],'New homework');assert.equal(uploads.length,2,'notes-only change does not reupload existing files');
context.weeklyHomeworkMemos['student-1:2026-10-12']='Offline edit';offline=true;await vm.runInContext('runCloudBackup(true)',context);assert.equal(beginCount,currentCount+1);offline=false;await vm.runInContext('runCloudBackup(true)',context);assert.equal(beginCount,currentCount+2);
latest.snapshot='newer-on-other-device';records=[];await vm.runInContext('runCloudBackup(true)',context);assert.equal(beginCount,currentCount+2,'an older or empty device cannot overwrite newer cloud data');
assert(windowEvents.has('online'));assert(windowEvents.has('pageshow'));assert(windowEvents.has('pagehide'));assert(windowEvents.has('homework-data-changed'));assert(documentEvents.has('visibilitychange'));
context.document.visibilityState='hidden';documentEvents.get('visibilitychange')();await new Promise(resolve=>setImmediate(resolve));
values.set('work-station-auto-backup','off');await vm.runInContext('runCloudBackup(true)',context);assert.equal(beginCount,currentCount+2);
console.log('PASS: automatic backup after changes, unchanged-data skip, offline retry, stale-device protection, open/close lifecycle hooks, opt-out.');
