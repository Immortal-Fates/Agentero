import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useTauriEvent } from "@/hooks/use-tauri-event";
import { commands, events, type WordRequest } from "@/lib/core/bindings";
import { callResult } from "@/lib/core/ipc";
import { notifyError } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { wordError } from "@/lib/word/errors";

export function WordCitationDialog() {
	const [request, setRequest] = useState<WordRequest | null>(null);
	const refresh = useCallback(async () => {
		if (!isTauri()) return;
		try {
			const status = await commands.wordGetStatus();
			setRequest(status.pending);
			if (status.error) notifyError(wordError(status.error));
		} catch (error) {
			notifyError(wordError(error));
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useTauriEvent(events.wordChanged, () => {
		void refresh();
	});
	return request ? (
		<WordCitationForm
			key={request.id}
			request={request}
			onClose={() => setRequest(null)}
		/>
	) : null;
}

function WordCitationForm({
	request,
	onClose,
}: {
	request: WordRequest;
	onClose: () => void;
}) {
	const { t } = useTranslation("settings");
	const [selected, setSelected] = useState(request.selected);
	const [query, setQuery] = useState("");
	const [locator, setLocator] = useState(request.locator);
	const [style, setStyle] = useState(request.style);
	const [busy, setBusy] = useState(false);
	const picking = request.command === "addEditCitation";
	const papers = request.papers.filter((p) =>
		`${p.title} ${p.authors.join(" ")} ${p.year ?? ""}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	const cancel = async () => {
		if (busy) return;
		try {
			await callResult(() => commands.wordCancel(request.id));
			onClose();
		} catch (error) {
			notifyError(wordError(error));
		}
	};
	const submit = async () => {
		if (busy || (picking && !selected.length)) return;
		setBusy(true);
		try {
			await callResult(() =>
				commands.wordSubmit({
					requestId: request.id,
					selected,
					locator,
					style,
				}),
			);
			onClose();
		} catch {
			/* Host emits the error with word:changed, including driver failures. */
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) void cancel();
			}}
		>
			<DialogContent
				aria-describedby={undefined}
				className="sm:max-w-xl"
				onEscapeKeyDown={(event) => {
					if (busy) event.preventDefault();
				}}
				onPointerDownOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>
						{t(`word.actions.${request.command}`, {
							defaultValue: t("word.commandUnsupported"),
						})}
					</DialogTitle>
				</DialogHeader>
				<p
					className="truncate text-sm text-muted-foreground"
					title={request.document}
				>
					{request.document}
				</p>
				{picking ? (
					<>
						<Input
							autoFocus
							aria-label={t("word.search")}
							placeholder={t("word.search")}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							disabled={busy}
						/>
						<div className="max-h-64 space-y-1 overflow-y-auto">
							{papers.map((paper) => (
								<label
									key={paper.id}
									className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent"
								>
									<input
										className="mt-1"
										type="checkbox"
										checked={selected.includes(paper.id)}
										disabled={busy}
										onChange={(event) =>
											setSelected((ids) =>
												event.target.checked
													? [...ids, paper.id]
													: ids.filter((id) => id !== paper.id),
											)
										}
									/>
									<span className="min-w-0">
										<span className="block text-sm">{paper.title}</span>
										<span className="block text-xs text-muted-foreground">
											{paper.authors.slice(0, 3).join(", ")} · {paper.year}
										</span>
									</span>
								</label>
							))}
							{!papers.length ? (
								<p className="p-2 text-sm text-muted-foreground">
									{t("word.noResults")}
								</p>
							) : null}
						</div>
						<label className="space-y-1 text-sm" htmlFor="word-locator">
							{t("word.pages")}
							<Input
								id="word-locator"
								value={locator}
								maxLength={100}
								disabled={busy}
								onChange={(event) => setLocator(event.target.value)}
							/>
						</label>
					</>
				) : null}
				<div className="flex items-center justify-between gap-4 text-sm">
					<label htmlFor="word-style">{t("word.style")}</label>
					<Select value={style} disabled={busy} onValueChange={setStyle}>
						<SelectTrigger id="word-style" aria-label={t("word.style")}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="apa">{t("word.styles.apa")}</SelectItem>
							<SelectItem value="ieee">{t("word.styles.ieee")}</SelectItem>
							<SelectItem value="chicago-author-date">
								{t("word.styles.chicago")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						disabled={busy}
						onClick={() => void cancel()}
					>
						{t("word.cancel")}
					</Button>
					<Button
						disabled={busy || (picking && !selected.length)}
						onClick={() => void submit()}
					>
						{t(busy ? "word.working" : "word.apply")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
