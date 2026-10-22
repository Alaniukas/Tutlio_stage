/** Bound a read and abort its outstanding requests on timeout or failure. */
export async function withRequestDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('request_deadline_exceeded'));
          controller.abort();
        }, timeoutMs);
      }),
      run(controller.signal),
    ]);
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
