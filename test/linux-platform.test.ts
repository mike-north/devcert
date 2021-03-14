import * as sinon from 'sinon';
import * as si from 'systeminformation';
import { linuxFlavorDetails, LinuxFlavor } from '../src/platforms/linux';

QUnit.module('linux platform tests', hooks => {
  let osInfo: sinon.SinonStub<any>;

  hooks.beforeEach(() => {
    osInfo = sinon
      .stub(si, 'osInfo')
      .returns(Promise.resolve({ distro: 'Fedora' } as any));
  });
  hooks.afterEach(() => {
    osInfo.restore();
  });
  QUnit.test('linuxFlavorDetails - Fedora', assert => {
    const details = linuxFlavorDetails(LinuxFlavor.Fedora);
    assert.deepEqual(details, {
      caFolders: [
        '/etc/pki/ca-trust/source/anchors',
        '/usr/share/pki/ca-trust-source'
      ],
      postCaPlacementCommands: [
        {
          command: 'sudo',
          args: ['update-ca-trust']
        }
      ],
      postCaRemovalCommands: [
        {
          command: 'sudo',
          args: ['update-ca-trust']
        }
      ]
    });
  });
  QUnit.test('linuxFlavorDetails - RHEL7', assert => {
    const details = linuxFlavorDetails(LinuxFlavor.Rhel7);
    assert.deepEqual(details, {
      caFolders: [
        '/etc/pki/ca-trust/source/anchors',
        '/usr/share/pki/ca-trust-source'
      ],
      postCaPlacementCommands: [
        {
          command: 'sudo',
          args: ['update-ca-trust']
        }
      ],
      postCaRemovalCommands: [
        {
          command: 'sudo',
          args: ['update-ca-trust']
        }
      ]
    });
  });
  QUnit.test('linuxFlavorDetails - Ubuntu', assert => {
    const details = linuxFlavorDetails(LinuxFlavor.Ubuntu);
    assert.deepEqual(details, {
      caFolders: [
        '/etc/pki/ca-trust/source/anchors',
        '/usr/local/share/ca-certificates'
      ],
      postCaPlacementCommands: [
        {
          command: 'sudo',
          args: ['update-ca-certificates']
        }
      ],
      postCaRemovalCommands: [
        {
          command: 'sudo',
          args: ['update-ca-certificates']
        }
      ]
    });
  });
  QUnit.test('linuxFlavorDetails - Unknown', assert => {
    assert.throws(() => {
      linuxFlavorDetails(LinuxFlavor.Unknown as any);
    }, /Unable to detect linux flavor/g);
  });
  QUnit.test('linuxFlavorDetails (overrides case)', assert => {
    const details = linuxFlavorDetails(LinuxFlavor.Fedora, {
      customCaRoots: ['foo', 'bar'],
      omitPostCaPlacementCommands: true,
      omitPostCaRemovalCommands: true
    });
    assert.deepEqual(details, {
      caFolders: ['foo', 'bar'],
      postCaRemovalCommands: [],
      postCaPlacementCommands: []
    });
  });
});
