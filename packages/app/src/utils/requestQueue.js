/**
 * Caps how many requests are in flight at once.
 *
 * The home screen fans out per library and per row, so a cold load can put 40 or more
 * requests on the wire in the same tick. A media server backed by SQLite, which on a NAS
 * it usually is, answers that by locking up, spiking CPU and timing out, and the client
 * then retries and makes it worse. Queuing costs nothing while traffic is under the
 * limit. It is the burst that hurts.
 */

// Sits under the six connections per host a TV browser opens anyway, which leaves room
// for image loads. Those are img tags and never come through here.
export const DEFAULT_MAX_CONCURRENT = 4;

/**
 * Creates a queue that runs at most maxConcurrent tasks at a time. A limit below 1 is
 * treated as 1 so the queue can't deadlock.
 */
export const createRequestQueue = (maxConcurrent = DEFAULT_MAX_CONCURRENT) => {
	const limit = Math.max(1, maxConcurrent);
	const waiting = [];
	let active = 0;

	const pump = () => {
		if (active >= limit || waiting.length === 0) return;
		const {task, resolve, reject} = waiting.shift();
		active++;
		// A task that throws before returning a promise still has to release its slot.
		let started;
		try {
			started = Promise.resolve(task());
		} catch (err) {
			started = Promise.reject(err);
		}
		started.then(resolve, reject).finally(() => {
			active--;
			pump();
		});
	};

	return {
		// User navigation goes ahead of background rows that have not started yet.
		// Active requests are left alone; equal priorities retain FIFO ordering.
		run: (task, priority = 0) => new Promise((resolve, reject) => {
			const entry = {task, resolve, reject, priority};
			const index = waiting.findIndex((queued) => queued.priority < priority);
			if (index < 0) waiting.push(entry);
			else waiting.splice(index, 0, entry);
			pump();
		}),
		inFlight: () => active,
		pending: () => waiting.length
	};
};

// One queue for everything aimed at the media server, whether that is Jellyfin or Emby.
// The home rows reach it two ways, through the item endpoints and through the plugin's
// own endpoints, and both land on the same box, so capping one route on its own still
// lets a burst through. Playback and images take other paths and stay unthrottled.
//
// Keep long lived connections out of it. Anything holding a connection open, a settings
// stream for instance, would sit on its slot and starve everything waiting behind it.
export const mediaServerQueue = createRequestQueue();
