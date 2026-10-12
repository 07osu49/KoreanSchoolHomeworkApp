type User={userId:string;displayName:string;email:string};
type Bindings={DB?:D1Database;BUCKET?:R2Bucket};
export const MAX_BYTES=50*1024*1024;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function canAccess(student:any,userId:string){return !!student&&(student.teacher_id===userId||student.parent_id===userId)}
export function messageRole(student:any,userId:string){if(!student)return null;if(student.teacher_id===userId)return 'teacher';if(student.parent_id===userId)return 'parent';return null}
export function validFileType(type:string){return /^(image|audio|video)\//.test(type)&&!['image/svg+xml'].includes(type.toLowerCase())}
async function digest(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
const invite=()=>crypto.randomUUID().replaceAll('-','');
const text=(value:any,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
export async function handleExchange(request:Request,env:Bindings,user:User|null):Promise<Response>{
 const url=new URL(request.url),action=url.searchParams.get('action')||'me';
 if(!user)return json({error:'Sign in to use private homework exchange.',code:'signin_required'},401);
 if(!env.DB||!env.BUCKET)return json({error:'Online storage is not available yet.'},503);
 const db=env.DB,bucket=env.BUCKET;
 if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return json({error:'Request origin is not allowed.'},403);
 try{
 if(request.method==='GET'&&action==='me'){
  const result=await db.prepare('SELECT id,name,teacher_id,teacher_name,parent_id,parent_name,created_at FROM students WHERE teacher_id=? OR parent_id=? ORDER BY created_at').bind(user.userId,user.userId).all();
  return json({user:{name:user.displayName},students:result.results.map((s:any)=>({id:s.id,name:s.name,role:messageRole(s,user.userId),teacherName:s.teacher_name,parentName:s.parent_name,connected:!!s.parent_id}))});
 }
 if(request.method==='GET'&&action==='messages'){
  const student=await db.prepare('SELECT * FROM students WHERE id=?').bind(url.searchParams.get('student')).first();if(!canAccess(student,user.userId))return json({error:'This student is not connected to your account.'},404);
  const rows=await db.prepare('SELECT id,sender_role,body,created_at FROM messages WHERE student_id=? ORDER BY created_at DESC LIMIT 100').bind((student as any).id).all();
  const result=[];for(const m of rows.results as any[]){const a=await db.prepare('SELECT id,file_name,mime_type,size_bytes FROM attachments WHERE message_id=?').bind(m.id).all();result.push({...m,attachments:a.results})}
  return json({messages:result.reverse()});
 }
 if(request.method==='GET'&&action==='file'){
  const a=await db.prepare('SELECT a.*,s.teacher_id,s.parent_id FROM attachments a JOIN messages m ON m.id=a.message_id JOIN students s ON s.id=m.student_id WHERE a.id=?').bind(url.searchParams.get('id')).first();if(!canAccess(a,user.userId))return json({error:'File not found.'},404);
  const object=await bucket.get((a as any).storage_key);if(!object)return json({error:'File not found.'},404);
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent((a as any).file_name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method!=='POST')return json({error:'Unknown request.'},404);
 if(action==='send'){
  const contentLength=Number(request.headers.get('content-length')||0);if(contentLength>MAX_BYTES+1024*1024)return json({error:'Choose files totaling 50 MB or less.'},413);
  const form=await request.formData(),studentId=text(form.get('student'),100),body=text(form.get('body'),2000);
  const student:any=await db.prepare('SELECT * FROM students WHERE id=?').bind(studentId).first();const role=messageRole(student,user.userId);if(!role)return json({error:'This student is not connected to your account.'},404);if(!student.parent_id)return json({error:'The parent must connect using the invitation code before files can be sent.'},409);
  const files=form.getAll('files').filter(f=>f instanceof File) as File[];if(files.length>8)return json({error:'Send up to 8 files at once.'},400);if(!body&&!files.length)return json({error:'Add a message or at least one file.'},400);
  if(files.some(f=>!validFileType(f.type)||!f.size))return json({error:'Choose non-empty photos, videos, or voice recordings.'},400);if(files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)return json({error:'Choose files totaling 50 MB or less.'},413);
  const messageId=crypto.randomUUID(),created=Date.now(),objects:string[]=[],statements=[db.prepare('INSERT INTO messages (id,student_id,sender_id,sender_role,body,created_at) VALUES (?,?,?,?,?,?)').bind(messageId,studentId,user.userId,role,body,created)];
  try{for(const file of files){const id=crypto.randomUUID(),key='homework/'+studentId+'/'+messageId+'/'+id;objects.push(key);await bucket.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});statements.push(db.prepare('INSERT INTO attachments (id,message_id,file_name,mime_type,storage_key,size_bytes) VALUES (?,?,?,?,?,?)').bind(id,messageId,file.name.slice(0,220),file.type,key,file.size))}await db.batch(statements)}catch(error){await Promise.allSettled(objects.map(key=>bucket.delete(key)));throw error}
  return json({sent:true,messageId},201);
 }
 const body:any=await request.json();
 if(action==='invite'){
  const name=text(body.name,80);if(!name)return json({error:'Enter the student name.'},400);const code=invite(),id=crypto.randomUUID(),expires=Date.now()+14*86400000;
  await db.prepare('INSERT INTO students (id,name,teacher_id,teacher_name,invite_hash,invite_expires,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,name,user.userId,user.displayName,await digest(code),expires,Date.now()).run();return json({student:{id,name},code,expires},201);
 }
 if(action==='renew'){
  const student:any=await db.prepare('SELECT * FROM students WHERE id=? AND teacher_id=?').bind(text(body.student,100),user.userId).first();if(!student)return json({error:'Student not found.'},404);if(student.parent_id)return json({error:'This parent is already connected.'},409);
  const code=invite(),expires=Date.now()+14*86400000;await db.prepare('UPDATE students SET invite_hash=?,invite_expires=? WHERE id=? AND teacher_id=? AND parent_id IS NULL').bind(await digest(code),expires,student.id,user.userId).run();return json({code,expires,student:{id:student.id,name:student.name}});
 }
 if(action==='join'){
  const code=text(body.code,80).replace(/[\s-]/g,'').toLowerCase();if(!/^[a-f0-9]{32}$/.test(code))return json({error:'Enter the invitation code from your child’s teacher.'},400);
  const hash=await digest(code),student:any=await db.prepare('SELECT * FROM students WHERE invite_hash=? AND invite_expires>? AND parent_id IS NULL').bind(hash,Date.now()).first();if(!student)return json({error:'This invitation has expired or has already been used. Ask the teacher for a new code.'},400);if(student.teacher_id===user.userId)return json({error:'Use a separate parent account to accept this invitation.'},400);
  const result=await db.prepare('UPDATE students SET parent_id=?,parent_name=?,invite_hash=NULL,invite_expires=NULL WHERE id=? AND invite_hash=? AND parent_id IS NULL AND invite_expires>?').bind(user.userId,user.displayName,student.id,hash,Date.now()).run();if(!result.meta.changes)return json({error:'This invitation is no longer available.'},409);return json({connected:true,student:{id:student.id,name:student.name,teacherName:student.teacher_name}});
 }
 return json({error:'Unknown request.'},404);
 }catch(error){console.error('Homework exchange failed',error instanceof Error?error.name:'error');return json({error:'The request could not be completed. Please try again.'},500)}
}
