/**
 * Optional performance trace.
 *
 * The host injects `globalThis.__AGENTERO_PERF__` before page JS when
 * `AGENTERO_PERF` or `AGENTERO_PERF_TRACE` is set. With neither variable,
 * every function here returns immediately.
 *
 * UI spans are `PERF {json}` log lines. The host log target appends them to
 * the same file as Rust `OpTimer` spans.
 */

type PerfBoot = {
	perf?: boolean;
	trace?: boolean;
	traceId?: string;
	vault?: string | null;
	open?: string | null;
};

const UI_PREFIX = "PERF ";

export function perfBoot(): PerfBoot | null {
	const value = (globalThis as { __AGENTERO_PERF__?: PerfBoot })
		.__AGENTERO_PERF__;
	if (!value || typeof value !== "object") return null;
	return value;
}

/** Startup isolation: do not restore the last vault, and exit after one open. */
export function perfActive(): boolean {
	return perfBoot()?.perf === true;
}

/** Write spans. Independent of {@link perfActive}. */
export function perfTracing(): boolean {
	return perfBoot()?.trace === true;
}

let tail: Promise<void> = Promise.resolve();
const anchors = new Map<string, number>();
const once = new Set<string>();
const waiters = new Map<string, Array<() => void>>();
let settle: Promise<void> = Promise.resolve();

export function perfEmit(
	name: string,
	durUs: number,
	ok = true,
	fields = "",
): void {
	if (!perfTracing() || !name) return;
	const line = `${UI_PREFIX}${JSON.stringify({
		name,
		dur_us: Math.max(0, Math.round(durUs)),
		ok,
		fields,
	})}`;
	tail = tail.then(async () => {
		try {
			const log = await import("@tauri-apps/plugin-log");
			await log.info(line);
		} catch {
			// A trace must not break the operation that produced it.
		}
	});
}

export function perfFlush(): Promise<void> {
	return tail;
}

/** Time `fn` only when tracing is on. Otherwise call `fn` unchanged. */
export async function perfOp<T>(
	name: string,
	fn: () => Promise<T>,
	fields?: string,
): Promise<T> {
	if (!perfTracing()) return fn();
	const start = performance.now();
	try {
		const result = await fn();
		perfEmit(name, (performance.now() - start) * 1000, true, fields ?? "");
		return result;
	} catch (error) {
		perfEmit(name, (performance.now() - start) * 1000, false, fields ?? "");
		throw error;
	}
}

/** A deliberate debounce, recorded separately from the work that follows. */
export function perfWait(name: string, elapsedMs: number): void {
	perfEmit(name, elapsedMs * 1000, true, "kind=wait");
}

export function perfAnchor(name: string): void {
	anchors.set(name, performance.now());
}

export function perfMarked(name: string): boolean {
	return once.has(name);
}

/**
 * First time `name` is reached. Duration is from `anchor` when that anchor
 * was set, otherwise from navigation start (`performance.now()`'s origin).
 */
export function markOnce(
	name: string,
	opts?: { ok?: boolean; anchor?: string },
): void {
	if (once.has(name)) return;
	once.add(name);
	const anchor = opts?.anchor;
	const start = anchor && anchors.has(anchor) ? (anchors.get(anchor) ?? 0) : 0;
	perfEmit(name, (performance.now() - start) * 1000, opts?.ok !== false);
	const pending = waiters.get(name);
	if (!pending) return;
	waiters.delete(name);
	for (const wake of pending) wake();
}

export function waitMark(name: string, timeoutMs: number): Promise<boolean> {
	if (once.has(name)) return Promise.resolve(true);
	return new Promise((resolve) => {
		const timer = window.setTimeout(() => resolve(false), timeoutMs);
		const wake = () => {
			window.clearTimeout(timer);
			resolve(true);
		};
		const pending = waiters.get(name) ?? [];
		pending.push(wake);
		waiters.set(name, pending);
	});
}

/** Let the perf runner wait for vault open work started elsewhere. */
export function perfFollow(work: Promise<unknown>): void {
	if (!perfActive()) return;
	const tracked = work.then(
		() => undefined,
		() => undefined,
	);
	settle = settle.then(() => tracked);
}

/** Vault-open work registered through {@link perfFollow}. */
export function perfSettled(): Promise<void> {
	return settle;
}
