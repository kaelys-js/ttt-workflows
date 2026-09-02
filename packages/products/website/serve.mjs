// Minimal static server for the built dist/ — portable (node only), used as the Playwright
// webServer so the E2E/visual suite runs identically on macOS and inside the Linux container.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const dir = 'dist';
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.xml': 'application/xml',
	'.txt': 'text/plain',
	'.woff2': 'font/woff2',
	'.pdf': 'application/pdf',
};

createServer(async (req, res) => {
	try {
		let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
		if (p.endsWith('/')) p += 'index.html';
		const fp = join(dir, normalize(p).replace(/^(\.\.[/\\])+/, ''));
		const data = await readFile(fp);
		res.setHeader('Content-Type', types[extname(fp)] || 'application/octet-stream');
		res.end(data);
	} catch {
		res.statusCode = 404;
		res.end('404');
	}
}).listen(4321, () => console.log('Serving dist on http://localhost:4321'));
