'use strict';
// Uses the capture app's IndexedDB and profile state; never puts files in GitHub.
const backupButton=make('button','outline','Update / Back up');backupButton.id='cloud-backup-open';
document.querySelector('.head-actions').prepend(backupButton);
const backupDialog=make('dialog','modal');backupDialog.id='cloud-backup-dialog';
backupDialog.innerHTML='<h2>Private cloud backup</h2><p class="sub">Back up all students’ names, teacher names, weekly homework notes, photos, audio, and videos. On another device, sign in with the same account and restore.</p><p id="cloud-backup-status" class="sub" role="status" style="margin-top:16px;white-space:pre-wrap"></p><a id="cloud-backup-signin" class="outline hidden" href="/signin-with-chatgpt?return_to=%2F%3Fbackup%3D1" target="_top">Sign in with ChatGPT</a><p class="footnote">Up to 1,000 files, 50 MB per file, and 500 MB per backup. Keep this screen open while transferring.<br>Restore replaces this device’s names and homework notes and adds missing files. Existing device files are kept. Backup is separate from sending homework to a teacher.</p><div class="row" style="flex-wrap:wrap"><button class="solid" id="cloud-backup-save" disabled>Back up now</button><button class="outline" id="cloud-backup-restore" disabled>Restore names, notes &amp; files</button><button class="outline" id="cloud-backup-close">Close</button></div>';
document.body.append(backupDialog);
let backupBusy=false,cloudBackupInfo=null;
const backupStatus=text=>{$('cloud-backup-status').textContent=text};
function backupControls(busy){backupBusy=busy;$('cloud-backup-save').disabled=busy||!cloudBackupInfo;$('cloud-backup-restore').disabled=busy||!cloudBackupInfo?.backup;$('cloud-backup-close').disabled=busy;}
async function backupJSON(action,body,params={}){
 const query=new URLSearchParams({action,...params}),options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
 const response=await fetch('/api/backup?'+query,{...options,cache:'no-store'});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Could not connect to cloud backup.'),{status:response.status});return data;
}
async function openCloudBackup(){
 if($('rec-dialog').open||sharing){toast('Finish recording or sharing before opening backup.');return;}
 backupDialog.showModal();cloudBackupInfo=null;backupControls(false);$('cloud-backup-signin').classList.add('hidden');backupStatus('Checking your cloud backup…');
 try{cloudBackupInfo=await backupJSON('status');const b=cloudBackupInfo.backup;backupStatus('Signed in as '+cloudBackupInfo.user+'.\n'+(b?'Last backup: '+new Date(b.savedAt).toLocaleString()+' · '+b.count+' file(s).':'No cloud backup yet. Choose Back up now on the device that has your files.'));backupControls(false);}
 catch(e){backupStatus(e.status===401?'Sign in to keep your backup private. Use the same ChatGPT account on every device.':e.message);if(e.status===401)$('cloud-backup-signin').classList.remove('hidden');}
}
backupButton.onclick=openCloudBackup;
$('cloud-backup-close').onclick=()=>backupDialog.close();backupDialog.addEventListener('cancel',e=>{if(backupBusy)e.preventDefault()});
$('cloud-backup-save').onclick=async()=>{
 if(backupBusy)return;backupControls(true);
 try{
  const records=await transact('readonly',s=>s.getAll());
  const entries=records.map(r=>{const blob=r.blob||new Blob([r.data],{type:r.mimeType||'application/octet-stream'});return {record:r,blob};});
  if(entries.some(e=>e.blob.size>50*1024*1024)||entries.reduce((n,e)=>n+e.blob.size,0)>500*1024*1024||entries.length>1000)throw new Error('Choose a smaller backup: up to 1,000 files, 50 MB per file, and 500 MB total. No files were removed.');
  const manifest={version:1,studentCount,studentNames:[...studentNames],teacherNames:[...teacherNames],memos:{...weeklyHomeworkMemos},files:entries.map(({record:r,blob})=>({id:r.id,name:r.name,originalName:r.originalName||'',studentId:r.studentId||'student-1',type:r.type,mimeType:blob.type||'application/octet-stream',savedAt:r.savedAt,size:blob.size}))};
  backupStatus('Starting backup of '+entries.length+' file(s)…');const {snapshot}=await backupJSON('begin',manifest);
  for(let i=0;i<entries.length;i++){
   const {record:r,blob}=entries[i];backupStatus('Uploading '+(i+1)+' of '+entries.length+'…\n'+r.name);
   const response=await fetch('/api/backup?'+new URLSearchParams({action:'upload',snapshot,id:r.id}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob});
   if(!response.ok){const error=await response.json();throw new Error(error.error||'File upload failed.');}
  }
  const result=await backupJSON('complete',{}, {snapshot});cloudBackupInfo.backup=result;backupStatus('Backup complete · '+result.count+' file(s).\n'+new Date(result.savedAt).toLocaleString()+'\nOn another device, sign in with the same account and choose Restore.');toast('Private cloud backup saved.');
 }catch(e){backupStatus(e.message+'\nYour device files were kept. An unfinished backup does not replace your previous completed backup.');}
 finally{backupControls(false);}
};
$('cloud-backup-restore').onclick=async()=>{
 if(backupBusy)return;backupControls(true);
 try{
  backupStatus('Reading your cloud backup…');const manifest=await backupJSON('manifest');const existing=await transact('readonly',s=>s.getAll()),ids=new Set(existing.map(r=>r.id));let restored=0;
  for(let i=0;i<manifest.files.length;i++){
   const file=manifest.files[i];if(ids.has(file.id))continue;backupStatus('Restoring '+(i+1)+' of '+manifest.files.length+'…\n'+file.name);
   const response=await fetch('/api/backup?'+new URLSearchParams({action:'file',snapshot:manifest.snapshot,id:file.id}),{cache:'no-store'});if(!response.ok)throw new Error('Could not download '+file.name+'. Retry Restore to continue.');
   const data=await response.arrayBuffer();if(data.byteLength!==file.size)throw new Error('Incomplete download. Retry Restore to continue.');
   await transact('readwrite',s=>s.put({...file,data}));restored++;
  }
  // Apply profile information only after every missing file was restored.
  const values={'work-station-students':JSON.stringify(manifest.studentNames),'work-station-teachers':JSON.stringify(manifest.teacherNames),'work-station-student-count':String(manifest.studentCount),'work-station-active-student':'0','work-station-weekly-homework-memos':JSON.stringify(manifest.memos)};
  const previous=Object.fromEntries(Object.keys(values).map(k=>[k,localStorage.getItem(k)]));
  try{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);}catch(e){for(const [key,value] of Object.entries(previous)){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}throw new Error('Files restored, but device storage could not save names and notes. Free some device space and retry.');}
  for(let i=0;i<4;i++){studentNames[i]=manifest.studentNames[i];teacherNames[i]=manifest.teacherNames[i];}studentCount=manifest.studentCount;activeStudent=0;weeklyHomeworkMemos=manifest.memos;selectedIds.clear();updateStudentTabs();await reload();
  backupStatus('Restore complete. '+restored+' missing file(s) added.\nStudent names, teacher names, and weekly notes restored. Existing device files were kept.');toast('Cloud backup restored.');
 }catch(e){backupStatus(e.message+'\nFiles already restored are kept. Retry Restore to continue.');}
 finally{backupControls(false);}
};
if(new URLSearchParams(location.search).get('backup')==='1'){history.replaceState(null,'',location.pathname);openCloudBackup();}
