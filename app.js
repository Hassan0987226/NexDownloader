const STORAGE_KEY = 'nexdownloader.queue.v1';
const queue = loadQueue();
const controllers = new Map();
let filter = 'all';
let activeId = null;

function byId(id) {
    return document.getElementById(id);
}

function loadQueue() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(saved)) return [];
        return saved.map((item) => ({
            ...item,
            status: ['downloading', 'paused'].includes(item.status) ? 'queued' : item.status,
            progress: ['downloading', 'paused'].includes(item.status) ? 0 : item.progress,
            received: ['downloading', 'paused'].includes(item.status) ? 0 : item.received,
        }));
    } catch {
        return [];
    }
}

function persist() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
        status('Queue could not be saved in this browser.', true);
    }
}

function status(message, error = false) {
    const node = byId('status');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', error);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[character]));
}

function bytes(value) {
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function fileNameFromUrl(url) {
    const pathname = new URL(url).pathname;
    const part = pathname.split('/').filter(Boolean).pop();
    if (!part) return 'download';
    try {
        return decodeURIComponent(part).replace(/[\\/:*?"<>|]/g, '_') || 'download';
    } catch {
        return part.replace(/[\\/:*?"<>|]/g, '_') || 'download';
    }
}

function visibleItems() {
    if (filter === 'active') return queue.filter((item) => ['queued', 'downloading', 'paused'].includes(item.status));
    if (filter === 'completed') return queue.filter((item) => item.status === 'completed');
    return queue;
}

function render() {
    const active = queue.filter((item) => ['downloading', 'paused'].includes(item.status)).length;
    const queued = queue.filter((item) => item.status === 'queued').length;
    const completed = queue.filter((item) => item.status === 'completed').length;

    const countActive = byId('count-active');
    const countQueued = byId('count-queued');
    const countCompleted = byId('count-completed');
    const queueCount = byId('queue-count');
    const clearCompleted = byId('clear-completed');
    const queueContainer = byId('queue');

    if (countActive) countActive.textContent = String(active);
    if (countQueued) countQueued.textContent = String(queued);
    if (countCompleted) countCompleted.textContent = String(completed);
    if (queueCount) queueCount.textContent = `${queue.length} ${queue.length === 1 ? 'item' : 'items'}`;
    if (clearCompleted) clearCompleted.disabled = completed === 0;

    if (!queueContainer) return;

    const visible = visibleItems();
    if (!visible.length) {
        const message = queue.length ? `No ${filter} downloads.` : 'Nothing in your queue yet.';
        queueContainer.innerHTML = `
            <div class="empty-state">
                <div>
                    <span class="empty-mark" aria-hidden="true">↓</span>
                    <p>${message}</p>
                    <span>Your files will show up here.</span>
                </div>
            </div>
        `;
        return;
    }

    queueContainer.innerHTML = visible.map(renderItem).join('');
}

function renderItem(item) {
    let actions = '';
    if (item.status === 'downloading') {
        actions = `<button class="action-button" data-action="pause" data-id="${item.id}">Pause</button>`;
    } else if (item.status === 'paused') {
        actions = `<button class="action-button" data-action="resume" data-id="${item.id}">Resume</button>`;
    } else if (item.status === 'error') {
        actions = `
            <button class="action-button" data-action="retry" data-id="${item.id}">Retry</button>
            <button class="action-button danger" data-action="remove" data-id="${item.id}">Remove</button>
        `;
    } else {
        actions = `<button class="action-button danger" data-action="remove" data-id="${item.id}">Remove</button>`;
    }

    if (item.status === 'downloading' || item.status === 'paused') {
        actions += `<button class="action-button danger" data-action="cancel" data-id="${item.id}">Cancel</button>`;
    }

    const percent = Number.isFinite(item.progress) ? item.progress : 0;
    const progressText = item.status === 'completed'
        ? 'Downloaded'
        : item.status === 'error'
            ? item.error
            : `${percent}% · ${bytes(item.received || 0)}${item.total ? ` of ${bytes(item.total)}` : ''}`;

    return `
        <article class="download-item">
            <div class="item-topline">
                <div class="file-meta">
                    <p class="file-name">${escapeHTML(item.filename)}</p>
                    <p class="file-host">${escapeHTML(item.host)}</p>
                </div>
                <span class="item-status ${item.status}">${escapeHTML(item.status)}</span>
            </div>
            <div class="progress-line">
                <span>${escapeHTML(progressText)}</span>
                <span>${item.status === 'downloading' && !item.total ? 'Size unknown' : ''}</span>
            </div>
            <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
                <div class="progress-fill" style="width:${percent}%"></div>
            </div>
            <div class="item-actions">${actions}</div>
        </article>
    `;
}

function addDownload(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        status('Enter a valid URL, including https://.', true);
        return false;
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        status('Only HTTP and HTTPS file links are supported.', true);
        return false;
    }

    queue.unshift({
        id: `${Date.now()}-${Math.random()}`,
        url: url.href,
        host: url.host,
        filename: fileNameFromUrl(url.href),
        status: 'queued',
        progress: 0,
        received: 0,
        total: 0,
        error: '',
    });

    persist();
    render();
    status('Added to the queue.');
    startNext();
    return true;
}

function startNext() {
    if (activeId) return;
    const item = queue.find((entry) => entry.status === 'queued');
    if (!item) return;

    activeId = item.id;
    transfer(item).finally(() => {
        controllers.delete(item.id);
        activeId = null;
        startNext();
    });
}

async function transfer(item) {
    const controller = new AbortController();
    controllers.set(item.id, controller);
    item.status = 'downloading';
    persist();
    render();

    try {
        const response = await fetch(item.url, { signal: controller.signal, redirect: 'follow' });
        if (!response.ok) throw new Error(`Server returned ${response.status}.`);

        item.total = Number(response.headers.get('content-length')) || 0;
        const disposition = response.headers.get('content-disposition') || '';
        const nameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const responseName = nameMatch && (nameMatch[1] || nameMatch[2]);

        if (responseName) {
            try {
                item.filename = decodeURIComponent(responseName).replace(/[\\/:*?"<>|]/g, '_');
            } catch {
                item.filename = responseName.replace(/[\\/:*?"<>|]/g, '_');
            }
        }

        const chunks = [];
        let received = 0;

        if (response.body) {
            const reader = response.body.getReader();
            while (true) {
                if (!queue.includes(item)) {
                    await reader.cancel();
                    return;
                }

                if (item.status === 'paused') {
                    await new Promise((resolve) => {
                        item.resume = resolve;
                    });
                }

                const result = await reader.read();
                if (result.done) break;

                chunks.push(result.value);
                received += result.value.byteLength;
                item.received = received;
                item.progress = item.total ? Math.min(99, Math.floor((received / item.total) * 100)) : 0;
                render();
            }
        } else {
            const blob = await response.blob();
            chunks.push(blob);
            received = blob.size;
        }

        if (!queue.includes(item)) return;

        const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = item.filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

        item.status = 'completed';
        item.progress = 100;
        item.received = received;
        persist();
        render();
    } catch (error) {
        if (!queue.includes(item) || error.name === 'AbortError') return;
        item.status = 'error';
        item.error = error instanceof TypeError ? 'Network or CORS blocked this link.' : error.message;
        persist();
        render();
    }
}

function handleAction(action, id) {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;

    if (action === 'pause' && item.status === 'downloading') {
        item.status = 'paused';
    } else if (action === 'resume' && item.status === 'paused') {
        item.status = 'downloading';
        if (item.resume) item.resume();
        item.resume = null;
    } else if (action === 'cancel' || action === 'remove') {
        const controller = controllers.get(id);
        if (controller) controller.abort();
        if (item.status === 'paused' && item.resume) item.resume();
        queue.splice(queue.indexOf(item), 1);
    } else if (action === 'retry' && item.status === 'error') {
        Object.assign(item, { status: 'queued', error: '', progress: 0, received: 0, total: 0 });
    }

    persist();
    render();
    startNext();
}

function init() {
    const form = byId('download-form');
    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const input = byId('url');
            if (input && addDownload(input.value.trim())) input.value = '';
        });
    }

    const queueList = byId('queue');
    if (queueList) {
        queueList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (button) handleAction(button.dataset.action, button.dataset.id);
        });
    }

    const filters = document.querySelector('.filters');
    if (filters) {
        filters.addEventListener('click', (event) => {
            const button = event.target.closest('[data-filter]');
            if (!button) return;
            filter = button.dataset.filter;
            document.querySelectorAll('.filter-button').forEach((option) => {
                const selected = option === button;
                option.classList.toggle('is-selected', selected);
                option.setAttribute('aria-pressed', String(selected));
            });
            render();
        });
    }

    const clearCompleted = byId('clear-completed');
    if (clearCompleted) {
        clearCompleted.addEventListener('click', () => {
            for (let index = queue.length - 1; index >= 0; index--) {
                if (queue[index].status === 'completed') queue.splice(index, 1);
            }
            persist();
            render();
        });
    }

    render();
    startNext();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
