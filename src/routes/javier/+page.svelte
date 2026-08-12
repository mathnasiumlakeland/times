<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import JavierKartRacer from '$lib/components/game/JavierKartRacer.svelte';
	import { MidiPlayer } from '$lib/midi-player';

	type MusicStatus = 'off' | 'loading' | 'playing' | 'unavailable';
	type MusicTheme = 'menu' | 'rainbow' | 'coconut';
	const musicPreferenceStorageKey = 'multiply-mission-javier-music-enabled';
	const musicUrls: Record<MusicTheme, string> = {
		menu: '/audio/grand-prix-menu-theme.mid',
		rainbow: '/audio/rainbow-road-theme.mid',
		coconut: '/audio/coconut-mall-theme.mid'
	};

	let musicStatus = $state<MusicStatus>('loading');
	let musicPlayers: Record<MusicTheme, MidiPlayer> | undefined;
	let musicLoads: Record<MusicTheme, Promise<boolean>> | undefined;
	let activeMusicTheme: MusicTheme = 'menu';
	let musicRequested = true;
	let musicPlaybackId = 0;
	let gameVisualReady = false;

	onMount(() => {
		musicPlayers = {
			menu: new MidiPlayer(0.52),
			rainbow: new MidiPlayer(0.56),
			coconut: new MidiPlayer(0.58)
		};
		musicLoads = {
			menu: loadTheme(musicPlayers.menu, musicUrls.menu),
			rainbow: loadTheme(musicPlayers.rainbow, musicUrls.rainbow),
			coconut: loadTheme(musicPlayers.coconut, musicUrls.coconut)
		};
		try {
			const savedPreference = localStorage.getItem(musicPreferenceStorageKey);
			if (savedPreference !== null) musicRequested = savedPreference === 'true';
		} catch {
			// Private browsing can block storage without blocking the game.
		}
		if (gameVisualReady) void playMusicTheme('menu');
	});

	onDestroy(() => {
		musicPlaybackId += 1;
		if (musicPlayers) {
			for (const player of Object.values(musicPlayers)) player.destroy();
		}
		musicPlayers = undefined;
		musicLoads = undefined;
	});

	function loadTheme(player: MidiPlayer, url: string) {
		return player.load(url).then(() => true).catch(() => false);
	}

	function saveMusicPreference(enabled: boolean) {
		try {
			localStorage.setItem(musicPreferenceStorageKey, String(enabled));
		} catch {
			// Music remains usable when storage is unavailable.
		}
	}

	async function playMusicTheme(theme: MusicTheme) {
		const players = musicPlayers;
		const loads = musicLoads;
		if (!players || !loads) return;
		const changingTheme = theme !== activeMusicTheme;
		activeMusicTheme = theme;
		if (changingTheme) {
			musicPlaybackId += 1;
			for (const [playerTheme, player] of Object.entries(players)) {
				if (playerTheme !== theme) player.pause();
			}
		}
		if (!gameVisualReady) return;

		if (!musicRequested) {
			musicStatus = 'off';
			return;
		}
		const player = players[theme];
		if (player.isPlaying) {
			musicStatus = 'playing';
			return;
		}

		const playbackId = ++musicPlaybackId;
		musicStatus = 'loading';
		const loaded = await loads[theme];
		if (playbackId !== musicPlaybackId || theme !== activeMusicTheme) return;
		if (!loaded) {
			musicStatus = 'unavailable';
			return;
		}

		try {
			await player.play();
			if (playbackId !== musicPlaybackId || theme !== activeMusicTheme) {
				player.pause();
				return;
			}
			musicStatus = 'playing';
		} catch {
			if (playbackId === musicPlaybackId) musicStatus = 'off';
		}
	}

	function handleVisualReady() {
		if (gameVisualReady) return;
		gameVisualReady = true;
		void playMusicTheme(activeMusicTheme);
	}

	function switchMusicTheme(theme: MusicTheme) {
		void musicPlayers?.[theme].unlock().catch(() => {
			// A later tap on the music control can retry if the browser blocks this gesture.
		});
		void playMusicTheme(theme);
	}

	function toggleBackgroundMusic() {
		const player = musicPlayers?.[activeMusicTheme];
		if (!player || musicStatus === 'unavailable') return;
		if (musicStatus === 'loading') {
			void player.unlock().catch(() => {
				musicStatus = 'off';
			});
			return;
		}
		if (musicStatus === 'playing') {
			musicRequested = false;
			musicPlaybackId += 1;
			player.pause();
			musicStatus = 'off';
			saveMusicPreference(false);
			return;
		}

		musicRequested = true;
		saveMusicPreference(true);
		void playMusicTheme(activeMusicTheme);
	}

	function unlockMusic() {
		const player = musicPlayers?.[activeMusicTheme];
		if (!musicRequested || !player) return;
		if (musicStatus === 'off') {
			void playMusicTheme(activeMusicTheme);
			return;
		}
		// iOS may leave an autoplay resume pending in the loading state. Always
		// pass the next trusted gesture through to the active AudioContext.
		void player.unlock().catch(() => {
			// The game music button stays available if this gesture is rejected.
		});
	}

	function handleAudioUnlock(event: PointerEvent) {
		if (!event.isTrusted) return;
		if (event.target instanceof Element && event.target.closest('.jkr-music')) return;
		unlockMusic();
	}
</script>

<svelte:head>
	<title>Grand Prix | Multiply Mission</title>
	<meta name="description" content="A secret two-course browser kart racer." />
	<meta name="theme-color" content="#070b19" />
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:document onpointerdown={handleAudioUnlock} />

<JavierKartRacer
	{musicStatus}
	onToggleMusic={toggleBackgroundMusic}
	onAudioGesture={unlockMusic}
	onMusicThemeChange={switchMusicTheme}
	onVisualReady={handleVisualReady}
/>
