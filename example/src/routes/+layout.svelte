<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	const { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{data.serverShell.appName}</title>
</svelte:head>

<header class="shell">
	<div>
		<p class="eyebrow">sveltekit-effect-runtime</p>
		<h1>{data.serverShell.appName}</h1>
		<p>{data.serverShell.description}</p>
	</div>

	<div class="meta">
		<div>
			<strong>Server request</strong>
			<p>{data.serverShell.method} {data.serverShell.path}</p>
		</div>
		<div>
			<strong>Current load</strong>
			<p>{data.universalShell.path} via {data.universalShell.execution}</p>
		</div>
		<div>
			<strong>Request ID</strong>
			<p>{data.serverShell.requestId}</p>
		</div>
	</div>
</header>

<nav class="nav">
	<a href="/">Showcase</a>
	<a href="/secondary">Client navigation demo</a>
	<a href="/api/runtime" target="_blank" rel="noreferrer">API JSON</a>
	<a href="/api/runtime?format=text" target="_blank" rel="noreferrer">API text</a>
	<a href="/api/error" target="_blank" rel="noreferrer">Trigger handleError</a>
</nav>

{@render children()}

<style>
	.shell {
		display: grid;
		gap: 1.5rem;
		padding: 2rem 2rem 1rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.12);
		background:
			linear-gradient(120deg, rgba(14, 165, 233, 0.16), transparent 60%),
			linear-gradient(180deg, #f8fafc, #eef2ff);
	}

	.eyebrow {
		margin: 0 0 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.75rem;
		font-weight: 700;
		color: #0f766e;
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3rem);
	}

	.meta {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
	}

	.meta p,
	.shell p {
		margin: 0.25rem 0 0;
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 1rem 2rem 0;
	}

	.nav a {
		color: #0f172a;
		text-decoration: none;
		padding: 0.5rem 0.8rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.15);
	}

	:global(body) {
		margin: 0;
		font-family:
			'Iowan Old Style',
			'Palatino Linotype',
			'URW Palladio L',
			serif;
		color: #0f172a;
		background:
			radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent 30%),
			#fffdf8;
	}
 </style>
