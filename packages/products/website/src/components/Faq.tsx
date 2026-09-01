import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { faqItems as items } from '@/lib/faq';

export default function Faq() {
	return (
		<Accordion type="single" collapsible className="w-full">
			{items.map((it, i) => (
				<AccordionItem key={i} value={`item-${i}`}>
					<AccordionTrigger>{it.q}</AccordionTrigger>
					<AccordionContent>{it.a}</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	);
}
