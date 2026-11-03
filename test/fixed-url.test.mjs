import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedOrigin, configuredOrigin, endpointFromLog, ngrokArguments, ngrokConfiguration } from '../scripts/start-fixed-url.mjs';

test('fixed endpoints must be HTTPS origins without embedded credentials or paths', () => {
  assert.equal(fixedOrigin('https://example.ngrok-free.app/'), 'https://example.ngrok-free.app');
  for (const value of ['http://example.ngrok-free.app', 'https://user:password@example.com', 'https://example.com/account', 'https://example.com/?token=secret']) assert.throws(() => fixedOrigin(value));
});
test('temporary IP-based ngrok hostnames cannot be saved as fixed domains', () => {
  assert.throws(() => configuredOrigin('https://a7b4-140-119-122-6.ngrok-free.app'), /臨時/);
  assert.equal(configuredOrigin('https://assigned-dev-domain.ngrok-free.dev'), 'https://assigned-dev-domain.ngrok-free.dev');
});
test('only structured HTTPS endpoint messages become user-facing URLs', () => {
  assert.equal(endpointFromLog(JSON.stringify({ msg: 'started tunnel', url: 'https://example.ngrok-free.app' })), 'https://example.ngrok-free.app');
  assert.equal(endpointFromLog('authentication failed: secret'), null);
  assert.equal(endpointFromLog(JSON.stringify({ url: 'http://127.0.0.1:3001' })), null);
});
test('restarts explicitly pin the saved domain and disable HTTP request inspection', () => {
  const config = ngrokConfiguration(3001, 'https://example.ngrok-free.app');
  assert.equal(config.endpoints[0].upstream.url, 'http://127.0.0.1:3001');
  assert.equal(config.agent.inspect_db_size, -1);
  assert.equal(config.endpoints[0].url, 'https://example.ngrok-free.app');
  const args = ngrokArguments('account.yml', 'endpoint.yml');
  assert.deepEqual(args.slice(0, 4), ['start', 'night-harbor', '--config', 'account.yml,endpoint.yml']);
  assert.ok(!args.some(arg => arg.startsWith('--host-header')));
  assert.equal(ngrokConfiguration(3001).endpoints[0].url, undefined);
});
