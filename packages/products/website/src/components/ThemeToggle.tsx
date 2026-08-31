import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ThemeToggle() {
	const [dark, setDark] = useState(false);
	useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

	function toggle() {
		const root = document.documentElement;
		const next = !root.classList.contains('dark');
		const apply = () => {
			root.classList.toggle('dark', next);
			localStorage.setItem('theme', next ? 'dark' : 'light');
			setDark(next);
		};

		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduce) {
			apply();
			return;
		}

		// Preferred: a whole-viewport crossfade via the View Transitions API.
		const startVT = (document as unknown as { startViewTransition?: (cb: () => void) => unknown })
			.startViewTransition;
		if (typeof startVT === 'function') {
			startVT.call(document, apply);
			return;
		}

		// Fallback for browsers without View Transitions: briefly transition surface colors.
		root.classList.add('theme-anim');
		apply();
		window.setTimeout(() => root.classList.remove('theme-anim'), 320);
	}

	return (
		<Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
			{dark ? <Sun /> : <Moon />}
		</Button>
	);
}
