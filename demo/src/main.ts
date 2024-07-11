import {initializeOSService} from 'node-service';
import {join} from 'path';
import * as os from 'node:os';

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
    slug: 'octra-backend-service',
    windows: {
      pathToWinswConfig: 'C:\\Users\\geronimo\\Desktop\\winsw.xml'
    }
  });

  //await manager.stop();
  //await manager.uninstall();

  if (manager.status === 'not_installed') {
    console.log('Install...');
    // path.join('\\\\?\\pipe', process.cwd(), 'myctl')
    let command = '';
    const args: string[] = [
      'serve',
      '--socket=true',
      `--socketPath="${join('\\\\?\\pipe\\temp\\', 'ocb_server')}"`,
      '--socketToken="test12345"',
      '--configPath="C:\\Users\\gero_admin\\AppData\\Roaming\\OCBServerGUI\\config.json"'
    ];
    if (os.platform() === 'win32') {
      command = 'C:\\Users\\gero_admin\\AppData\\Roaming\\OCBServerGUI\\octra-server.exe';
    } else if (os.platform() === 'darwin') {
      command = '/Applications/OctraServerGUI.app/Contents/Resources/core/octra-server';
      args[4] = '/Users/ips/Library/Application Support/config.json'
    }

    await manager.install(command, args, {
      logging: {
        enabled: true,
        outDir: '/Users/ips/Library/Application Support/logs'
      },
      macos: {
        label: 'octra-backend-service'
      }
    });
    console.log('installed!');
    await manager.start();
  }

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
    await manager.stop();
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
    await manager.start();
  }
}

main();
