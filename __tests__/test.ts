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

const EXPRESS_EXPECTED = `import * as express from "/node_modules/express/index.js";
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVuc2NvcGVkLW5wbS1wYWNrYWdlIl0sIm5hbWVzIjpbImV4cHJlc3MiXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBS0EsT0FBWixNQUF5QixnQ0FBekIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBleHByZXNzIGZyb20gJ2V4cHJlc3MnIl19`;

const SENDFILE_EXPECTED = `import * as express from "/node_modules/express/index.js";
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNlbmQtZmlsZSJdLCJuYW1lcyI6WyJleHByZXNzIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUtBLE9BQVosTUFBeUIsZ0NBQXpCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZXhwcmVzcyBmcm9tICdleHByZXNzJ1xuXG4iXX0=`;

const NOOP_EXPECTED = `import * as noop from "../../node_modules/noop3/index.js";
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNvbWUtZWxlbWVudC5qcyJdLCJuYW1lcyI6WyJub29wIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUtBLElBQVosTUFBc0IsbUNBQXRCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgbm9vcCBmcm9tICdub29wMydcbiJdfQ==`;

const BABEL_EXPECTED = `import * as babel from "/node_modules/@babel/core/lib/index.js";
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNjb3BlZC1ucG0tcGFja2FnZSJdLCJuYW1lcyI6WyJiYWJlbCJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLQSxLQUFaLE1BQXVCLHdDQUF2QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGJhYmVsIGZyb20gJ0BiYWJlbC9jb3JlJyJdfQ==`;

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
	expect(response.body).toBe(EXPRESS_EXPECTED);
});

test('transforms scoped npm packages', async () => {
	app.get('/scoped-npm-package', (_req, res) => {
		res.type('application/javascript')
			.status(200)
			.send('import * as babel from \'@babel/core\'');
	});

	const response = await got(`http://localhost:${port}/scoped-npm-package`);
	expect(response.body).toBe(BABEL_EXPECTED);
});

test('works with sendFile', async () => {
	app.get('/send-file', (_req, res) => {
		res.sendFile(path.resolve(__dirname, '../__fixtures__/send-file.js'));
	});

	const response = await got(`http://localhost:${port}/send-file`);
	expect(response.body).toBe(SENDFILE_EXPECTED);
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
	expect(response.body).toBe(NOOP_EXPECTED);
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
