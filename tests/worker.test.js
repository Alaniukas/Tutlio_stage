import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createWorker,
  runProcess,
  spawnOfficeProcess,
  waitForOutputFile,
} from '../worker.js';

test('limits admission, serializes work and recovers after a document error', async () => {
  const worker = createWorker({ maxPending: 1 });
  let release;
  const first = worker.run(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const second = worker.run(() => { throw new Error('bad document'); });
  await assert.rejects(worker.run(() => {}), /busy/);
  release();
  await first;
  await assert.rejects(second, /bad document/);
  assert.equal(await worker.run(() => 42), 42);
});

test('expired queued jobs never execute', async () => {
  const worker = createWorker({ maxWaitMs: 10 });
  let release;
  const first = worker.run(() => new Promise(resolve => { release = resolve; }));
  let ran = false;
  await assert.rejects(worker.run(() => { ran = true; }), /queue timeout/);
  release();
  await first;
  assert.equal(ran, false);
});

test('stopping rejects pending and new jobs', async () => {
  const worker = createWorker();
  let release;
  const first = worker.run(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const queued = worker.run(() => assert.fail('must not execute'));
  worker.stop();
  release();
  await first;
  await assert.rejects(queued, /restarting/);
  await assert.rejects(worker.run(() => {}), /restarting/);
});

test('successful processes stay alive until the caller reaps them', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(typeof result.kill, 'function');
  result.kill();
});

test('hung process is terminated and the next process can run', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 }), /deadline/);
  await runProcess(process.execPath, ['-e', 'process.exit(0)']);
});

test('resource exhaustion is distinguished from an invalid document', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'console.error("osl::Thread::create failed");process.exit(1)']), error => error.infrastructureFailure === true);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(1)']), error => error.infrastructureFailure === false);
});

test('stops waiting when the process dies without a PDF', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'tutlio-pdf-wait-'));
  const started = Date.now();
  try {
    await assert.rejects(
      waitForOutputFile(path.join(workDir, 'contract.pdf'), workDir, {
        timeoutMs: 20000,
        graceMs: 40,
        pollMs: 20,
        isAlive: () => false,
      }),
      /without writing a PDF/,
    );
    assert.ok(Date.now() - started < 2000);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('keeps waiting while the process is alive and then reads the PDF', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'tutlio-pdf-wait-'));
  const output = path.join(workDir, 'contract.pdf');
  try {
    setTimeout(() => { void writeFile(output, '%PDF-1.7\nok'); }, 80);
    const pdf = await waitForOutputFile(output, workDir, {
      timeoutMs: 2000,
      pollMs: 20,
      isAlive: () => true,
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('spawned processes can be reaped after the wrapper exits', async () => {
  const handle = await spawnOfficeProcess(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)'], { timeoutMs: 2000 });
  assert.equal(typeof handle.kill, 'function');
  assert.equal(handle.isAlive(), true);
  handle.kill();
  const closed = await handle.close;
  assert.equal(closed.timedOut || closed.code !== 0, true);
});
