import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: await sveltekit(),
	resolve: {
		dedupe: ['@sveltejs/kit']
	}
});
