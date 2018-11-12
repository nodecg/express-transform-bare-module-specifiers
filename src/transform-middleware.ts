/**
 * Based entirely on:
 * https://github.com/Polymer/tools/blob/dd1c8bbb44f37f67974fbabf878b7a495ffeb6f6/packages/polyserve/src/transform-middleware.ts
 */

import {Request, RequestHandler, Response} from 'express'; // tslint:disable-line:no-implicit-dependencies

export function transformResponse(transformer: ResponseTransformer):
	RequestHandler {
	return (req: Request, res: Response, next: () => void) => {
		let ended = false;

		const chunks: Buffer[] = [];

		let _shouldTransform: boolean | null = null;

		// Note: this function memoizes its result.
		function shouldTransform() {
			if (_shouldTransform === null) {
				const successful = res.statusCode >= 200 && res.statusCode < 300;
				_shouldTransform =
					successful && Boolean(transformer.shouldTransform(req, res));
			}
			return _shouldTransform;
		}

		const _write = res.write;
		res.write = function (
			chunk: Buffer | string,
			cbOrEncoding?: Function | string,
			cbOrFd?: Function | string): boolean {
			if (ended) {
				_write.call(this, chunk, cbOrEncoding, cbOrFd);
				return false;
			}

			if (shouldTransform()) {
				const buffer = (typeof chunk === 'string') ?
					Buffer.from(chunk, cbOrEncoding as string) :
					chunk;
				chunks.push(buffer);
				return true;
			}

			return _write.call(this, chunk, cbOrEncoding, cbOrFd);
		};

		const _end = res.end;
		res.end = function (
			cbOrChunk?: Function | Buffer | string,
			cbOrEncoding?: Function | string,
			cbOrFd?: Function | string): boolean {
			if (ended) {
				return false;
			}
			ended = true;

			if (shouldTransform()) {
				if (Buffer.isBuffer(cbOrChunk)) {
					chunks.push(cbOrChunk);
				} else if (typeof cbOrChunk === 'string') {
					chunks.push(Buffer.from(cbOrChunk, cbOrEncoding as string));
				}
				const body = Buffer.concat(chunks).toString('utf8');
				let newBody = body;
				try {
					newBody = transformer.transform(req, res, body);
				} catch (e) {
					console.warn('Error', e);
				}
				// TODO(justinfagnani): re-enable setting of content-length when we know
				// why it was causing truncated files. Could be multi-byte characters.
				// Assumes single-byte code points!
				// res.setHeader('Content-Length', `${newBody.length}`);
				res.removeHeader('Content-Length');
				// TODO(aomarks) Shouldn't we call the callbacks?
				return _end.call(this, newBody);
			}

			return _end.call(this, cbOrChunk, cbOrEncoding, cbOrFd);
		};

		next();
	};
}

export interface ResponseTransformer {
	/**
	 * Returns `true` if this transformer should be invoked.
	 * Transformers should only look at headers, do not call res.write().
	 */
	shouldTransform(request: Request, response: Response): boolean;

	transform(request: Request, response: Response, body: string): string;
}
