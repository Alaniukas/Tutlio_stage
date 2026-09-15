import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

const OFFICE_COMMS = new Set(['soffice.bin', 'soffice', 'oosplash']);

export function listOfficePids() {
  if (process.platform === 'win32') return [];
  try {
    const pids = [];
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const comm = readFileSync(`/proc/${name}/comm`, 'utf8').trim();
        if (OFFICE_COMMS.has(comm)) pids.push(Number(name));
      } catch {
        // process exited while we scanned
      }
    }
    return pids;
  } catch {
    return [];
  }
}

/** This container only runs the converter, so leftover Office processes are always ours. */
export function reapOfficeProcesses() {
  for (const pid of listOfficePids()) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* ESRCH */ }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPdfBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length > 0 && buf.subarray(0, 5).toString() === '%PDF-';
}

/**
 * Wait for a PDF while LibreOffice is alive. If the process tree is dead, fail in
 * `graceMs` instead of polling for two minutes. v2.2.3 waited the full timeout
 * after soffice already exited 0 without writing contract.pdf.
 */
export async function waitForOutputFile(outputPath, workDir, {
  timeoutMs = 120000,
  graceMs = 3000,
  pollMs = 200,
  isAlive = () => true,
} = {}) {
  const started = Date.now();
  let lastErr = null;
  let deadSince = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const pdf = await fs.readFile(outputPath);
      if (isPdfBuffer(pdf)) return pdf;
    } catch (error) {
      lastErr = error;
    }
    try {
      const listing = await fs.readdir(workDir);
      for (const name of listing) {
        if (!name.toLowerCase().endsWith('.pdf')) continue;
        const pdf = await fs.readFile(path.join(workDir, name));
        if (isPdfBuffer(pdf)) return pdf;
      }
    } catch (error) {
      lastErr = error;
    }
    const alive = isAlive();
    if (!alive) {
      if (deadSince == null) deadSince = Date.now();
      else if (Date.now() - deadSince >= graceMs) {
        const err = new Error('LibreOffice exited without writing a PDF');
        err.cause = lastErr instanceof Error ? lastErr : undefined;
        throw err;
      }
    } else {
      deadSince = null;
    }
    await sleep(pollMs);
  }
  const err = lastErr instanceof Error ? lastErr : new Error(`Timed out waiting for ${outputPath}`);
  throw err;
}

/**
 * Spawn LibreOffice (or a test binary) and return immediately so the caller can
 * wait for contract.pdf while descendants are still flushing.
 * Do not detach: the Debian soffice wrapper daemonizes out of a detached group,
 * and kill(-pid) then misses soffice.bin.
 */
export function spawnOfficeProcess(bin, args, { timeoutMs = 12000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      detached: false,
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    let rejected = false;

    const kill = () => {
      try {
        if (child.pid) child.kill('SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') console.error('[worker] kill failed', error.code);
      }
      reapOfficeProcesses();
    };

    const isAlive = () => {
      if (child.exitCode === null && child.pid) {
        try {
          process.kill(child.pid, 0);
          return true;
        } catch {
          // child is gone; a daemonized soffice.bin may still be flushing
        }
      }
      return listOfficePids().length > 0;
    };

    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.stdout?.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-2000); });

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    child.once('error', (error) => {
      if (rejected) return;
      rejected = true;
      clearTimeout(timer);
      reject(error);
    });

    const close = new Promise((res) => {
      child.once('close', (code) => {
        clearTimeout(timer);
        res({ code, timedOut, stderr, stdout });
      });
    });

    const handle = { kill, isAlive, getStderr: () => stderr, getStdout: () => stdout, close, pid: child.pid };

    const finishSpawn = () => {
      if (rejected) return;
      handle.pid = child.pid;
      resolve(handle);
    };

    if (child.pid) finishSpawn();
    else child.once('spawn', finishSpawn);
  });
}

/**
 * Linux process group includes soffice wrappers and soffice.bin descendants.
 * Prefer spawnOfficeProcess for conversions: wait for the PDF in parallel.
 */
export async function runProcess(bin, args, { timeoutMs = 12000, env = process.env } = {}) {
  const handle = await spawnOfficeProcess(bin, args, { timeoutMs, env });
  const { code, timedOut, stderr } = await handle.close;
  if (timedOut || code !== 0) {
    handle.kill();
    const error = new Error(timedOut ? 'Conversion deadline exceeded' : `LibreOffice exited ${code}: ${stderr}`);
    error.infrastructureFailure = timedOut || /Thread::create|bad_alloc|Cannot allocate memory/i.test(stderr);
    throw error;
  }
  return { kill: handle.kill };
}
