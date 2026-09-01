import { type FaqItem, parseFaqItems } from '@/lib/schemas';

// The FAQ is read by two consumers — the on-page accordion (Faq.tsx) and the FAQPage JSON-LD in
// the layout — so it lives here as one validated source. parseFaqItems throws at build if an
// item is malformed, turning a bad edit into a build failure instead of broken rich-result markup.
export const faqItems: FaqItem[] = parseFaqItems([
	{
		q: 'What is ttt-workflows?',
		a: 'A plugin for Claude Code. It bundles three self-contained skills — pr-review, sec-audit, and trp — that you invoke inside a Claude Code session. It is not an app and there is nothing to download and run: you install it from a marketplace and call a skill by pasting a URL or a ticket.',
	},
	{
		q: 'Do I have to trust it with my repo?',
		a: 'It reads the target you point it at — a PR, a repo, a path, or live cloud state — to do its work. Nothing is baked in: no client data, no hardcoded tenants. It runs in your own Claude Code session against the things you name, and the source is open, so you can read exactly what each skill does before you run it.',
	},
	{
		q: 'Is it really read-only?',
		a: "By default, yes. pr-review never posts, comments, approves, resolves, or merges — it hands you a paste-ready review and you decide what to do with it. sec-audit's target-resolve, review, and sweep analysis are read-only; anything that stands up infrastructure, writes a repo, or opens a PR is gated behind an explicit approval, and even a fix is a PR opened, never merged. trp presents a plan and stops — no branch, no write, nothing hard to undo happens until you say go.",
	},
	{
		q: 'Does it work on GitHub and Azure DevOps?',
		a: "Both. pr-review takes a github.com or dev.azure.com pull-request URL; trp detects the platform from the repo's remote and routes accordingly; sec-audit resolves a repo or PR on either host. The platform is detected for you — you don't configure it.",
	},
	{
		q: 'How do updates work through the marketplace?',
		a: 'A new version reaches you only when the plugin\'s version field is bumped. Third-party marketplaces do not auto-update by default, so you pull the latest with "/plugin marketplace update ttt-workflows" and then "/reload-plugins" — or enable auto-update for the marketplace and Claude Code refreshes it in the background and prompts the reload. Either way you decide when to update; nothing changes under you.',
	},
	{
		q: 'Is my data sent anywhere?',
		a: 'There is no telemetry and no phone-home in the plugin. Each skill works within your Claude Code session against the targets you give it, using the tools already on your machine (git, gh, az, the scanners). Working files are written to a scratch directory, never into the repo you are auditing or reviewing.',
	},
]);
