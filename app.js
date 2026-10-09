(() => {
  'use strict';
  const KEY = 'nexdownloader.static.queue.v1';
  const $ = id => document.getElementById(id);
  let filter = 'all';
  let queue = [];
  try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(saved)) queue = saved.filter(x => x && typeof x.url === 'string'); } catch {}
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const filename = url => { try { const p = new URL(url).pathname.split('/').filter(Boolean).pop(); return p ? decodeURIComponent(p) : 'Download link'; } catch { return 'Download link'; } };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { setStatus('Browser storage is full; this link may not be saved.', true); } }
  function setStatus(message, error=false) { $('status').textContent = message; $('status').classList.toggle('is-error', error); }
  function render() {
    const ready = queue.filter(x => !x.opened).length, opened = queue.length-ready;
    $('count-active').textContent = String(ready); $('count-queued').textContent = String(ready); $('count-completed').textContent = String(opened);
    $('queue-count').textContent = `${queue.length} ${queue.length === 1 ? 'item' : 'items'}`; $('clear-completed').disabled = opened === 0;
    const items = queue.filter(x => filter === 'all' || (filter === 'active' && !x.opened) || (filter === 'completed' && x.opened));
    $('queue').innerHTML = items.length ? items.map(x => `<article class="download-item"><div class="item-topline"><div class="file-meta"><p class="file-name">${escapeHTML(x.filename || filename(x.url))}</p><p class="file-host">${escapeHTML(new URL(x.url).host)}</p></div><span class="item-status ${x.opened ? 'completed' : 'queued'}">${x.opened ? 'opened' : 'ready'}</span></div><div class="progress-line"><span>${x.opened ? 'Link opened' : 'Ready to open source link'}</span><span></span></div><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.opened ? 100 : 0}"><div class="progress-fill" style="width:${x.opened ? 100 : 0}%"></div></div><div class="item-actions"><button class="action-button" data-action="open" data-id="${escapeHTML(x.id)}">${x.opened ? 'Open again' : 'Open / Download'}</button><button class="action-button danger" data-action="remove" data-id="${escapeHTML(x.id)}">Remove</button></div></article>`).join('') : `<div class="empty-state"><div><span class="empty-mark" aria-hidden="true">↓</span><p>${queue.length ? `No ${filter} links.` : 'Nothing in your queue yet.'}</p><span>Your saved links will show up here.</span></div></div>`;
  }
  $('download-form').addEventListener('submit', e => { e.preventDefault(); const input=$('url'); let u; try { u=new URL(input.value.trim()); } catch { setStatus('Enter a valid URL starting with https:// or http://.', true); return; } if (!['http:','https:'].includes(u.protocol)) { setStatus('Only HTTP and HTTPS links are supported.', true); return; } if (queue.some(x=>x.url===u.href)) { setStatus('That link is already in your queue.'); return; } queue.unshift({id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,url:u.href,filename:filename(u.href),opened:false}); save(); render(); input.value=''; setStatus('Link added. Tap “Open / Download” to visit its source.'); });
  $('queue').addEventListener('click', e => { const b=e.target.closest('[data-action]'); if(!b)return; const item=queue.find(x=>x.id===b.dataset.id); if(!item)return; if(b.dataset.action==='remove'){queue=queue.filter(x=>x.id!==item.id);save();render();return;} if(b.dataset.action==='open'){item.opened=true;save();render();setStatus('Source opened in a new tab. If it shows a webpage, that URL is not a direct downloadable file.');window.open(item.url,'_blank','noopener,noreferrer');} });
  document.querySelector('.filters').addEventListener('click', e => { const b=e.target.closest('[data-filter]'); if(!b)return; filter=b.dataset.filter; document.querySelectorAll('.filter-button').forEach(x=>{const active=x===b;x.classList.toggle('is-selected',active);x.setAttribute('aria-pressed',String(active));});render(); });
  $('clear-completed').addEventListener('click',()=>{queue=queue.filter(x=>!x.opened);save();render();});
  render();
})();
