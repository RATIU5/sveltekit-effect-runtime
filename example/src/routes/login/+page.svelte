<script lang="ts">
	const { data } = $props();
</script>

<svelte:head>
	<title>Login | SvelteKit Effect Bridge Example</title>
</svelte:head>

<main class="login">
	<p class="eyebrow">Redirect mapping</p>
	<h1>Login route reached</h1>
	<p>
		The endpoint mapped a domain failure to a SvelteKit redirect and landed here.
	</p>
	<a href={data.next}>Return to {data.next}</a>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f7f7f4;
		color: #1f2528;
		font-family:
			Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}

	.login {
		width: min(680px, calc(100vw - 32px));
		margin: 0 auto;
		padding: 56px 0;
	}

	.eyebrow {
		margin: 0 0 8px;
		color: #5d6668;
		font-size: 13px;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: 34px;
		line-height: 1.1;
	}

	p {
		margin: 16px 0 20px;
		line-height: 1.6;
	}

	a {
		color: #0d5f6c;
		font-weight: 700;
	}
</style>
