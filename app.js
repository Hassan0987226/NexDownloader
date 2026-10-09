// Set this to your deployed backend origin, e.g. https://your-api.example.com
const API_BASE = "";
const form = document.querySelector('#form');
const statusEl = document.querySelector('#status');
const button = document.querySelector('#go');
function status(message, error=false){statusEl.textContent=message;statusEl.style.color=error?'#fda4af':'#9fb0d0';}
function isDirect(url){return /\.(mp4|webm|mov|mp3|m4a|wav|ogg|jpg|jpeg|png|webp|gif)(?:$|[?#])/i.test(new URL(url).pathname+new URL(url).search)}
form.addEventListener('submit', async e=>{
 e.preventDefault(); const url=document.querySelector('#url').value.trim(); const format=document.querySelector('#format').value;
 try{new URL(url)}catch{return status('Please paste a valid http/https URL.',true)}
 if(!/^https?:/i.test(url))return status('Only http and https links are supported.',true);
 if(format==='photo' && !/\.(jpg|jpeg|png|webp|gif)(?:$|[?#])/i.test(url))return status('For photos, paste a direct image URL ending in .jpg, .png, .webp or .gif.',true);
 if(isDirect(url)){
   const a=document.createElement('a');a.href=url;a.download='';a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
   status('Download requested. If the browser opens the file instead, use its Download/Save option. Some servers block cross-site downloads.'); return;
 }
 if(!API_BASE){status('This is a social-media post URL. GitHub Pages cannot extract its video. Deploy the backend folder, then set API_BASE in app.js to your backend URL.',true);return;}
 button.disabled=true;button.textContent='Preparing download…';status('Contacting download service…');
 try{const res=await fetch(API_BASE.replace(/\/$/,'')+'/api/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,format})});
  const type=res.headers.get('content-type')||'';
  if(!res.ok){let msg='Download failed.';try{msg=(await res.json()).error||msg}catch{}throw new Error(msg)}
  if(type.includes('application/json')){const d=await res.json();if(d.download_url){window.location.href=d.download_url;status('Download started.');return}throw new Error(d.error||'The service did not return a file.')}
  const blob=await res.blob();const cd=res.headers.get('content-disposition')||'';const m=cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);const name=m?decodeURIComponent(m[1].replace(/"/g,'')):(format==='audio'?'download.mp3':format==='photo'?'download.jpg':'download.mp4');const obj=URL.createObjectURL(blob);const a=document.createElement('a');a.href=obj;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(obj),60000);status('Download started. Check your Downloads folder.');
 }catch(err){status(err.message+' Check backend deployment/logs and supported URL.',true)}finally{button.disabled=false;button.textContent='Find downloadable media →'}
});