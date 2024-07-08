import {initializeOSService} from 'node-service';

async function wait(seconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1000 * seconds)
  });
}

async function main() {
  const manager = await initializeOSService({
    name: 'OctraBackend Service',
    level: 'system',
    slug: 'octra-backend-service'
  });

  // await manager.uninstall();
  if (manager.status === 'not_installed') {
    console.log('Install...');
    await manager.install('/Applications/OctraServerGUI.app/Contents/Resources/core/octra-server', [
      'serve',
      '--socket=true',
      '--socketPath="/tmp/ocb_48a0a1f1-6ddf-4f20-9b83-c2e52c76b97cd"',
      '--socketToken="test12345"',
      '--configPath="/Users/ips/Library/Application Support/OCBServerGUI/config.json"',
      '--socket'
    ], {
      logging: {
        enabled: true
      },
      macos: {
        label: 'octra-backend-service'
      }
    });
    console.log('installed!');
  }

  console.log(JSON.stringify(manager.installationOptions, null, 2));
  while (true) {
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    // await manager.stop();
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    console.log(`STATUS: ${manager.status}`);
    await manager.updateStatus();
    await wait(1);
    // await manager.start();

  }
}

main();
