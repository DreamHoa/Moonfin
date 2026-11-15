#!/usr/bin/env node
// Read-only CDP profiling. Does not navigate, play media, change settings or expose URLs/tokens.
// node scripts/profile-ui.cjs http://TV_IP:DEBUG_PORT 40 output.json
const fs = require('node:fs');

const expression = `(() => {
 if (window.__moonfinUiProfile) throw new Error('A profile is already running');
 const p = {started: performance.now(), longTasks: [], keyFrames: [], frames: [], last: 0};
 const push = (list, value) => { if (list.length < 1000) list.push(value); };
 const key = () => { const start = performance.now(); requestAnimationFrame(() => push(p.keyFrames, performance.now() - start)); };
 document.addEventListener('keydown', key, true);
 const frame = time => { if (p.last) push(p.frames, time - p.last); p.last = time; p.raf = requestAnimationFrame(frame); };
 p.raf = requestAnimationFrame(frame);
 if (typeof PerformanceObserver !== 'undefined') {
  try { p.observer = new PerformanceObserver(list => list.getEntries().forEach(e => push(p.longTasks, e.duration))); p.observer.observe({entryTypes: ['longtask']}); } catch (_) {}
 }
 p.stop = () => { document.removeEventListener('keydown', key, true); cancelAnimationFrame(p.raf); if (p.observer) p.observer.disconnect();
  const result = {durationMs: performance.now() - p.started, longTasksMs: p.longTasks, keyToFrameMs: p.keyFrames, frameIntervalsMs: p.frames};
  delete window.__moonfinUiProfile; return result;
 };
 window.__moonfinUiProfile = p; return true;
})()`;

const category = (url, type) => {
	const pathname = new URL(url).pathname;
	if (type === 'Image') return 'image';
	if (type === 'Script' || /\.js$/.test(pathname)) return 'script';
	if (/PlaybackInfo|\/Videos\/|\/Audio\//i.test(pathname)) return 'playback';
	if (/\/Items\/[^/]+$/.test(pathname)) return 'item-detail';
	if (/Similar|Recommendations|SpecialFeatures|Collections/i.test(pathname)) return 'detail-extras';
	if (/Moonfin|Seerr|WatchParty|SyncPlay/i.test(pathname)) return 'plugin';
	return 'other-metadata';
};

async function main() {
	const base = process.argv[2];
	if (!base) throw new Error('Usage: node scripts/profile-ui.cjs http://TV_IP:DEBUG_PORT [seconds] [output.json]');
	const seconds = Math.max(5, Math.min(120, Number(process.argv[3]) || 40));
	const pages = await (await fetch(`${base.replace(/\/$/, '')}/json`, {signal: AbortSignal.timeout(5000)})).json();
	const candidates = pages.filter((page) => /moonfin/i.test(page.title || page.url || ''));
	const page = candidates.length === 1 ? candidates[0] : pages.length === 1 ? pages[0] : null;
	if (!page?.webSocketDebuggerUrl) throw new Error('Open Moonfin in debug mode; could not identify a single app page');
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	const pending = new Map();
	const requests = new Map();
	const samples = [];
	let sequence = 0;
	ws.addEventListener('message', ({data}) => {
		const message = JSON.parse(data);
		if (message.id) {
			const holder = pending.get(message.id);
			if (!holder) return;
			pending.delete(message.id);
			clearTimeout(holder.timer);
			if (message.error) holder.reject(new Error(message.error.message));
			else holder.resolve(message.result);
			return;
		}
		const e = message.params;
		if (message.method === 'Network.requestWillBeSent') {
			let kind;
			try { kind = category(e.request.url, e.type); } catch { return; }
			requests.set(e.requestId, {category: kind, start: e.timestamp});
		} else if (message.method === 'Network.responseReceived') {
			const r = requests.get(e.requestId);
			if (r) { r.headersMs = (e.timestamp - r.start) * 1000; r.status = e.response.status; }
		} else if (message.method === 'Network.loadingFinished' || message.method === 'Network.loadingFailed') {
			const r = requests.get(e.requestId);
			if (!r) return;
			requests.delete(e.requestId);
			if (samples.length < 2000) samples.push({category: r.category, status: r.status,
				headersMs: r.headersMs, durationMs: (e.timestamp - r.start) * 1000,
				bytes: e.encodedDataLength || 0, failed: message.method === 'Network.loadingFailed'});
		}
	});
	const call = (method, params = {}) => new Promise((resolve, reject) => {
		const id = ++sequence;
		const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
		pending.set(id, {resolve, reject, timer});
		ws.send(JSON.stringify({id, method, params}));
	});
	await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', () => reject(new Error('CDP connection failed')), {once: true}); });
	let installed = false;
	try {
		await call('Network.enable');
		await call('Performance.enable');
		const start = await call('Performance.getMetrics');
		const probe = await call('Runtime.evaluate', {expression, returnByValue: true});
		if (probe.exceptionDetails) throw new Error('Could not install temporary page observers');
		installed = true;
		console.log(`Recording ${seconds}s. Use the remote to switch films and open/back out of details.`);
		await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
		const end = await call('Performance.getMetrics');
		const result = await call('Runtime.evaluate', {expression: 'window.__moonfinUiProfile.stop()', returnByValue: true});
		installed = false;
		const before = Object.fromEntries(start.metrics.map(({name, value}) => [name, value]));
		const metrics = Object.fromEntries(end.metrics.filter(({name}) => /TaskDuration|ScriptDuration|LayoutDuration|RecalcStyleDuration|JSHeapUsedSize|Nodes/.test(name))
			.map(({name, value}) => [name, {end: value, delta: value - (before[name] || 0)}]));
		const output = {capturedAt: new Date().toISOString(), page: result.result.value, metrics, requests: samples,
			unfinishedRequests: requests.size, note: 'Key-to-frame is a main-thread scheduling measure, not proof of visible paint or GPU acceleration. Request times do not include the JavaScript API queue.'};
		const destination = process.argv[4] || 'bu8000-ui-profile.json';
		fs.writeFileSync(destination, JSON.stringify(output, null, 2));
		console.log(`Saved sanitized measurements to ${destination}`);
	} finally {
		if (installed) await call('Runtime.evaluate', {expression: 'window.__moonfinUiProfile && window.__moonfinUiProfile.stop()'}).catch(() => {});
		pending.forEach(({timer}) => clearTimeout(timer));
		ws.close();
	}
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
