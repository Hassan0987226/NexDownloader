const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');

const host = '127.0.0.1';
const port = Number(process.env.PORT) || 4173;
const root = __dirname;
const directMediaExtensions = /\.(?:3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|mpe|mts|m2ts|ogv|ts|webm|wmv|mp3|m4a|aac|flac|ogg|wav)(?:$|[?#])/i;
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

class RequestError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function sendJson(response, statusCode, value) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
}

function safeFilename(value) {
    const name = path.basename(String(value || 'download')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
    return name || 'download';
}

function disposition(filename) {
    const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function readRequestUrl(request) {
    let body = '';
    for await (const chunk of request) {
        body += chunk;
        if (body.length > 16384) throw new RequestError('Request is too large.');
    }

    let value;
    try {
        value = JSON.parse(body);
    } catch {
        throw new RequestError('Invalid download request.');
    }

    let url;
    try {
        url = new URL(value.url);
    } catch {
        throw new RequestError('Enter a valid video or file URL.');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new RequestError('Only HTTP and HTTPS URLs are supported.');
    }
    return url;
}

async function streamDirectFile(url, response) {
    const upstream = await fetch(url, { redirect: 'follow' });
    if (!upstream.ok) throw new RequestError(`Source server returned ${upstream.status}.`, 502);

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (contentType.includes('text/html')) {
        throw new RequestError('This URL returned a webpage, not a direct media file.');
    }

    const contentDisposition = upstream.headers.get('content-disposition');
    const headerName = contentDisposition ? contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i) : null;
    let filename = (headerName && headerName[1]) || (headerName && headerName[2]) || path.posix.basename(url.pathname) || 'download';
    try {
        filename = decodeURIComponent(filename);
    } catch {
        // Keep the source filename when it is not URL-encoded.
    }
    filename = safeFilename(filename);

    const headers = {
        'Content-Type': contentType,
        'Content-Disposition': disposition(filename),
        'Cache-Control': 'no-store',
    };
    if (upstream.headers.has('content-length')) headers['Content-Length'] = upstream.headers.get('content-length');
    response.writeHead(200, headers);

    if (upstream.body) {
        const body = Readable.fromWeb(upstream.body);
        response.on('close', () => {
            if (!response.writableEnded) body.destroy();
        });
        body.pipe(response);
    } else {
        response.end();
    }
}

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
        const child = spawn(python, ['-m', 'yt_dlp', ...args], { windowsHide: true });
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => child.kill(), 120000);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
        child.on('error', error => {
            clearTimeout(timeout);
            reject(new RequestError(`Could not start yt-dlp. Install requirements.txt first. ${error.message}`, 503));
        });
        child.on('close', code => {
            clearTimeout(timeout);
            if (code === 0) resolve(stdout.trim());
            else if (/No module named yt_dlp/i.test(stderr)) {
                reject(new RequestError('YouTube downloads need yt-dlp. Run: python -m pip install -r requirements.txt', 503));
            } else {
                reject(new RequestError(stderr.trim() || 'yt-dlp could not download this video. Check the URL and try again.', 502));
            }
        });
    });
}

async function streamPlatformVideo(url, response) {
    const format = 'best[ext=mp4]/best';
    const filename = safeFilename(await runYtDlp([
        '--no-playlist', '--format', format, '--get-filename', '--output', '%(title)s.%(ext)s', '--', url.href,
    ]));
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const child = spawn(python, ['-m', 'yt_dlp', '--no-playlist', '--format', format, '--output', '-', '--', url.href], { windowsHide: true });
    let stderr = '';
    let headersSent = false;
    let settled = false;

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', error => {
        if (settled) return;
        settled = true;
        if (!headersSent) sendJson(response, 503, { error: `Could not start yt-dlp. Install requirements.txt first. ${error.message}` });
        else response.destroy(error);
    });

    child.stdout.once('data', chunk => {
        headersSent = true;
        response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': disposition(filename),
            'Cache-Control': 'no-store',
        });
        response.write(chunk);
        child.stdout.pipe(response);
    });

    response.on('close', () => {
        if (!response.writableEnded) child.kill();
    });

    child.on('close', code => {
        if (settled) return;
        settled = true;
        if (!headersSent) {
            if (code === 0) sendJson(response, 502, { error: 'No downloadable video was returned.' });
            else sendJson(response, 502, { error: stderr.trim() || 'yt-dlp could not download this video. Check the URL and try again.' });
        } else if (code !== 0 && !response.writableEnded) {
            response.destroy(new Error('Video transfer ended unexpectedly.'));
        }
    });
}

async function handleDownload(request, response) {
    try {
        const url = await readRequestUrl(request);
        if (directMediaExtensions.test(url.pathname)) await streamDirectFile(url, response);
        else await streamPlatformVideo(url, response);
    } catch (error) {
        if (!response.headersSent) sendJson(response, error.statusCode || 502, { error: error.message });
        else response.destroy(error);
    }
}

function serveFile(response, pathname) {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        sendJson(response, 400, { error: 'Invalid path.' });
        return;
    }

    const relativePath = decoded === '/' ? 'index.html' : decoded.slice(1);
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        sendJson(response, 403, { error: 'Forbidden.' });
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendJson(response, 404, { error: 'Not found.' });
            return;
        }
        response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
        response.end(data);
    });
}

const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${host}:${port}`);
    if (request.method === 'POST' && requestUrl.pathname === '/api/download') {
        handleDownload(request, response);
    } else if (request.method === 'GET') {
        serveFile(response, requestUrl.pathname);
    } else {
        sendJson(response, 404, { error: 'Not found.' });
    }
});

server.listen(port, host, () => {
    console.log(`NexDownloader running at http://${host}:${port}`);
});