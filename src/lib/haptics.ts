export type HapticKind = 'tap' | 'success';

function isMobileDevice() {
	return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}

function triggerIosSwitchHaptic() {
	const switchInput = document.createElement('input');
	switchInput.type = 'checkbox';
	switchInput.setAttribute('switch', '');
	switchInput.tabIndex = -1;
	switchInput.setAttribute('aria-hidden', 'true');
	Object.assign(switchInput.style, {
		position: 'fixed',
		width: '1px',
		height: '1px',
		top: '-10px',
		left: '-10px',
		opacity: '0',
		pointerEvents: 'none'
	});
	document.body.append(switchInput);
	switchInput.click();
	window.setTimeout(() => switchInput.remove(), 100);
}

export function triggerHaptic(kind: HapticKind = 'tap') {
	if (!isMobileDevice()) return;

	if (typeof navigator.vibrate === 'function') {
		navigator.vibrate(kind === 'success' ? [18, 55, 24, 45, 34] : 10);
		return;
	}

	// Safari 18+ gives native haptic feedback when an HTML switch is toggled.
	triggerIosSwitchHaptic();
}
