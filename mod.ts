import {
	DanetApplication,
} from './deps.ts';
import { StartOptions } from "https://deno.land/x/fresh@1.1.5/src/server/types.ts";
import { ServerContext } from "https://deno.land/x/fresh@1.1.5/src/server/context.ts";
import { dirname, fromFileUrl } from "https://deno.land/std@0.178.0/path/mod.ts";
import { collect, generate } from "https://deno.land/x/fresh@1.1.5/src/dev/mod.ts";
import { HttpContext } from "../danet/src/router/router.ts";
interface ManifestData {
	routes: string[];
	islands: string[];
}

export class FreshModule {
	static async enableFresh(app: DanetApplication, url: URL, prefix: string, freshOptions: StartOptions = {}) {
		await generateFreshManifest(url);
		const manifest = (await import(url + './fresh.gen.ts')).default;
		const handler = (await ServerContext.fromManifest(manifest, freshOptions))
			.handler();
		app.use(async (ctx, next) => {
			if (
				!ctx.request.url.toString().includes(prefix) &&
				!ctx.request.url.toString().includes('_frsh')
			) {
				return await next();
			}
			const req = createNewRequest(ctx, prefix);
			// deno-lint-ignore no-explicit-any
			const res = await handler(req, null as any);
			ctx.response.body = res.body;
			ctx.response.status = res.status;
			ctx.response.headers = res.headers;
		});
	}

	static async enableFreshOnRoot(
		app: DanetApplication,
		url: URL,
		prefix: string,
		freshOptions: StartOptions = {},
	) {
		await generateFreshManifest(url);
		const manifest = (await import(url + './fresh.gen.ts')).default;
		const handler = (await ServerContext.fromManifest(manifest, freshOptions))
			.handler();
		app.danetRouter.setPrefix(prefix);
		app.use(async (ctx, next) => {
			if (ctx.request.url.toString().includes(prefix)) {
				return await next();
			}
			const req = createNewRequest(ctx, '');
			// deno-lint-ignore no-explicit-any
			const res = await handler(req, null as any);
			ctx.response.body = res.body;
			ctx.response.status = res.status;
			ctx.response.headers = res.headers;
		});
	}
}


async function generateFreshManifest(url: URL) {
	const fileUrl = fromFileUrl(url);
	const dir = dirname(fileUrl + 'fakefile');
	let currentManifest: ManifestData;
	const prevManifest = Deno.env.get('FRSH_DEV_PREVIOUS_MANIFEST');
	if (prevManifest) {
		currentManifest = JSON.parse(prevManifest);
	} else {
		currentManifest = { islands: [], routes: [] };
	}
	const newManifest = await collect(dir);
	Deno.env.set('FRSH_DEV_PREVIOUS_MANIFEST', JSON.stringify(newManifest));

	const manifestChanged =
		!arraysEqual(newManifest.routes, currentManifest.routes) ||
		!arraysEqual(newManifest.islands, currentManifest.islands);

	if (manifestChanged) await generate(dir, newManifest);
}

function createNewRequest<AS>(ctx: HttpContext, prefix: string) {
	let newUrl = ctx.request.url.toString().replace(prefix, '');
	if (newUrl.endsWith('/')) {
		newUrl = newUrl.slice(0, -1);
	}
	const req = new Request(newUrl, {
		body: ctx.request.originalRequest.getBody().body,
		headers: ctx.request.headers,
		method: ctx.request.method,
	});
	return req;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; ++i) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}