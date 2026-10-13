type User={userId:string;displayName:string};
type Bindings={BUCKET?:R2Bucket};
const MAX_FILE=50*1024*1024,MAX_TOTAL=500*1024*1024;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const idOK=(id:unknown)=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const stringOK=(s:unknown,n:number)=>typeof s==='string'&&s.length<=n;
async function boundedBytes(request:Request,limit:number){
 const bytes=new Uint8Array(limit);let size=0;const reader=request.body?.getReader();if(!reader)return bytes.subarray(0,0);
 try{while(true){const {done,value}=await reader.read();if(done)break;if(size+value.length>limit){await reader.cancel();throw new Error('Request is too large.');}bytes.set(value,size);size+=value.length;}}finally{reader.releaseLock();}
 return bytes.subarray(0,size);
}
export function validBackup(m:any){
 if(!m||m.version!==1||!Number.isInteger(m.studentCount)||m.studentCount<1||m.studentCount>4)return false;
 if(![m.studentNames,m.teacherNames].every(a=>Array.isArray(a)&&a.length===4&&a.every(s=>stringOK(s,80))))return false;
 if(!m.memos||typeof m.memos!=='object'||Array.isArray(m.memos)||Object.keys(m.memos).length>1000||Object.entries(m.memos).some(([k,v])=>!/^student-[1-4]:\d{4}-\d{2}-\d{2}$/.test(k)||!stringOK(v,4000)))return false;
 if(!Array.isArray(m.files)||m.files.length>1000)return false;
 const ids=new Set();let total=0;
 for(const f of m.files){if(!f||!idOK(f.id)||ids.has(f.id)||!stringOK(f.name,250)||!stringOK(f.originalName,250)||!/^student-[1-4]$/.test(f.studentId)||!['image','audio','video'].includes(f.type)||!stringOK(f.mimeType,150)||!Number.isFinite(f.savedAt)||f.savedAt<0||!Number.isInteger(f.size)||f.size<1||f.size>MAX_FILE)return false;ids.add(f.id);total+=f.size;}
 return total<=MAX_TOTAL;
}
export async function handleBackup(request:Request,env:Bindings,user:User|null):Promise<Response>{
 if(!user)return json({error:'Sign in to back up or restore your files.',code:'signin_required'},401);
 if(!env.BUCKET)return json({error:'Cloud backup storage is unavailable.'},503);
 const url=new URL(request.url),action=url.searchParams.get('action')||'status',bucket=env.BUCKET;
 if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return json({error:'Request origin is not allowed.'},403);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const root='private-backups/'+hash+'/',latestKey=root+'latest.json';
 try{
  if(request.method==='GET'&&action==='status'){
   const obj=await bucket.get(latestKey),latest:any=obj?await obj.json():null;
   return json({user:user.displayName,accountKey:hash,backup:latest?{snapshot:latest.snapshot,savedAt:latest.savedAt,count:latest.count}:null});
  }
  if(request.method==='GET'&&(action==='manifest'||action==='file')){
   const pointer=await bucket.get(latestKey);if(!pointer)return json({error:'No cloud backup yet.'},404);
   const latest:any=await pointer.json();
   // A restore pins its snapshot, even if another device finishes a new backup.
   const snapshot=url.searchParams.get('snapshot')||latest.snapshot;if(!idOK(snapshot))return json({error:'Invalid backup.'},400);
   const obj=await bucket.get(root+snapshot+'/manifest.json');if(!obj)return json({error:'Backup not found.'},404);const m:any=await obj.json();
   if(action==='manifest')return json(m);
   const id=url.searchParams.get('id'),f=m.files.find((f:any)=>f.id===id);if(!f)return json({error:'File not found.'},404);
   const file=await bucket.get(root+(f.storageSnapshot||snapshot)+'/files/'+f.id);if(!file)return json({error:'File not found.'},404);
   return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method!=='POST')return json({error:'Unknown request.'},404);
  if(action==='begin'){
   if(Number(request.headers.get('content-length'))>5*1024*1024)return json({error:'Backup information is too large.'},413);
   const m=JSON.parse(new TextDecoder().decode(await boundedBytes(request,5*1024*1024)));if(!validBackup(m))return json({error:'Backup supports up to 1,000 files, 50 MB per file, and 500 MB total. Check student information and file names.'},400);
   const pointer=await bucket.get(latestKey),latest:any=pointer?await pointer.json():null;
   if(m.expectedSnapshot!==undefined&&m.expectedSnapshot!==(latest?.snapshot||null))return json({error:'A newer cloud backup is available. Restore it before automatic backup continues.'},409);
   const previous=latest?await bucket.get(root+latest.snapshot+'/manifest.json'):null,old:any=previous?await previous.json():null;
   const snapshot=crypto.randomUUID(),manifest={version:1,studentCount:m.studentCount,studentNames:m.studentNames,teacherNames:m.teacherNames,memos:m.memos,files:m.files.map((f:any)=>{
    const same=old?.files.find((p:any)=>p.id===f.id&&p.size===f.size&&p.mimeType===f.mimeType);
    return {id:f.id,name:f.name,originalName:f.originalName,studentId:f.studentId,type:f.type,mimeType:f.mimeType,savedAt:f.savedAt,size:f.size,...(same?{storageSnapshot:same.storageSnapshot||latest.snapshot}:{})};
   }),snapshot,savedAt:Date.now(),baseEtag:pointer?.etag||null};
   await bucket.put(root+snapshot+'/pending.json',JSON.stringify(manifest));return json({snapshot,uploadIds:manifest.files.filter((f:any)=>!f.storageSnapshot).map((f:any)=>f.id)});
  }
  const snapshot=url.searchParams.get('snapshot');if(!idOK(snapshot))return json({error:'Invalid backup.'},400);
  const pending=await bucket.get(root+snapshot+'/pending.json');if(!pending)return json({error:'Start a new backup.'},404);
  const m:any=await pending.json();
  if(action==='upload'){
   const id=url.searchParams.get('id'),f=m.files.find((f:any)=>f.id===id);if(!f)return json({error:'File not in this backup.'},404);
   const length=Number(request.headers.get('content-length')||0);if(length>MAX_FILE)return json({error:'File is larger than 50 MB.'},413);
   const bytes=await boundedBytes(request,f.size);if(bytes.byteLength!==f.size)return json({error:'File size does not match the backup.'},400);
   await bucket.put(root+snapshot+'/files/'+f.id,bytes);return json({ok:true});
  }
  if(action==='complete'){
   for(const f of m.files){const obj=await bucket.head(root+(f.storageSnapshot||snapshot)+'/files/'+f.id);if(!obj||obj.size!==f.size)return json({error:'Some files have not finished uploading. Your previous backup is still available.'},409);}
   const pointer=await bucket.head(latestKey);if((pointer?.etag||null)!==m.baseEtag)return json({error:'Another device updated your cloud backup. Restore the newer backup before continuing.'},409);
   delete m.baseEtag;
   await bucket.put(root+snapshot+'/manifest.json',JSON.stringify(m));
   const updated=await bucket.put(latestKey,JSON.stringify({snapshot,savedAt:m.savedAt,count:m.files.length}),{onlyIf:pointer?{etagMatches:pointer.etag}:{etagDoesNotMatch:'*'}});
   if(!updated)return json({error:'Another device updated your cloud backup. Restore the newer backup before continuing.'},409);
   await bucket.delete(root+snapshot+'/pending.json');return json({ok:true,snapshot,savedAt:m.savedAt,count:m.files.length});
  }
  return json({error:'Unknown request.'},404);
 }catch{return json({error:'Cloud backup failed. Your device files and previous completed backup are safe. Try again.'},500);}
}
