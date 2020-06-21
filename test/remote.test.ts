import { _trustRemoteMachine } from '../src';

QUnit.module('trust remote machine tests', hooks => {
  QUnit.test('_trustRemoteMachine', async assert => {
    assert.expect(7);
    const data = await _trustRemoteMachine(
      'foo.bar.biz',
      3333,
      './tmp',
      10,
      undefined,
      (hostname, port, certpath, renewalBufferInBusinessDays) => {
        assert.equal(hostname, 'foo.bar.biz', 'hostname passed to callback');
        assert.equal(port, 3333, 'port passed to callback');
        assert.equal(certpath, './tmp', 'certpath passed to callback');
        assert.equal(
          renewalBufferInBusinessDays,
          10,
          'renewalBufferInBusinessDays passed to callback'
        );
        return Promise.resolve({ mustRenew: false });
      },
      (hostname, port) => {
        assert.equal(hostname, 'foo.bar.biz', 'hostname passed to callback');
        assert.equal(port, 3333, 'port passed to callback');
        return Promise.resolve('Server closed successfully');
      }
    );
    assert.equal(data, false, 'the must renew is false');
  });
});
