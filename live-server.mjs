import { IncomingMessage, ServerResponse } from 'http';
import LiveServer from 'live-server'
import config from './config.json'  assert { type: 'json' };
// npx live-server --watch=index.html,dist,assets --ignore=dist/**/*.js.map,dist/*.tsbuildinfo .
/**
 * 
 * @param {IncomingMessage} req 
 * @param {ServerResponse} res 
 * @param {(err?: any) => void} next 
 * @returns 
 */
function middleware(req,res,next)
{
	res.setHeader('Cross-Origin-Opener-Policy','same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
	next();
}
LiveServer.start
	({
		host: 'localhost',
		open: true,
		root: config.debug ? './build': './',
		ignore: ['**/*.js.map', '**/*.tsbuildinfo', '**/*.ts', '**/*.tsconfig'],
		logLevel: 2,
		middleware:[middleware]
	});