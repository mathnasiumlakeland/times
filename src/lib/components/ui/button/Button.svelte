<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'default' | 'sm' | 'icon';

	let {
		variant = 'primary',
		size = 'default',
		class: className,
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: Variant;
		size?: Size;
		class?: string;
		children: import('svelte').Snippet;
	} = $props();

	const variants: Record<Variant, string> = {
		primary:
			'bg-[var(--lime)] text-[var(--ink)] shadow-[0_5px_0_#93a900] hover:-translate-y-0.5 hover:shadow-[0_7px_0_#93a900]',
		secondary:
			'bg-white text-[var(--ink)] shadow-[0_4px_0_rgba(12,21,41,0.16)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_rgba(12,21,41,0.16)]',
		ghost: 'bg-transparent text-current hover:bg-black/5',
		danger: 'bg-[var(--coral)] text-white shadow-[0_5px_0_#b93639] hover:-translate-y-0.5'
	};

	const sizes: Record<Size, string> = {
		default: 'min-h-12 px-6 py-3',
		sm: 'min-h-10 px-4 py-2 text-sm',
		icon: 'size-10 p-0'
	};
</script>

<button
	class={cn(
		'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-bold tracking-[-0.01em] transition-[transform,box-shadow,background-color] duration-200 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45',
		variants[variant],
		sizes[size],
		className
	)}
	{...rest}
>
	{@render children()}
</button>
