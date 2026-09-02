import { type FaqItem, parseFaqItems } from '@/lib/schemas';

// The FAQ is read by two consumers: the on-page accordion (Faq.astro) and the FAQPage JSON-LD in
// the layout, so it lives here as one validated source. parseFaqItems throws at build if an
// item is malformed, turning a bad edit into a build failure instead of broken rich-result markup.
export const faqItems: FaqItem[] = parseFaqItems([
	{
		q: 'What is ttt-workflows?',
		a: 'A plugin for Claude Code. It bundles four self-contained skills (pr-review, sec-audit, trp, and copy-audit) that you invoke inside a Claude Code session. It is not an app and there is nothing to download and run: you install it from a marketplace and call a skill by pasting a URL, a ticket, or a repo path.',
	},
	{
		q: 'Do I have to trust it with my repo?',
		a: 'It reads whatever you point it at (a PR, a repo, a path, or live cloud state) to do its work. Nothing is baked in: no client data, no hardcoded tenants. It runs in your own Claude Code session against the things you name, and the source is open, so you can read exactly what each skill does before you run it.',
	},
	{
		q: 'Is it really read-only?',
		a: "By default, yes. pr-review only hands you a paste-ready review — it never posts, comments, approves, or merges. sec-audit reads your code and cloud read-only; anything that writes a repo, creates cloud resources, or opens a PR waits for your approval, and a fix is a PR opened, never merged. trp presents a plan and stops. copy-audit proposes rewrites and writes nothing to disk until you approve. Nothing you can't undo happens before you say yes.",
	},
	{
		q: 'Does it work on GitHub and Azure DevOps?',
		a: "Both. pr-review takes a github.com or dev.azure.com pull-request URL; trp detects the platform from the repo's remote and routes accordingly; sec-audit resolves a repo or PR on either host. The platform is detected for you; you do not configure it.",
	},
	{
		q: 'How do updates work through the marketplace?',
		a: 'You get a new version only when we publish one. Third-party marketplaces do not auto-update by default, so pull the latest with "/plugin marketplace update ttt-workflows" and then "/reload-plugins". Or turn on auto-update, and Claude Code refreshes it in the background and prompts you to reload. Either way, you choose when to install.',
	},
	{
		q: 'What does copy-audit review, and how does it avoid breaking code?',
		a: 'It audits the words a repo ships: UI microcopy, markdown docs and prose, and copy values in JSON and YAML, judged against four content pillars — plain language, inclusive language, UX microcopy, and voice and grammar. With --mode=comments it turns the same lens on code-comment slop and test names instead. Each string is judged in its full-file context and gets one verdict: keep, rewrite, flag, or delete. When you apply a rewrite, only the text changes — the code around it stays exactly as it was, and a check confirms it. You review every proposed rewrite before anything is written to disk.',
	},
	{
		q: 'Is my data sent anywhere?',
		a: 'There is no telemetry and no phone-home in the plugin. Each skill works within your Claude Code session against the targets you give it, using the tools already on your machine (git, gh, az, the scanners). Working files are written to a scratch directory, never into the repo you are auditing or reviewing.',
	},
]);
