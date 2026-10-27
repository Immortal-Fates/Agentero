import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupSubmit, notifyError } = vi.hoisted(() => ({
	lookupSubmit: vi.fn(),
	notifyError: vi.fn(),
}));
vi.mock("@/lib/paper/import-actions", () => ({ lookupSubmit }));
vi.mock("@/lib/core/notify", () => ({ notifyError }));
vi.mock("@/lib/core/bindings", () => ({ commands: {} }));
vi.mock("@/lib/core/ipc", () => ({ callApi: vi.fn() }));

import { type FeedItem, importFeedItem } from "@/lib/plaza/feeds";

const item: FeedItem = {
	id: "item",
	subscriptionId: "feed",
	subscriptionTitle: "Feed",
	title: "Article",
	url: "https://example.com/article",
	paperUrl: null,
	publishedAt: null,
	summaryText: "",
	contentHtml: null,
	importedAt: null,
	readAt: null,
	bodyMarkdown: null,
};

beforeEach(() => {
	vi.resetAllMocks();
});

describe("feed URL import", () => {
	it("imports a normal webpage URL and accepts an existing library entry", async () => {
		lookupSubmit.mockImplementation(async (_urls, options) =>
			options.onComplete({
				imported: [],
				skipped: [{ reason: "already_in_library" }],
			}),
		);
		expect(await importFeedItem(item)).toBe(true);
		expect(lookupSubmit.mock.calls[0][0]).toEqual([item.url]);
	});
	it("prefers the identified paper URL", async () => {
		lookupSubmit.mockImplementation(async (_urls, options) =>
			options.onComplete({ imported: [{}], skipped: [] }),
		);
		expect(
			await importFeedItem({
				...item,
				paperUrl: "https://doi.org/10.1234/example",
			}),
		).toBe(true);
		expect(lookupSubmit.mock.calls[0][0]).toEqual([
			"https://doi.org/10.1234/example",
		]);
	});
	it("does not report a failed lookup as imported", async () => {
		lookupSubmit.mockImplementation(async (_urls, options) =>
			options.onComplete({ imported: [], skipped: [] }),
		);
		expect(await importFeedItem(item)).toBe(false);
	});
	it("reports rejected imports and skips entries with no URL", async () => {
		lookupSubmit.mockRejectedValue(new Error("No vault"));
		expect(await importFeedItem(item)).toBe(false);
		expect(notifyError).toHaveBeenCalledWith("No vault");
		lookupSubmit.mockClear();
		expect(await importFeedItem({ ...item, url: null })).toBe(false);
		expect(lookupSubmit).not.toHaveBeenCalled();
	});
});
