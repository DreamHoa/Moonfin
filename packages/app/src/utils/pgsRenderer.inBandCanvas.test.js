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

test('restores fetch and releases the source when libpgs cannot start', async () => {
	const fetchBefore = global.fetch;
	const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
	PgsRenderer.mockImplementation(() => { throw new Error('canvas unavailable'); });
	expect(await initPgsCanvasInBandRenderer({}, track)).toBeNull();
	expect(global.fetch).toBe(fetchBefore);
	expect(source.dispose).toHaveBeenCalled();
	warning.mockRestore();
});
