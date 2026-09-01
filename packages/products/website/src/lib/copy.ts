// Copy-to-clipboard behaviour for the framework-free CopyCommand button. Lives here rather than
// in a UI framework so it is unit-tested directly; the control is a plain server-rendered button
// whose script calls wireCopyButtons() once on load.

// Copy text to the clipboard. Returns true on success, false when the Clipboard API is
// unavailable or rejects, so the caller can decide whether to flash the copied state.
export async function copyText(text: string): Promise<boolean> {
	if (!navigator.clipboard) return false;
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

// How long the check mark stays shown after a successful copy, in milliseconds.
export const COPIED_MS = 1600;

// Wire every [data-copy] button on the page: on click, copy its data-copy value and toggle the
// data-copied attribute for COPIED_MS so CSS can swap the copy icon for the check. Idempotent —
// safe to call once per load. Exported so it can be exercised in a jsdom unit test.
export function wireCopyButtons(root: ParentNode = document): void {
	for (const el of root.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
		el.addEventListener('click', () => {
			void copyText(el.dataset.copy ?? '').then((ok) => {
				if (!ok) return;
				el.setAttribute('data-copied', '');
				window.setTimeout(() => el.removeAttribute('data-copied'), COPIED_MS);
			});
		});
	}
}
