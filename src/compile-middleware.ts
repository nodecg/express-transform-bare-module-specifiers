/**
 * Based entirely on:
 * https://github.com/Polymer/tools/blob/e731b880a0d94a551f5781111f2f9c81cb64c642/packages/polyserve/src/compile-middleware.ts
 */

import {parse as parseContentType} from 'content-type';
import {Request, RequestHandler, Response} from 'express';
import * as LRU from 'lru-cache';
import * as path from 'path';
import * as babel from '@babel/core';

import {transformResponse} from './transform-middleware';

const javaScriptMimeTypes = [
	'application/javascript',
	'application/ecmascript',
	'text/javascript',
	'text/ecmascript'
];

const compileMimeTypes = [...javaScriptMimeTypes];

function getContentType(response: Response) {
	const contentTypeHeader = response.get('Content-Type');
	return contentTypeHeader && parseContentType(contentTypeHeader).type;
}

export const babelCompileCache = LRU<string, string>({
	length: (n: string, key: string) => n.length + key.length,
	max: 52428800
});

// TODO(justinfagnani): see if we can just use the request path as the key
// See https://github.com/Polymer/polyserve/issues/248
export const getCompileCacheKey = (requestPath: string, body: string): string => requestPath + body;

export function babelCompile(
	{rootDir = process.cwd(), modulesUrl = '/node_modules'}:
	{rootDir?: string; modulesUrl?: string} = {}
): RequestHandler {
	return transformResponse({
		shouldTransform(request: Request, response: Response) {
			if ('nocompile' in request.query) {
				return false;
			}
			if (!compileMimeTypes.includes(getContentType(response))) {
				return false;
			}
			return true;
		},

		transform(request: Request, response: Response, body: string): string {
			const cacheKey = getCompileCacheKey(request.baseUrl + request.path, body);
			const cached = babelCompileCache.get(cacheKey);
			if (cached !== undefined) {
				return cached;
			}

			const contentType = getContentType(response);

			let transformed = body;
			if (javaScriptMimeTypes.includes(contentType)) {
				const result = babel.transformSync(body, {
					filename: path.resolve(rootDir, request.path.replace(/^\//, '')),
					plugins: [
						['bare-import-rewrite', {
							modulesDir: modulesUrl,
							rootBaseDir: rootDir
						}]
					]
				});
				if (result && result.code) {
					transformed = result.code;
				}
			}
			babelCompileCache.set(cacheKey, transformed);
			return transformed;
		}
	});
}
