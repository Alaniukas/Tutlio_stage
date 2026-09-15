import { spawn } from 'node:child_process';

export class BusyError extends Error {
  status = 503;
}

/** Admission happens before decoding/unzipping a document. No unbounded queue. */
export function createWorker({ maxPending = 2, maxWaitMs = 120000 } = {}) {
  let active = false;
  let healthy = true;
  const pending = [];
  const advance = () => {
    active = false;
    const next = pending.shift();
    if (next) { clearTimeout(next.timer); next.start(); }
  };
  return {
    state: () => ({ active, pending: pending.length, healthy }),
    stop: () => { healthy = false; },
    run(task) {
      if (!healthy) return Promise.reject(new BusyError('Converter restarting'));
      if (active && pending.length >= maxPending) return Promise.reject(new BusyError('Converter busy'));
      return new Promise((resolve, reject) => {
        const entry = { start() {
          if (!healthy) { reject(new BusyError('Converter restarting')); advance(); return; }
          active = true;
          Promise.resolve().then(task).then(resolve, reject).finally(advance);
        }, timer: null };
        if (!active) entry.start();
        else {
          entry.timer = setTimeout(() => {
            const index = pending.indexOf(entry);
            if (index !== -1) pending.splice(index, 1);
            reject(new BusyError('Converter queue timeout'));
          }, maxWaitMs);
          pending.push(entry);
        }
      });
    },
  };
}

/**
 * Linux process group includes soffice wrappers and soffice.bin descendants.
 * The wrapper can exit 0 while soffice.bin is still flushing contract.pdf.
 * Callers must wait for a valid PDF, then invoke `kill` to reap leftovers.
 */
export function runProcess(bin, args, { timeoutMs = 12000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { detached: process.platform !== 'win32', windowsHide: true, env,
      stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    const kill = () => {
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch (error) { if (error.code !== 'ESRCH') console.error('[worker] kill failed', error.code); }
    };
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut || code !== 0) {
        kill();
        const error = new Error(timedOut ? 'Conversion deadline exceeded' : `LibreOffice exited ${code}: ${stderr}`);
        error.infrastructureFailure = timedOut || /Thread::create|bad_alloc|Cannot allocate memory/i.test(stderr);
        reject(error);
      } else resolve({ kill });
    });
  });
}
