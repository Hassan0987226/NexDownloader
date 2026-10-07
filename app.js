let isPremium = false,
    items = [];
const $ = id => document.getElementById(id);

function analyze() {
    if (!$('url').value.trim()) return $('status').textContent = 'Paste a URL first.';
    $('status').textContent = 'URL ready. Choose quality and format.'
}

function premium() {
    isPremium = true;
    $('status').textContent = 'Premium demo activated. Connect Stripe/PayPal for real $5 payments.'
}

function download() {
    let q = $('quality').value;
    if (q.includes('Premium') && !isPremium) return $('status').textContent = '1080p+ requires Premium.';
    let u = $('url').value.trim();
    if (!u) return $('status').textContent = 'Paste a URL first.';
    items.unshift([u, q, $('format').value]);
    $('queue').innerHTML = items.map(x => `<div class='item'>${x[0]} — ${x[1]} — ${x[2]} — Queued</div>`).join('');
    $('status').textContent = 'Added to queue.'
}