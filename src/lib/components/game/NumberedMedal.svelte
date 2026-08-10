<script lang="ts">
	let {
		number,
		size = 48,
		strokeWidth = 1.8,
		class: className
	}: {
		number: number;
		size?: number | string;
		strokeWidth?: number;
		class?: string;
	} = $props();

	let numberSize = $derived(number >= 10 ? 4.2 : 5.2);
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	focusable="false"
>
	<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
	<path d="M11 12 5.12 2.2" />
	<path d="m13 12 5.88-9.8" />
	<path d="M8 7h8" />
	<circle cx="12" cy="17" r="5" />
	<text
		x="12"
		y="18.75"
		text-anchor="middle"
		fill="currentColor"
		stroke="none"
		font-family="Space Grotesk, system-ui, sans-serif"
		font-size={numberSize}
		font-weight="800"
	>{number}</text>
</svg>
