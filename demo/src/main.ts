import {createOSService, OSServiceManager} from 'node-service';

async function main() {
  const manager = await createOSService({
    name: 'OctraBackend Service',
    level: 'user',
    slug: 'ocb-service',
    logging: {
      enabled: true
    },
    macos: {
      label: 'octra-backend-service'
    }
  });

  if (manager.status === 'not_installed') {
    console.log('Install...');
    await manager.install('/Applications/OctraServerGUI.app/Contents/Resources/core/octra-server', [
      'serve',
      '--configPath="/Users/ips/Library/Application Support/OCBServerGUI/config.json"'
    ]);
    console.log('installed!');
  }

  const interval = setInterval(() => {
    console.log(`STATUS: ${manager.status}`);
    manager.updateStatus();
  }, 1000);

  setTimeout(() => {
    console.log('stop...');
    manager.uninstall();
  }, 4000);

  setTimeout(async () => {
    clearInterval(interval);
  }, 20000)
}

main();
