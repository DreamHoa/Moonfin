import {cubicBezier, getScrollPosition, glideScroll, glideToCard, isGliding, setSmoothScrolling, stopScrollAnimation, whenStill} from './focusScroll';

jest.mock('@enact/spotlight', () => ({getPointerMode: () => false}));
jest.mock('./personalBuild', () => ({IS_BU8000_BUILD: true}));

// A scroller 1000 wide over 3000 of content, its view starting at 0 on screen.
const lane = (scrollLeft = 0) => {
	const node = document.createElement('div');
	Object.defineProperty(node, 'clientWidth', {value: 1000});
	Object.defineProperty(node, 'scrollWidth', {value: 3000});
	node.scrollLeft = scrollLeft;
	return node;
};

// Cards side by side in one row, each at its own offset.
const cardsAt = (...lefts) => {
	const items = document.createElement('div');
	return lefts.map((left) => {
		const card = document.createElement('div');
		Object.defineProperty(card, 'offsetLeft', {value: left});
		items.appendChild(card);
		return card;
	});
};

describe('focus glides', () => {
	let frames;
	let now;

	beforeEach(() => {
		frames = [];
		now = 0;
		jest.spyOn(Date, 'now').mockImplementation(() => now);
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => frames.push(fn));
		jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
	});

	const runFor = (ms) => {
		now += ms;
		const due = frames;
		frames = [];
		due.forEach((fn) => fn());
	};

	afterEach(() => {
		// Glides are tracked across the module, so each test lets its own run out.
		for (let i = 0; i < 10 && frames.length; i++) runFor(1000);
		jest.restoreAllMocks();
		setSmoothScrolling(true);
	});

	it('jumps with Smooth Scrolling off, unless the glide keeps step with something else moving', () => {
		setSmoothScrolling(false);
		const node = lane();
		expect(glideScroll(node, 'x', 400)).toBe(400);
		expect(node.scrollLeft).toBe(400);
		expect(frames).toHaveLength(0);

		const timed = lane();
		glideScroll(timed, 'x', 400, 0, {duration: 180, ease: (t) => t});
		expect(timed.scrollLeft).toBe(0);
		expect(frames).toHaveLength(1);
	});

	it('glides from where the lane was before the focus scroll, and lands on the target', () => {
		const node = lane(0);
		// The browser's own focus scroll has already moved the lane.
		node.scrollLeft = 300;
		glideScroll(node, 'x', 500, 0);
		expect(node.scrollLeft).toBe(0);
		runFor(110);
		expect(node.scrollLeft).toBeGreaterThan(0);
		expect(node.scrollLeft).toBeLessThan(500);
		runFor(300);
		expect(node.scrollLeft).toBe(500);
	});

	it("starts the clock on the first frame, so a slow one doesn't use up the glide", () => {
		const node = lane(0);
		glideScroll(node, 'x', 500, 0);
		expect(node.scrollLeft).toBe(0);
		// The frame that paints the focus change takes 150 ms.
		runFor(150);
		expect(node.scrollLeft).toBeGreaterThan(0);
		expect(node.scrollLeft).toBeLessThan(200);
	});

	it('keeps the target inside the lane', () => {
		expect(glideScroll(lane(), 'x', 5000)).toBe(2000);
		expect(glideScroll(lane(), 'x', -50)).toBe(0);
	});

	it('parks the focused card where the first one sits, until the row runs out', () => {
		const cards = cardsAt(60, 280, 500, 2900);
		expect(glideToCard(lane(0), cards[0], 0)).toBe(0);
		expect(glideToCard(lane(0), cards[2], 0)).toBe(440);
		expect(glideToCard(lane(0), cards[3], 0)).toBe(2000);
	});

	it('follows a CSS curve, so a glide keeps step with a transition on it', () => {
		const linear = cubicBezier(0, 0, 1, 1);
		[0, 0.25, 0.5, 0.8, 1].forEach((x) => expect(linear(x)).toBeCloseTo(x, 4));

		// The modern cards' ease-in-out: symmetric about the middle, slow at both ends.
		const card = cubicBezier(0.65, 0, 0.35, 1);
		expect(card(0.5)).toBeCloseTo(0.5, 4);
		expect(card(0.2) + card(0.8)).toBeCloseTo(1, 4);
		expect(card(0.1)).toBeLessThan(0.05);
		let previous = 0;
		for (let x = 0.05; x <= 1; x += 0.05) {
			expect(card(x)).toBeGreaterThanOrEqual(previous);
			previous = card(x);
		}
	});

	it('holds work back until every glide has finished', () => {
		const idle = jest.fn();
		whenStill(idle);
		expect(idle).toHaveBeenCalled();

		glideScroll(lane(0), 'x', 500, 0);
		const held = jest.fn();
		whenStill(held);
		runFor(100);
		expect(held).not.toHaveBeenCalled();
		runFor(300);
		runFor(16);
		expect(held).toHaveBeenCalled();
	});

	it('uses native scrolling on BU8000 without a per-frame JavaScript animation', async () => {
		const node = lane(0);
		node.scrollTo = jest.fn();
		glideScroll(node, 'x', 400, 0);
		expect(node.scrollTo).toHaveBeenCalledWith({left: 400, behavior: 'smooth'});
		expect(frames).toHaveLength(0);
		expect(isGliding(node, 'x')).toBe(true);
		expect(getScrollPosition(node)).toBe(400);
		node.scrollLeft = 400;
		runFor(100);
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(isGliding(node, 'x')).toBe(false);
	});

	it('cancels a native glide at its actual position before retargeting or stopping', () => {
		const node = lane(0);
		node.scrollTo = jest.fn();
		glideScroll(node, 'x', 400, 0);
		node.scrollLeft = 120;
		glideScroll(node, 'x', 700);
		expect(node.scrollTo).toHaveBeenCalledWith({left: 120, behavior: 'auto'});
		expect(getScrollPosition(node)).toBe(700);
		stopScrollAnimation(node);
		expect(isGliding(node, 'x')).toBe(false);
		expect(getScrollPosition(node)).toBe(120);
		expect(frames).toHaveLength(0);
	});

	it('keeps the timed JavaScript path for a card transition with an explicit curve', () => {
		const node = lane(0);
		node.scrollTo = jest.fn();
		glideScroll(node, 'x', 400, 0, {duration: 180, ease: (t) => t});
		expect(node.scrollTo).not.toHaveBeenCalled();
		expect(frames).toHaveLength(1);
	});

	it('can switch from a native glide to a timed card transition without losing the current offset', () => {
		const node = lane(0);
		node.scrollTo = jest.fn();
		glideScroll(node, 'x', 400, 0);
		node.scrollLeft = 120;
		glideScroll(node, 'x', 600, undefined, {duration: 180, ease: (t) => t});
		expect(node.scrollLeft).toBe(120);
		runFor(20);
		expect(node.scrollLeft).toBeGreaterThan(120);
		runFor(300);
		expect(node.scrollLeft).toBe(600);
	});

	it('falls back to a direct landing if the TV rejects native scroll options', () => {
		const node = lane(0);
		node.scrollTo = jest.fn(() => { throw new Error('Unsupported'); });
		glideScroll(node, 'x', 400, 0);
		expect(node.scrollLeft).toBe(400);
		expect(isGliding(node, 'x')).toBe(false);
	});
});
