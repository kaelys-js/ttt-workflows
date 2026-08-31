import * as React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-6 shadow-sm',
				className,
			)}
			{...props}
		/>
	);
}
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return <div className={cn('font-semibold leading-none', className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return <div className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export { Card, CardTitle, CardDescription };
