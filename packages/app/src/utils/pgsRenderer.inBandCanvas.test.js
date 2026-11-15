import {createInBandPgsSource} from './mkvPgsSource';
import {PgsRenderer} from 'libpgs';
import {initPgsCanvasInBandRenderer} from './pgsRenderer';

jest.mock('./mkvPgsSource', () => ({createInBandPgsSource: jest.fn()}));
jest.mock('libpgs', () => ({PgsRenderer: jest.fn()}));

const track = {inBand: {streamUrl: 'https://server/video', ordinal: 2}};
let source, native, originalFetch, originalResponse;
beforeEach(() => {
	jest.clearAllMocks();
	source = {ready: Promise.resolve(true), readable: {}, dispose: jest.fn(), needsRestart: jest.fn(() => false)};
	native = {renderAtTimestamp: jest.fn(), dispose: jest.fn()};
	createInBandPgsSource.mockReturnValue(source);
	PgsRenderer.mockImplementation(() => native);
	originalFetch = global.fetch;
	originalResponse = global.Response;
	global.fetch = jest.fn();
	global.Response = class { constructor(body) { this.body = body; } };
});
afterEach(() => { global.fetch = originalFetch; global.Response = originalResponse; });

test('feeds embedded PGS to libpgs without asking the server for a subtitle sidecar', async () => {
	const fetchBefore = global.fetch;
	let subtitleResponse;
	PgsRenderer.mockImplementation(options => {
		subtitleResponse = global.fetch(options.subUrl);
		return native;
	});
	const view = await initPgsCanvasInBandRenderer({}, track, 120);
	expect((await subtitleResponse).body).toBe(source.readable);
	expect(global.fetch).toBe(fetchBefore);
	expect(fetchBefore).not.toHaveBeenCalled();
	expect(createInBandPgsSource.mock.calls[0][0].startTime).toBe(120);
	view.renderAtTimestamp(125);
	expect(createInBandPgsSource.mock.calls[0][0].getTime()).toBe(125);
	expect(native.renderAtTimestamp).toHaveBeenCalledWith(125);
	view.needsRestart(10);
	expect(source.needsRestart).toHaveBeenCalledWith(10);
	view.dispose();
	expect(source.dispose).toHaveBeenCalled();
	expect(native.dispose).toHaveBeenCalled();
});

test('releases the source when the MKV has no readable subtitle cues', async () => {
	source.ready = Promise.resolve(false);
	expect(await initPgsCanvasInBandRenderer({}, track)).toBeNull();
	expect(source.dispose).toHaveBeenCalled();
	expect(PgsRenderer).not.toHaveBeenCalled();
});

test('publishes an already decoded timeline before drawing when libpgs progress is throttled', async () => {
	const times = [5 * 90000, 10 * 90000];
	const impl = {pgs: {updateTimestamps: times}, updateTimestamps: []};
	impl.invokeTimestampsUpdate = jest.fn(() => { impl.updateTimestamps = impl.pgs.updateTimestamps; });
	native.implementation = impl;
	const view = await initPgsCanvasInBandRenderer({}, track, 5);
	native.renderAtTimestamp.mockImplementation(() => { expect(impl.updateTimestamps).toBe(times); });
	view.renderAtTimestamp(5);
	view.renderAtTimestamp(6);
	expect(impl.invokeTimestampsUpdate).toHaveBeenCalledTimes(1);
	view.dispose();
});

test('clears the externally owned canvas when a seek disposes the old renderer', async () => {
	const context = {clearRect: jest.fn()};
	native.canvas = {width: 1920, height: 1080, getContext: () => context};
	const view = await initPgsCanvasInBandRenderer(native.canvas, track, 120);
	view.dispose();
	expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
	view.dispose();
});

test('scopes index reuse to the same playback track object', async () => {
	let view = await initPgsCanvasInBandRenderer({}, track, 120);
	const cache = createInBandPgsSource.mock.calls.at(-1)[0].indexCache;
	view.dispose();
	view = await initPgsCanvasInBandRenderer({}, track, 10);
	expect(createInBandPgsSource.mock.calls.at(-1)[0].indexCache).toBe(cache);
	view.dispose();
	view = await initPgsCanvasInBandRenderer({}, {inBand: {...track.inBand}}, 10);
	expect(createInBandPgsSource.mock.calls.at(-1)[0].indexCache).not.toBe(cache);
	view.dispose();
});

test('restores fetch and releases the source when libpgs cannot start', async () => {
	const fetchBefore = global.fetch;
	const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
	PgsRenderer.mockImplementation(() => { throw new Error('canvas unavailable'); });
	expect(await initPgsCanvasInBandRenderer({}, track)).toBeNull();
	expect(global.fetch).toBe(fetchBefore);
	expect(source.dispose).toHaveBeenCalled();
	warning.mockRestore();
});
