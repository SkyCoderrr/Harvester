// Prints two lines: HOST and PORT for the Harvester launcher.
// HOST is the configured bind_host, except 0.0.0.0 is translated to
// 127.0.0.1 (since the all-interfaces bind is reachable via loopback).
// PORT is the configured port. Missing / malformed config falls back
// to 127.0.0.1 and 5173 respectively.
//
// start.bat invokes this via `for /f` and sets HOST + PORT from the
// two output lines. Keeping the logic here avoids cmd.exe quoting
// the JavaScript into oblivion (colons, `||`, nested quotes).

const fs = require('fs');
const path = require('path');

let host = '127.0.0.1';
let port = 5173;

try {
  const cfgPath = path.join(process.env.APPDATA || '', 'Harvester', 'config.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const cfg = JSON.parse(raw);
  if (cfg && typeof cfg.bind_host === 'string' && cfg.bind_host) {
    host = cfg.bind_host === '0.0.0.0' ? '127.0.0.1' : cfg.bind_host;
  }
  if (cfg && Number.isFinite(cfg.port)) {
    port = cfg.port;
  }
} catch {
  // Fall through with defaults.
}

process.stdout.write(host + '\r\n');
process.stdout.write(port + '\r\n');
