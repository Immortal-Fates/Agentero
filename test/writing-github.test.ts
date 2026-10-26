import { describe, expect, it } from "vitest";
import {
	normalizeBranch,
	parseGitHubRemote,
	readWritingGitHub,
	type WritingGitHubLink,
	writeWritingGitHub,
} from "@/lib/writing/github";

function memory() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
}

describe("writing github link", () => {
	it("accepts a GitHub repository and rejects anything else", () => {
		expect(parseGitHubRemote("https://github.com/ada/writing")).toEqual({
			remote: "https://github.com/ada/writing.git",
			label: "ada/writing",
		});
		expect(parseGitHubRemote("git@github.com:ada/writing.git")).toEqual({
			remote: "https://github.com/ada/writing.git",
			label: "ada/writing",
		});
		expect(parseGitHubRemote("https://gitlab.com/ada/writing")).toBeNull();
		expect(
			parseGitHubRemote("https://github.com/ada/writing/extra"),
		).toBeNull();
		expect(normalizeBranch("main")).toBe("main");
		expect(normalizeBranch("../main")).toBeNull();
	});

	it("remembers the repository for one vault", () => {
		const storage = memory();
		const link: WritingGitHubLink = {
			remote: "https://github.com/ada/writing.git",
			branch: "main",
			label: "ada/writing",
		};
		writeWritingGitHub("D:/vault", link, storage);
		expect(readWritingGitHub("D:/vault", storage)).toEqual(link);
		expect(readWritingGitHub("D:/other", storage)).toBeNull();
	});
});
