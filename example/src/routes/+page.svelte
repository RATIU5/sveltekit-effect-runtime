<script lang="ts">
	const { data, form } = $props();

	const actionSummary = () =>
		form ? JSON.stringify(form, undefined, 2) : 'Submit one of the forms below to exercise wrapActions().';
</script>

<section class="grid">
	<article class="card">
		<h2>What this page uses</h2>
		<ul>
			<li><code>wrapInit</code> configures request and load layers in <code>hooks.server.ts</code>.</li>
			<li><code>wrapHandle</code> seeds <code>event.locals</code> and request IDs.</li>
			<li><code>wrapHandleFetch</code> forwards request metadata to internal fetches.</li>
			<li><code>wrapHandleError</code> is demonstrated by the <code>/api/error</code> route.</li>
			<li><code>wrapHandleValidationError</code> is wired globally for remote-function validation errors.</li>
			<li><code>wrapServerLoad</code>, <code>wrapActions</code>, <code>wrapHandler</code>, and <code>universalLoad</code> all run below.</li>
			<li>Runtime logging is configured once in <code>hooks.server.ts</code> with <code>logLevel: 'Debug'</code>.</li>
		</ul>
	</article>

	<article class="card">
		<h2>Server load snapshot</h2>
		<dl>
			<div><dt>Route</dt><dd>{data.serverDemo.path}</dd></div>
			<div><dt>Method</dt><dd>{data.serverDemo.method}</dd></div>
			<div><dt>User agent</dt><dd>{data.serverDemo.userAgent}</dd></div>
			<div><dt>Header from handleFetch</dt><dd>{data.universalShell.apiSnapshot.forwardedRequestId}</dd></div>
		</dl>
	</article>

	<article class="card">
		<h2>Universal load snapshot</h2>
		<dl>
			<div><dt>Execution</dt><dd>{data.universalShell.execution}</dd></div>
			<div><dt>Route ID</dt><dd>{data.universalShell.routeId}</dd></div>
			<div><dt>API format</dt><dd>{data.universalShell.apiSnapshot.format}</dd></div>
			<div><dt>API timestamp</dt><dd>{data.universalShell.apiSnapshot.computedAt}</dd></div>
		</dl>
		<p>Navigate to the secondary page and back. The root universal load reruns in the browser without touching the managed server runtime.</p>
	</article>
</section>

<section class="grid">
	<article class="card">
		<h2>Action: add two numbers</h2>
		<form method="POST" action="?/add">
			<label>
				<span>Left</span>
				<input name="left" type="number" value="2" />
			</label>
			<label>
				<span>Right</span>
				<input name="right" type="number" value="5" />
			</label>
			<button type="submit">Compute on the server</button>
		</form>
	</article>

	<article class="card">
		<h2>Action: uppercase a phrase</h2>
		<form method="POST" action="?/shout">
			<label>
				<span>Phrase</span>
				<input name="phrase" type="text" value="effect in sveltekit" />
			</label>
			<button type="submit">Run named action</button>
		</form>
	</article>

	<article class="card">
		<h2>Latest action result</h2>
		<pre>{actionSummary()}</pre>
	</article>
</section>

<section class="grid">
	<article class="card">
		<h2>API handler examples</h2>
		<p><a href="/api/runtime" target="_blank" rel="noreferrer">GET /api/runtime</a> returns JSON via <code>SvelteResponse.unsafeJson()</code>.</p>
		<p><a href="/api/runtime?format=text" target="_blank" rel="noreferrer">GET /api/runtime?format=text</a> returns text via <code>SvelteResponse.unsafeText()</code>.</p>
		<form method="POST" action="/api/runtime" target="_blank" rel="noreferrer" class="api-form">
			<label>
				<span>POST body</span>
				<input name="body" type="text" value="hello from the example app" />
			</label>
			<button type="submit">POST /api/runtime</button>
		</form>
		<pre>curl -I http://localhost:5173/api/runtime</pre>
	</article>

	<article class="card">
		<h2>Hook examples</h2>
		<p>The app injects a request ID in <code>wrapHandle()</code> and forwards it to internal fetches in <code>wrapHandleFetch()</code>.</p>
		<p><a href="/api/error" target="_blank" rel="noreferrer">GET /api/error</a> deliberately throws so <code>wrapHandleError()</code> can shape the error payload.</p>
		<p><code>wrapHandleValidationError()</code> is configured in <code>hooks.server.ts</code>, but SvelteKit only calls it for remote-function input validation failures.</p>
	</article>
 </section>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1rem;
		padding: 1rem 2rem 2rem;
	}

	.card {
		padding: 1.25rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(15, 23, 42, 0.08);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
	}

	h2 {
		margin-top: 0;
	}

	form {
		display: grid;
		gap: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
	}

	input {
		padding: 0.7rem 0.8rem;
		border: 1px solid rgba(15, 23, 42, 0.16);
		border-radius: 0.75rem;
		font: inherit;
	}

	button {
		padding: 0.8rem 1rem;
		border: none;
		border-radius: 999px;
		background: #0f766e;
		color: white;
		font: inherit;
		cursor: pointer;
	}

	dl {
		display: grid;
		gap: 0.75rem;
		margin: 0;
	}

	dl div {
		display: grid;
		gap: 0.2rem;
	}

	dt {
		font-weight: 700;
	}

	dd {
		margin: 0;
	}

	pre {
		margin: 0;
		padding: 1rem;
		overflow: auto;
		border-radius: 0.75rem;
		background: #0f172a;
		color: #f8fafc;
	}

	ul {
		padding-left: 1.2rem;
	}
</style>
