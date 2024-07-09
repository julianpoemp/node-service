import {initializeOSService} from 'node-service';
import { join } from 'path';
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
      pathToWinswConfig: "C:\\Users\\geronimo\\Desktop\\winsw.xml"
    }
  });

  if (manager.status === 'not_installed') {

    console.log('Install...');
    // path.join('\\\\?\\pipe', process.cwd(), 'myctl')
    await manager.install('C:\\Users\\gero_admin\\AppData\\Roaming\\OCBServerGUI\\octra-server.exe', [
      'serve',
      '--socket=true',
      `--socketPath="${join('\\\\?\\pipe\\temp\\', 'ocb_server')}"`,
      '--socketToken="test12345"',
      '--configPath="C:\\Users\\gero_admin\\AppData\\Roaming\\OCBServerGUI\\config.json"'
    ], {
      logging: {
        enabled: false
      },
      macos: {
        label: 'octra-backend-service'
      }
    });
    console.log('installed!');
    await manager.start();
  }

  /*
  // await manager.uninstall();

*/

  // await manager.stop();
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
