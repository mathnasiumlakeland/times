import { WebHaptics } from 'web-haptics';

export type HapticKind = 'tap' | 'success';

let haptics: WebHaptics | undefined;

export function triggerHaptic(kind: HapticKind = 'tap') {
	if (typeof window === 'undefined') return;
	if (navigator.maxTouchPoints === 0 && !window.matchMedia('(pointer: coarse)').matches) return;
	haptics ??= new WebHaptics();
	void haptics.trigger(
		kind === 'success'
			? 'success'
			: [{ duration: 25, intensity: 0.7 }]
	);
}

export function destroyHaptics() {
	haptics?.destroy();
	haptics = undefined;
}
