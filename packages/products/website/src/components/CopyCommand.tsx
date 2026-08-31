import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CopyCommand({ cmd }: { cmd: string }) {
	const [copied, setCopied] = useState(false);
	function copy() {
		navigator.clipboard?.writeText(cmd).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		});
	}
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-3 font-mono text-sm">
			<code className="overflow-x-auto whitespace-nowrap text-foreground/90">{cmd}</code>
			<button
				onClick={copy}
				aria-label="Copy command"
				className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
			>
				{copied ? (
					<Check className="size-4 text-primary motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in motion-safe:duration-300" />
				) : (
					<Copy className="size-4" />
				)}
			</button>
		</div>
	);
}
