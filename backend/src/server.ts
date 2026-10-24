import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { DeviceStore } from './devices.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const store = new DeviceStore(config.dataDir);
  await store.load();
  const app = await buildApp(config, { store, logger: true });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
