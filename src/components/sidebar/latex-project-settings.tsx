/**
 * Project settings for one TeX root, laid out as settings rows.
 */

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	SettingsGroup,
	SettingsRow,
} from "@/components/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { notifyError } from "@/lib/core/notify";
import { basenameOf } from "@/lib/core/path";
import { trackTexProject } from "@/lib/tex/auto-build";
import {
	explicitTexRoot,
	getTexProjectSettings,
	setTexProjectRoot,
	setTexProjectSettings,
	type TexAutoBuild,
	type TexProjectSettings,
	validateTexSettings,
} from "@/lib/tex/config";
import { inspectLatexProject } from "@/lib/tex/host";
import { vaultStore } from "@/lib/vault/store";
import { inspectTexEngine } from "@/lib/workspace/tex-compile";

const AUTO_ROOT = "auto";

const RECIPE_EXAMPLE = [
	{
		name: "PDFLaTeX + latexmk",
		tools: [
			{
				command: "latexmk",
				args: [
					"-pdf",
					"-synctex=1",
					"-file-line-error",
					"-recorder",
					"-interaction=nonstopmode",
					"-outdir=%OUTDIR%",
					"%DOC%",
				],
			},
		],
	},
];

export function LatexProjectSettings({
	texPath,
	vaultPath = null,
}: {
	texPath: string;
	vaultPath?: string | null;
}) {
	const { t } = useTranslation("latexBuild");
	const id = useId();
	const vault = vaultPath ?? vaultStore.getState().vaultPath ?? "";
	const [draft, setDraft] = useState<TexProjectSettings>(() =>
		getTexProjectSettings(texPath),
	);
	const [root, setRoot] = useState(AUTO_ROOT);
	const [detectedRoot, setDetectedRoot] = useState(texPath);
	const [candidates, setCandidates] = useState<string[]>([]);
	const [recipes, setRecipes] = useState("[]");

	useEffect(() => {
		let cancelled = false;
		void inspectTexEngine(texPath)
			.then(async (choice) => {
				if (cancelled) return;
				const settings = getTexProjectSettings(choice.rootPath);
				const chosen = explicitTexRoot(texPath) ?? "";
				setDraft(settings);
				setRecipes(JSON.stringify(settings.recipes, null, 2));
				setDetectedRoot(choice.rootPath);
				setRoot(chosen || AUTO_ROOT);
				const project = await inspectLatexProject(texPath, vault);
				if (cancelled) return;
				setCandidates([
					...new Set(
						[chosen, choice.rootPath, texPath, ...project.candidates].filter(
							(path) => path.length > 0,
						),
					),
				]);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [texPath, vault]);

	async function persist(
		next: TexProjectSettings,
		recipesText: string,
		rootValue: string,
	) {
		try {
			const parsed = JSON.parse(recipesText) as unknown;
			const selected =
				Array.isArray(parsed) &&
				parsed.some(
					(recipe) =>
						!!recipe &&
						typeof recipe === "object" &&
						"name" in recipe &&
						recipe.name === next.selectedRecipe,
				)
					? next.selectedRecipe
					: null;
			const validated = validateTexSettings({
				...next,
				recipes: parsed,
				recipe: null,
				selectedRecipe: selected,
			});
			const chosen = rootValue === AUTO_ROOT ? "" : rootValue;
			const project = await inspectLatexProject(texPath, vault, chosen || null);
			setTexProjectRoot(texPath, chosen);
			setTexProjectSettings(project.rootPath, validated);
			await trackTexProject(project.rootPath);
		} catch (error) {
			notifyError(
				error instanceof SyntaxError ? t("invalidJson") : t("invalidSettings"),
			);
		}
	}

	function commit(
		next: TexProjectSettings = draft,
		recipesText: string = recipes,
		rootValue: string = root,
	) {
		void persist(next, recipesText, rootValue);
	}

	return (
		<SettingsGroup>
			<SettingsRow label={t("rootFile")} htmlFor={`${id}-root`}>
				<Select
					value={root}
					onValueChange={(value) => {
						setRoot(value);
						commit(draft, recipes, value);
					}}
				>
					<SelectTrigger id={`${id}-root`} size="sm" className="w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={AUTO_ROOT}>
							{t("automaticRoot", {
								name: basenameOf(detectedRoot),
							})}
						</SelectItem>
						{candidates.map((path) => (
							<SelectItem key={path} value={path} title={path}>
								{basenameOf(path)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingsRow>
			<SettingsRow label={t("autoBuild")} htmlFor={`${id}-auto`}>
				<Select
					value={draft.autoBuild}
					onValueChange={(value) => {
						const next = { ...draft, autoBuild: value as TexAutoBuild };
						setDraft(next);
						commit(next);
					}}
				>
					<SelectTrigger id={`${id}-auto`} size="sm" className="w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="never">{t("manual")}</SelectItem>
						<SelectItem value="onSave">{t("onSave")}</SelectItem>
						<SelectItem value="onFileChange">{t("onFileChange")}</SelectItem>
					</SelectContent>
				</Select>
			</SettingsRow>
			<SettingsRow label={t("syncAfterBuild")} htmlFor={`${id}-sync`}>
				<Switch
					id={`${id}-sync`}
					checked={draft.syncAfterBuild}
					onCheckedChange={(checked) => {
						const next = { ...draft, syncAfterBuild: checked };
						setDraft(next);
						commit(next);
					}}
				/>
			</SettingsRow>
			{(["outDir", "auxDir", "jobname"] as const).map((key) => (
				<SettingsRow key={key} label={t(key)} htmlFor={`${id}-${key}`}>
					<Input
						id={`${id}-${key}`}
						className="w-40"
						value={draft[key]}
						placeholder={key === "jobname" ? undefined : "."}
						onChange={(event) =>
							setDraft({ ...draft, [key]: event.target.value })
						}
						onBlur={() => commit()}
					/>
				</SettingsRow>
			))}
			<div className="grid gap-2 px-3.5 py-2.5">
				<Label htmlFor={`${id}-recipes`} className="font-normal text-sm">
					{t("recipes")}
				</Label>
				<textarea
					id={`${id}-recipes`}
					spellCheck={false}
					className="border-input bg-transparent min-h-32 w-full rounded-md border px-2 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					value={recipes}
					aria-label={t("recipeJson")}
					onChange={(event) => setRecipes(event.target.value)}
					onBlur={() => commit(draft, recipes)}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="justify-self-start"
					onClick={() => {
						const text = JSON.stringify(RECIPE_EXAMPLE, null, 2);
						setRecipes(text);
						commit(draft, text);
					}}
				>
					{t("recipeExample")}
				</Button>
			</div>
		</SettingsGroup>
	);
}
