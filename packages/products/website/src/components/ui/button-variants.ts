import { cva, type VariantProps } from 'class-variance-authority';

// The button's class recipe, framework-free. Lives apart from any React component so the Astro
// buttons (theme toggle, GitHub link) can pull it in without dragging React into the build. The
// class strings are unchanged from the old ui/button.tsx, so every button renders exactly as before.
export const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
				outline:
					'border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 rounded-md px-3',
				lg: 'h-11 rounded-md px-6 text-base',
				icon: 'size-9',
			},
		},
		defaultVariants: { variant: 'default', size: 'default' },
	},
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
