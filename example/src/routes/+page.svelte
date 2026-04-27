<script lang="ts">
	import {
		getGreeting,
		getRemoteSnapshot,
		incrementRemoteCounter,
		saveRemoteNote
	} from './bridge.remote';

	const { data, form } = $props();

	const remoteSnapshotQuery = getRemoteSnapshot();
	const initialRemoteSnapshot = await remoteSnapshotQuery;
	const greeting = await getGreeting('Bridge user');

	const remoteSnapshot = $derived(remoteSnapshotQuery.current ?? initialRemoteSnapshot);

	let commandResult = $state<Awaited<ReturnType<typeof incrementRemoteCounter>>>();
	let commandPending = $state(false);
	let commandError = $state<string>();

	const incrementCounter = async () => {
		commandPending = true;
		commandError = undefined;
		try {
			commandResult = await incrementRemoteCounter(1).updates(
				remoteSnapshotQuery.withOverride((current) => ({
					...current,
					snapshot: {
						...current.snapshot,
						counter: current.snapshot.counter + 1
					}
				}))
			);
		} catch (error) {
			commandError = error instanceof Error ? error.message : 'Unable to increment counter';
		} finally {
			commandPending = false;
		}
	};
</script>

<svelte:head>
	<title>SvelteKit Effect Bridge Example</title>
</svelte:head>

<main class="workspace">
	<header class="page-head">
		<div>
			<p class="eyebrow">Runtime bridge example</p>
			<h1>{data.load.appName}</h1>
		</div>
		<div class="links">
			<a class="endpoint" href="/test">Open JSON endpoint</a>
			<a class="secondary-link" href="/test?missing=true">404 mapping</a>
			<a class="secondary-link" href="/test?login=true">Redirect mapping</a>
		</div>
	</header>

	<section class="grid">
		<div class="panel">
			<h2>Server load</h2>
			<dl>
				<div>
					<dt>Route</dt>
					<dd>{data.load.routeId ?? 'unknown'}</dd>
				</div>
				<div>
					<dt>Path</dt>
					<dd>{data.load.path}</dd>
				</div>
				<div>
					<dt>Stored name</dt>
					<dd>{data.snapshot.lastName}</dd>
				</div>
			</dl>
		</div>

		<div class="panel">
			<h2>SvelteKit action</h2>
			<form method="POST" action="?/remember" class="stack">
				<label>
					<span>Name</span>
					<input name="name" value={data.snapshot.lastName} autocomplete="name" />
				</label>
				<button type="submit">Remember name</button>
			</form>
			{#if form?.message}
				<p class="result">{form.message}</p>
			{/if}
		</div>

		<div class="panel">
			<h2>Remote query</h2>
			<dl>
				<div>
					<dt>Counter</dt>
					<dd>{remoteSnapshot.snapshot.counter}</dd>
				</div>
				<div>
					<dt>Request path</dt>
					<dd>{remoteSnapshot.request.path}</dd>
				</div>
				<div>
					<dt>Request id</dt>
					<dd>{remoteSnapshot.request.requestId}</dd>
				</div>
			</dl>
		</div>

		<div class="panel">
			<h2>Schema query</h2>
			<p class="result">{greeting.greeting}</p>
			<p class="muted">Resolved from {greeting.requestPath}</p>
		</div>

		<div class="panel">
			<h2>Remote command</h2>
			<div class="inline">
				<button type="button" onclick={incrementCounter} disabled={commandPending}>
					Increment counter
				</button>
				{#if commandResult}
					<strong>{commandResult.counter}</strong>
				{/if}
			</div>
			{#if commandResult}
				<p class="muted">Last command request: {commandResult.requestId}</p>
			{/if}
			{#if commandError}
				<p class="error">{commandError}</p>
			{/if}
		</div>

		<div class="panel">
			<h2>Remote form</h2>
			<form {...saveRemoteNote} class="stack">
				<label>
					<span>Note</span>
					<input name="message" placeholder="Add a short note" />
				</label>
				<button type="submit" disabled={saveRemoteNote.pending > 0}>Save note</button>
			</form>
			{#if saveRemoteNote.result}
				<p class="muted">Saved by request {saveRemoteNote.result.requestId}</p>
			{/if}
		</div>
	</section>

	<section class="notes">
		<h2>Store snapshot</h2>
		<ul>
			{#each data.snapshot.notes as note}
				<li>{note}</li>
			{/each}
		</ul>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f7f7f4;
		color: #1f2528;
		font-family:
			Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}

	.workspace {
		width: min(1120px, calc(100vw - 32px));
		margin: 0 auto;
		padding: 32px 0 48px;
	}

	.page-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
		border-bottom: 1px solid #d7d9d2;
		padding-bottom: 18px;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: 34px;
		line-height: 1.1;
		font-weight: 720;
	}

	h2 {
		font-size: 16px;
		line-height: 1.3;
		font-weight: 700;
	}

	.eyebrow,
	.muted,
	dt {
		color: #5d6668;
	}

	.eyebrow {
		margin-bottom: 6px;
		font-size: 13px;
		text-transform: uppercase;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
	}

	.panel,
	.notes {
		border: 1px solid #d7d9d2;
		border-radius: 8px;
		background: #ffffff;
		padding: 16px;
	}

	.panel {
		display: grid;
		gap: 14px;
		min-height: 184px;
	}

	dl {
		display: grid;
		gap: 10px;
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: 92px minmax(0, 1fr);
		gap: 12px;
	}

	dt,
	dd,
	.muted,
	.result,
	.error,
	li {
		font-size: 14px;
		line-height: 1.45;
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.stack {
		display: grid;
		gap: 10px;
	}

	label {
		display: grid;
		gap: 6px;
		font-size: 13px;
		color: #3e474a;
	}

	input {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid #c8cbc3;
		border-radius: 6px;
		padding: 9px 10px;
		font: inherit;
	}

	button,
	.endpoint {
		border: 1px solid #1f2528;
		border-radius: 6px;
		background: #1f2528;
		color: #ffffff;
		padding: 9px 12px;
		font: inherit;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}

	.secondary-link {
		border: 1px solid #c8cbc3;
		border-radius: 6px;
		color: #1f2528;
		padding: 9px 12px;
		font-size: 14px;
		font-weight: 650;
		text-decoration: none;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.inline {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.result {
		color: #255c3b;
	}

	.error {
		color: #a32121;
	}

	.notes {
		margin-top: 14px;
	}

	.notes ul {
		display: grid;
		gap: 8px;
		margin: 12px 0 0;
		padding-left: 18px;
	}

	@media (max-width: 860px) {
		.page-head {
			align-items: flex-start;
			flex-direction: column;
		}

		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
