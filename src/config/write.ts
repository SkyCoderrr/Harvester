import fs from 'node:fs';
import path from 'node:path';
import type { AppPaths } from '../appPaths.js';
import type { AppConfig } from './schema.js';
import { configSchemaZ } from './schema.js';
import { HarvesterError } from '../errors/index.js';

/**
 * Atomic write: write to a per-write temp file, fsync(fd), rename over the
 * target, then fsync(dirFd) on POSIX. On any failure between open and rename
 * the temp file is unlinked. Mode 0o600 on POSIX.
 *
 * FR-V2-02 / TECH_DEBT C1, H7.
 */
export function writeConfig(paths: AppPaths, config: AppConfig): void {
  const validated = configSchemaZ.safeParse(config);
  if (!validated.success) {
    throw new HarvesterError({
      code: 'CONFIG_INVALID',
      user_message: 'Refused to write invalid config',
      context: { issues: validated.error.issues },
    });
  }
  fs.mkdirSync(paths.dataDir, { recursive: true });

  const target = paths.configFile;
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.config.tmp.${process.pid}.${Date.now()}`);
  const data = JSON.stringify(validated.data, null, 2);

  // 1) Write the temp file with 0o600 (POSIX honors mode; Windows ignores).
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, 'w', 0o600);
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } catch (e) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }

  // 2) Atomic rename over target. On POSIX rename is atomic across same-fs.
  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }

  // 3) On POSIX fsync the directory so the rename survives a power loss.
  if (process.platform !== 'win32') {
    try {
      const dfd = fs.openSync(dir, 'r');
      try {
        fs.fsyncSync(dfd);
      } finally {
        fs.closeSync(dfd);
      }
    } catch {
      /* best-effort: directory fsync can fail on some FSes; ignore */
    }
    // Defensive chmod in case the umask widened the bits.
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      /* best-effort */
    }
  }
}
