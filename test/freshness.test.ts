import { _getCertExpirationInfoData } from '../src';

QUnit.module('cert freshness tests', hooks => {
  const now = new Date('01-01-2020');

  QUnit.test('getCertExpirationInfoData', assert => {
    assert.expect(3);
    let certInfoInvocations = 0;
    const data = _getCertExpirationInfoData(
      'foo.bar.biz',
      3,
      now,
      (commonName, renewalBuffer) => {
        certInfoInvocations++;
        assert.equal(
          commonName,
          'foo.bar.biz',
          'commonName passed to callback'
        );
        return {
          expireAt: new Date('02-10-2020'),
          renewBy: new Date('02-01-2020'),
          freshness: 'fresh',
          businessDaysBuffer: renewalBuffer ?? 1,
          mustRenew: false
        };
      }
    );
    assert.deepEqual(
      data,
      {
        expireAt: new Date('02-10-2020'),
        renewBy: new Date('02-01-2020'),
        freshness: 'fresh',
        businessDaysBuffer: 3,
        mustRenew: false
      },
      `getCertExpirationInfoData result as expected`
    );
    assert.equal(certInfoInvocations, 1, 'get cert info was invoked one time');
  });
});
