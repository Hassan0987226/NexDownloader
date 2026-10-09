try {
    item.filename = getFilenameFromResponse(response, item.filename);
    item.total = Number(response.headers.get('content-length')) || 0;
    const chunks = [];
    let received = 0;
    if (response.body) {
        const reader = response.body.getReader();
        while (true) {
            if (!queue.includes(item)) {
                await reader.cancel();
                return;






            }
            if (item.status === 'paused') await new Promise(resolve => { item.resume = resolve; });
            const result = await reader.read();
            if (result.done) break;
            chunks.push(result.value);
            received += result.value.byteLength;
            item.received = received;
            item.progress = item.total ? Math.min(99, Math.floor((received / item.total) * 100)) : 0;
            render();
        }
    } else {
        const data = await response.blob();
        chunks.push(data);
        received = data.size;
        item.received = received;
    }
    if (!queue.includes(item)) return;
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = item.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    item.status = 'completed';
    item.progress = 100;
    item.received = received;
    saveQueue();
    render();
} catch (error) {
    if (!queue.includes(item) || error.name === 'AbortError') return;
    item.status = 'error';
    item.error = error instanceof TypeError ? 'Network or CORS blocked this link.' : error.message;
    saveQueue();
    render();
}


function handleAction(action, id) {
    const item = queue.find(entry => entry.id === id);
    if (!item) return;
    if (action === 'pause' && item.status === 'downloading') {
        item.status = 'paused';
        saveQueue();
        render();
    } else if (action === 'resume' && item.status === 'paused') {
        item.status = 'downloading';
        if (item.resume) item.resume();
        item.resume = null;
        saveQueue();
        render();
    } else if (action === 'cancel' || action === 'remove') {
        const controller = controllers.get(id);
        if (controller) controller.abort();
        if (item.status === 'paused' && item.resume) item.resume();
        queue.splice(queue.indexOf(item), 1);
        saveQueue();
        render();
    } else if (action === 'retry' && item.status === 'error') {
        item.status = 'queued';
        item.error = '';
        item.progress = 0;
        item.received = 0;
        item.total = 0;
        saveQueue();
        render();
        startNext();
    }
}

function init() {
    $('download-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = $('url');
        if (addDownload(input.value.trim())) input.value = '';
    });
    $('queue').addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (button) handleAction(button.dataset.action, button.dataset.id);
    });
    document.querySelector('.filters').addEventListener('click', event => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        currentFilter = button.dataset.filter;
        document.querySelectorAll('.filter-button').forEach(filter => {
            const selected = filter === button;
            filter.classList.toggle('is-selected', selected);
            filter.setAttribute('aria-pressed', String(selected));
        });
        render();
    });
    $('clear-completed').addEventListener('click', () => {
        for (let index = queue.length - 1; index >= 0; index--) {
            if (queue[index].status === 'completed') queue.splice(index, 1);
        }
        saveQueue();
        render();
    });
    render();
    startNext();
}

init();
init();