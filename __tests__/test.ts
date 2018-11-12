// tslint:disable:no-http-string
// Native
import * as http from 'http';
import * as path from 'path';

// Packages
import * as express from 'express';
import * as getPort from 'get-port';
import * as got from 'got';

// Ours
import transformMiddleware from '../src';

let port: number;
let server: http.Server;
const app = express();
const defaultMiddleware = transformMiddleware();
const BYPASS_DEFAULT_TEST_TRANSFORM = 'test-no-default-transform';
app.use('/node_modules', express.static('node_modules'));

beforeAll(async done => {
	app.use('*', (req, res, next) => {
		if (BYPASS_DEFAULT_TEST_TRANSFORM in req.query) {
			next();
		} else {
			return defaultMiddleware(req, res, next);
		}
	});

	port = await getPort();
	server = app.listen(port, () => done());
});

test('transforms unscoped npm packages', async () => {
	app.get('/unscoped-npm-package', (_req, res) => {
		res.type('application/javascript')
			.status(200)
			.send('import * as express from \'express\'');
	});

	const response = await got(`http://localhost:${port}/unscoped-npm-package`);
	expect(response.body).toBe('import * as express from "/node_modules/express/index.js";');
});

test('transforms scoped npm packages', async () => {
	app.get('/scoped-npm-package', (_req, res) => {
		res.type('application/javascript')
			.status(200)
			.send('import * as babel from \'@babel/core\'');
	});

	const response = await got(`http://localhost:${port}/scoped-npm-package`);
	expect(response.body).toBe('import * as babel from "/node_modules/@babel/core/lib/index.js";');
});

test('works with sendFile', async () => {
	app.get('/send-file', (_req, res) => {
		res.sendFile(path.resolve(__dirname, '../__fixtures__/send-file.js'));
	});

	const response = await got(`http://localhost:${port}/send-file`);
	expect(response.body).toBe('import * as express from "/node_modules/express/index.js";');
});

test('works with non-default modulesUrl and rootDir', async () => {
	const fileUrlPath = '/bundles/my-bundle/graphics/elements/some-element.js';
	app.use('/bundles/*', transformMiddleware({
		rootDir: path.resolve(__dirname, '../__fixtures__'),
		modulesUrl: '/bundles/my-bundle/node_modules'
	}));

	app.get(fileUrlPath, (_req, res) => {
		res.sendFile(path.resolve(__dirname, `../__fixtures__${fileUrlPath}`));
	});

	const response = await got(`http://localhost:${port}${fileUrlPath}?${BYPASS_DEFAULT_TEST_TRANSFORM}`);
	expect(response.body).toBe('import * as noop from "../../node_modules/noop3/index.js";');
});

test('does not transform when the nocompile query param is present', async () => {
	const body = 'import * as express from \'express\'';
	app.get('/nocompile-test', (_req, res) => {
		res.type('application/javascript')
			.status(200)
			.send(body);
	});

	const response = await got(`http://localhost:${port}/nocompile-test?nocompile`);
	expect(response.body).toBe(body);
});

afterAll(done => {
	server.close(done);
});
