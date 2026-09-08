import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, runProcess } from '../worker.js';

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

test('hung process is terminated and the next process can run', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 }), /deadline/);
  await runProcess(process.execPath, ['-e', 'process.exit(0)']);
});

test('resource exhaustion is distinguished from an invalid document', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'console.error("osl::Thread::create failed");process.exit(1)']), error => error.infrastructureFailure === true);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(1)']), error => error.infrastructureFailure === false);
});
