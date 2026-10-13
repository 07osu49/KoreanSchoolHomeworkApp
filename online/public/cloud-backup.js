'use strict';
// Uses the capture app's IndexedDB and profile state; never puts files in GitHub.
const backupButton=make('button','outline','Update / Back up');backupButton.id='cloud-backup-open';
document.querySelector('.head-actions').prepend(backupButton);
const autoBackupLabel=make('p','footnote','Auto backup: checking…');autoBackupLabel.id='auto-backup-status';
document.querySelector('.library-head').after(autoBackupLabel);
const backupDialog=make('dialog','modal');backupDialog.id='cloud-backup-dialog';
backupDialog.innerHTML='<h2>Private cloud backup</h2><p class="sub">Back up all students’ names, teacher names, weekly homework notes, photos, audio, and videos. On another device, sign in with the same account and restore.</p><p id="cloud-backup-status" class="sub" role="status" style="margin-top:16px;white-space:pre-wrap"></p><a id="cloud-backup-signin" class="outline hidden" href="/signin-with-chatgpt?return_to=%2F%3Fbackup%3D1" target="_top">Sign in with ChatGPT</a><p class="footnote">Up to 1,000 files, 50 MB per file, and 500 MB per backup. Keep this screen open while transferring.<br>Restore replaces this device’s names and homework notes and adds missing files. Existing device files are kept. Backup is separate from sending homework to a teacher.</p><div class="row" style="flex-wrap:wrap"><button class="solid" id="cloud-backup-save" disabled>Back up now</button><button class="outline" id="cloud-backup-restore" disabled>Restore names, notes &amp; files</button><button class="outline" id="cloud-backup-close">Close</button></div>';
document.body.append(backupDialog);
let backupBusy=false,cloudBackupInfo=null;
let autoBackupTimer,autoBackupQueued=false,backupBaselineMemory={};
function autoBackupEnabled(){try{return localStorage.getItem('work-station-auto-backup')!=='off'}catch{return true}}
function autoBackupStatus(message){autoBackupLabel.textContent='Auto backup: '+message;}
function baselineKey(){return 'work-station-backup-baseline:'+(cloudBackupInfo?.accountKey||'current')}
function getBackupBaseline(){const key=baselineKey();if(Object.hasOwn(backupBaselineMemory,key))return backupBaselineMemory[key];try{const baseline=JSON.parse(localStorage.getItem(key)||'null');backupBaselineMemory[key]=baseline;return baseline}catch{return null}}
function rememberBackup(snapshot,fingerprint){const baseline={snapshot,fingerprint};backupBaselineMemory[baselineKey()]=baseline;try{localStorage.setItem(baselineKey(),JSON.stringify(baseline));localStorage.removeItem('work-station-auto-backup-pending')}catch{}}
async function backupFingerprint(manifest){const normalized={...manifest,files:[...manifest.files].sort((a,b)=>a.id.localeCompare(b.id)),memos:Object.fromEntries(Object.entries(manifest.memos).sort(([a],[b])=>a.localeCompare(b)))};delete normalized.expectedSnapshot;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalized)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function localBackupData(){const records=await transact('readonly',s=>s.getAll());const entries=records.map(r=>({record:r,blob:r.blob||new Blob([r.data],{type:r.mimeType||'application/octet-stream'})}));return {entries,manifest:{version:1,studentCount,studentNames:[...studentNames],teacherNames:[...teacherNames],memos:{...weeklyHomeworkMemos},files:entries.map(({record:r,blob})=>({id:r.id,name:r.name,originalName:r.originalName||'',studentId:r.studentId||'student-1',type:r.type,mimeType:blob.type||'application/octet-stream',savedAt:r.savedAt,size:blob.size}))}};}
const backupStatus=text=>{$('cloud-backup-status').textContent=text};
function backupControls(busy){backupBusy=busy;$('cloud-backup-save').disabled=busy||!cloudBackupInfo;$('cloud-backup-restore').disabled=busy||!cloudBackupInfo?.backup;$('cloud-backup-close').disabled=busy;}
async function backupJSON(action,body,params={}){
 const query=new URLSearchParams({action,...params}),options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
 const response=await fetch('/api/backup?'+query,{...options,cache:'no-store'});let data;try{data=await response.json()}catch{throw new Error('Cloud backup requires the online app and an internet connection.')}if(!response.ok)throw Object.assign(new Error(data.error||'Could not connect to cloud backup.'),{status:response.status});return data;
}
async function openCloudBackup(){
 if(backupBusy){backupDialog.showModal();return;}
 if($('rec-dialog').open||sharing){toast('Finish recording or sharing before opening backup.');return;}
 backupDialog.showModal();cloudBackupInfo=null;backupControls(false);$('cloud-backup-signin').classList.add('hidden');backupStatus('Checking your cloud backup…');
 try{cloudBackupInfo=await backupJSON('status');const b=cloudBackupInfo.backup;backupStatus('Signed in as '+cloudBackupInfo.user+'.\n'+(b?'Last backup: '+new Date(b.savedAt).toLocaleString()+' · '+b.count+' file(s).':'No cloud backup yet. Choose Back up now on the device that has your files.'));backupControls(false);}
 catch(e){backupStatus(e.status===401?'Sign in to keep your backup private. Use the same ChatGPT account on every device.':e.message);if(e.status===401)$('cloud-backup-signin').classList.remove('hidden');}
}
backupButton.onclick=openCloudBackup;
$('cloud-backup-close').onclick=()=>backupDialog.close();backupDialog.addEventListener('cancel',e=>{if(backupBusy)e.preventDefault()});
async function runCloudBackup(automatic=false){
 if(backupBusy){if(automatic)autoBackupQueued=true;return;}if(automatic&&!autoBackupEnabled()){autoBackupStatus('off');return;}
 if(automatic&&($('rec-dialog').open||sharing)){scheduleAutoBackup(5000);return;}
 backupControls(true);
 try{
  cloudBackupInfo=await backupJSON('status');const {entries,manifest}=await localBackupData();const fingerprint=await backupFingerprint(manifest),baseline=getBackupBaseline(),remote=cloudBackupInfo.backup;
  if(automatic&&remote&&(!baseline||baseline.snapshot!==remote.snapshot)){autoBackupStatus('newer cloud backup available — tap Update / Back up to restore first.');return;}
  if(automatic&&remote&&baseline?.fingerprint===fingerprint){autoBackupStatus('up to date · '+new Date(remote.savedAt).toLocaleString());return;}
  if(automatic&&!remote&&!entries.length&&!Object.values(manifest.memos).some(Boolean)&&manifest.studentCount===1&&manifest.studentNames.join('|')==='Eina|||'&&!manifest.teacherNames.some(Boolean)){autoBackupStatus('ready — save homework or student details to start.');return;}
  if(entries.some(e=>e.blob.size>50*1024*1024)||entries.reduce((n,e)=>n+e.blob.size,0)>500*1024*1024||entries.length>1000)throw new Error('Choose a smaller backup: up to 1,000 files, 50 MB per file, and 500 MB total. No files were removed.');
  manifest.expectedSnapshot=remote?.snapshot||null;backupStatus('Starting backup of '+entries.length+' file(s)…');autoBackupStatus('backing up…');const {snapshot,uploadIds}=await backupJSON('begin',manifest);const needed=new Set(uploadIds||entries.map(e=>e.record.id));
  for(let i=0;i<entries.length;i++){
   if(!needed.has(entries[i].record.id))continue;
   const {record:r,blob}=entries[i];backupStatus('Uploading '+(i+1)+' of '+entries.length+'…\n'+r.name);
   const response=await fetch('/api/backup?'+new URLSearchParams({action:'upload',snapshot,id:r.id}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob});
   if(!response.ok){const error=await response.json();throw new Error(error.error||'File upload failed.');}
  }
  const result=await backupJSON('complete',{}, {snapshot});cloudBackupInfo.backup=result;rememberBackup(snapshot,fingerprint);autoBackupStatus('saved · '+new Date(result.savedAt).toLocaleString());backupStatus('Backup complete · '+result.count+' file(s).\n'+new Date(result.savedAt).toLocaleString()+'\nOn another device, sign in with the same account and choose Restore.');if(!automatic)toast('Private cloud backup saved.');
 }catch(e){autoBackupStatus(e.status===401?'sign in once using Update / Back up.':e.status===409?'newer cloud backup available — restore first.':'pending — '+e.message+' Retry when you reopen or reconnect.');backupStatus(e.message+'\nYour device files were kept. An unfinished backup does not replace your previous completed backup.');}
 finally{backupControls(false);if(autoBackupQueued){autoBackupQueued=false;scheduleAutoBackup();}applyAppUpdateWhenSafe();}
}
$('cloud-backup-save').onclick=()=>runCloudBackup(false);
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
  const restoredContent={version:1,studentCount:manifest.studentCount,studentNames:manifest.studentNames,teacherNames:manifest.teacherNames,memos:manifest.memos,files:manifest.files.map(({storageSnapshot,...file})=>file)};rememberBackup(manifest.snapshot,await backupFingerprint(restoredContent));autoBackupStatus('restored · '+new Date(manifest.savedAt).toLocaleString());
  backupStatus('Restore complete. '+restored+' missing file(s) added.\nStudent names, teacher names, and weekly notes restored. Existing device files were kept.');toast('Cloud backup restored.');
 }catch(e){backupStatus(e.message+'\nFiles already restored are kept. Retry Restore to continue.');}
 finally{backupControls(false);if(autoBackupQueued){autoBackupQueued=false;scheduleAutoBackup();}}
};
const autoBackupOption=make('label','footnote');const autoBackupToggle=make('input');autoBackupToggle.type='checkbox';autoBackupToggle.checked=autoBackupEnabled();autoBackupToggle.style.width='auto';autoBackupToggle.style.marginRight='8px';autoBackupOption.append(autoBackupToggle,document.createTextNode('Automatically back up when opening the app and after changes.'));backupDialog.append(autoBackupOption);
autoBackupToggle.onchange=()=>{try{localStorage.setItem('work-station-auto-backup',autoBackupToggle.checked?'on':'off')}catch{}if(autoBackupToggle.checked)scheduleAutoBackup(0);else{clearTimeout(autoBackupTimer);autoBackupStatus('off')}};
function scheduleAutoBackup(delay=3000){clearTimeout(autoBackupTimer);if(!autoBackupEnabled())return;autoBackupTimer=setTimeout(()=>runCloudBackup(true),delay);}
let appUpdateReady=false;
function applyAppUpdateWhenSafe(){if(appUpdateReady&&!backupBusy&&!sharing&&!document.querySelector('dialog[open]')&&document.visibilityState==='visible'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){location.reload();}}
function checkForAppUpdate(){if(typeof navigator!=='undefined'&&navigator.serviceWorker?.getRegistration)navigator.serviceWorker.getRegistration().then(registration=>registration?.update()).catch(()=>{});applyAppUpdateWhenSafe();}
if(typeof navigator!=='undefined'&&navigator.serviceWorker){const hadController=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController){appUpdateReady=true;applyAppUpdateWhenSafe();}});}
document.addEventListener('focusout',()=>{if(appUpdateReady)setTimeout(applyAppUpdateWhenSafe,0)});
window.addEventListener('homework-data-changed',()=>{try{localStorage.setItem('work-station-auto-backup-pending','1')}catch{}scheduleAutoBackup()});
window.addEventListener('online',()=>{checkForAppUpdate();scheduleAutoBackup(0)});window.addEventListener('pageshow',()=>{checkForAppUpdate();scheduleAutoBackup(0)});
document.addEventListener('visibilitychange',()=>{clearTimeout(autoBackupTimer);if(document.visibilityState==='hidden'){runCloudBackup(true);}else{checkForAppUpdate();scheduleAutoBackup(0)}});
window.addEventListener('pagehide',()=>{clearTimeout(autoBackupTimer);runCloudBackup(true)});
scheduleAutoBackup(0);
checkForAppUpdate();
if(new URLSearchParams(location.search).get('backup')==='1'){history.replaceState(null,'',location.pathname);openCloudBackup();}
