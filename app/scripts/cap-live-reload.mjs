import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const platform = process.argv[2];
if (!['ios', 'android'].includes(platform)) {
  console.error('Usage: npm run cap:live:<ios|android>');
  process.exit(2);
}

const addresses = Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
  .filter((entry) => entry.family === 'IPv4' && !entry.internal)
  .map((entry) => entry.address);
const host = process.env.CAP_SERVER_HOST ?? addresses[0];
if (!host) {
  console.error('No LAN IPv4 address found. Set CAP_SERVER_HOST to your computer’s LAN address.');
  process.exit(1);
}

const env = { ...process.env, CAP_SERVER_URL: `https://${host}:5173` };
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(command, ['cap', 'run', platform, '--live-reload', '--host', host, '--port', '5173', '--https'], {
  stdio: 'inherit',
  env,
});
child.on('error', (error) => {
  console.error(`Could not run Capacitor live reload: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
