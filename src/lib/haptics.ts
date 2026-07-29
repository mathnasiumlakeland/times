export type HapticKind = 'tap' | 'success';

type ButtonOverlay = {
	button: HTMLButtonElement;
	input: HTMLInputElement;
	removeListeners: () => void;
};

const tapPattern = [25];
const successPattern = [30, 60, 40];
const overlaySelector = '[data-direct-haptic-switch]';

let fallbackLabel: HTMLLabelElement | undefined;
let fallbackInput: HTMLInputElement | undefined;
let buttonObserver: MutationObserver | undefined;
let resizeObserver: ResizeObserver | undefined;
let overlayFrame: number | undefined;
let overlays = new Map<HTMLButtonElement, ButtonOverlay>();
let initialized = false;

function isAppleTouchDevice() {
	if (typeof navigator === 'undefined') return false;
	const userAgent = navigator.userAgent ?? '';
	const platform = navigator.platform ?? '';
	return /\b(iPad|iPhone|iPod)\b/.test(userAgent)
		|| (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isTouchDevice() {
	return typeof window !== 'undefined'
		&& (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
}

function ensureFallbackSwitch() {
	if (fallbackLabel || typeof document === 'undefined' || !document.body) return;

	const id = `multiply-mission-haptics-${Math.random().toString(36).slice(2)}`;
	const label = document.createElement('label');
	label.htmlFor = id;
	label.setAttribute('aria-hidden', 'true');
	Object.assign(label.style, {
		position: 'fixed',
		left: '-100vw',
		top: '-100vh',
		width: '1px',
		height: '1px',
		overflow: 'hidden',
		opacity: '0',
		pointerEvents: 'none',
		userSelect: 'none'
	});

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.id = id;
	input.tabIndex = -1;
	input.setAttribute('switch', '');
	input.setAttribute('aria-hidden', 'true');
	input.style.appearance = 'auto';
	label.append(input);
	document.body.append(label);
	fallbackLabel = label;
	fallbackInput = input;
}

function forwardPointerEvent(button: HTMLButtonElement, event: PointerEvent) {
	button.dispatchEvent(new PointerEvent(event.type, {
		bubbles: true,
		cancelable: true,
		pointerId: event.pointerId,
		pointerType: event.pointerType,
		isPrimary: event.isPrimary,
		clientX: event.clientX,
		clientY: event.clientY,
		button: event.button,
		buttons: event.buttons,
		pressure: event.pressure
	}));
}

function createButtonOverlay(button: HTMLButtonElement) {
	if (overlays.has(button)) return;

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.tabIndex = -1;
	input.dataset.directHapticSwitch = '';
	input.setAttribute('switch', '');
	input.setAttribute('aria-hidden', 'true');
	Object.assign(input.style, {
		position: 'fixed',
		zIndex: '2147483646',
		margin: '0',
		padding: '0',
		border: '0',
		opacity: '0',
		cursor: 'pointer',
		touchAction: 'manipulation',
		appearance: 'auto',
		webkitTapHighlightColor: 'transparent',
		pointerEvents: 'none'
	});
	input.style.setProperty('-webkit-appearance', 'switch');

	const handlePointerDown = (event: PointerEvent) => {
		if (button.disabled) return;
		button.classList.add('haptic-pressed');
		forwardPointerEvent(button, event);
	};
	const handlePointerEnd = (event: PointerEvent) => {
		button.classList.remove('haptic-pressed');
		forwardPointerEvent(button, event);
	};
	const handleClick = () => {
		if (!button.disabled) button.click();
		scheduleOverlaySync();
	};

	input.addEventListener('pointerdown', handlePointerDown);
	input.addEventListener('pointerup', handlePointerEnd);
	input.addEventListener('pointercancel', handlePointerEnd);
	input.addEventListener('click', handleClick);
	document.body.append(input);
	resizeObserver?.observe(button);

	overlays.set(button, {
		button,
		input,
		removeListeners: () => {
			input.removeEventListener('pointerdown', handlePointerDown);
			input.removeEventListener('pointerup', handlePointerEnd);
			input.removeEventListener('pointercancel', handlePointerEnd);
			input.removeEventListener('click', handleClick);
		}
	});
}

function removeButtonOverlay(button: HTMLButtonElement) {
	const overlay = overlays.get(button);
	if (!overlay) return;
	resizeObserver?.unobserve(button);
	overlay.removeListeners();
	overlay.input.remove();
	button.classList.remove('haptic-pressed');
	overlays.delete(button);
}

function collectButtons(root: ParentNode) {
	if (root instanceof HTMLButtonElement) createButtonOverlay(root);
	for (const button of root.querySelectorAll('button')) {
		if (button instanceof HTMLButtonElement) createButtonOverlay(button);
	}
}

function syncButtonOverlays() {
	overlayFrame = undefined;

	for (const { input } of overlays.values()) input.style.pointerEvents = 'none';

	for (const [button, overlay] of overlays) {
		if (!button.isConnected) {
			removeButtonOverlay(button);
			continue;
		}

		const rect = button.getBoundingClientRect();
		const style = window.getComputedStyle(button);
		const visible = rect.width > 0
			&& rect.height > 0
			&& rect.bottom > 0
			&& rect.right > 0
			&& rect.top < window.innerHeight
			&& rect.left < window.innerWidth
			&& style.display !== 'none'
			&& style.visibility !== 'hidden'
			&& style.opacity !== '0';

		Object.assign(overlay.input.style, {
			left: `${rect.left}px`,
			top: `${rect.top}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
			borderRadius: style.borderRadius
		});
		overlay.input.disabled = button.disabled || !visible;
		if (!visible || button.disabled) continue;

		const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
		const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
		const topElement = document.elementFromPoint(centerX, centerY);
		if (topElement === button || button.contains(topElement)) {
			overlay.input.style.pointerEvents = 'auto';
		}
	}
}

function scheduleOverlaySync() {
	if (overlayFrame !== undefined || typeof window === 'undefined') return;
	overlayFrame = window.requestAnimationFrame(syncButtonOverlays);
}

function handleDocumentMutations(mutations: MutationRecord[]) {
	let shouldSync = false;
	for (const mutation of mutations) {
		if (mutation.target instanceof Element && mutation.target.matches(overlaySelector)) continue;
		shouldSync = true;
		for (const node of mutation.addedNodes) {
			if (node instanceof Element && !node.matches(overlaySelector)) collectButtons(node);
		}
	}
	if (shouldSync) scheduleOverlaySync();
}

function initializeAppleButtonOverlays() {
	ensureFallbackSwitch();
	resizeObserver = typeof ResizeObserver === 'undefined'
		? undefined
		: new ResizeObserver(scheduleOverlaySync);
	collectButtons(document);
	buttonObserver = new MutationObserver(handleDocumentMutations);
	buttonObserver.observe(document.body, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class', 'disabled', 'hidden', 'style', 'aria-hidden']
	});
	window.addEventListener('resize', scheduleOverlaySync);
	window.addEventListener('scroll', scheduleOverlaySync, true);
	scheduleOverlaySync();
}

export function initializeHaptics() {
	if (initialized || typeof window === 'undefined' || !isTouchDevice()) return;
	initialized = true;
	if (isAppleTouchDevice()) initializeAppleButtonOverlays();
}

export function triggerHaptic(kind: HapticKind = 'tap') {
	if (typeof window === 'undefined' || !isTouchDevice()) return;
	initializeHaptics();

	if (isAppleTouchDevice()) {
		ensureFallbackSwitch();
		// This mirrors Soundboard's native-switch fallback. Direct button taps use the
		// transparent switches; this control supplies extra success pulses.
		fallbackLabel?.click();
		if (kind === 'success') {
			window.setTimeout(() => fallbackLabel?.click(), 90);
		}
		return;
	}

	if (typeof navigator.vibrate === 'function') {
		navigator.vibrate(kind === 'success' ? successPattern : tapPattern);
	}
}

export function destroyHaptics() {
	buttonObserver?.disconnect();
	buttonObserver = undefined;
	resizeObserver?.disconnect();
	resizeObserver = undefined;
	if (overlayFrame !== undefined) window.cancelAnimationFrame(overlayFrame);
	overlayFrame = undefined;
	window.removeEventListener('resize', scheduleOverlaySync);
	window.removeEventListener('scroll', scheduleOverlaySync, true);
	for (const button of [...overlays.keys()]) removeButtonOverlay(button);
	fallbackInput?.remove();
	fallbackLabel?.remove();
	fallbackInput = undefined;
	fallbackLabel = undefined;
	initialized = false;
}
