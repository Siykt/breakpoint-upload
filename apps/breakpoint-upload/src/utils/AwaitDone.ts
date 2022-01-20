import { concurrentFetch, log } from '.';

export interface AwaitOptions {
  timeout?: number;
  doneCallback?: (...args: unknown[]) => unknown;
}

export class AwaitDone {
  resolveFunc: (value: void | PromiseLike<void>) => void;
  awaitPromise: Promise<void>;
  options: AwaitOptions;
  _timer: NodeJS.Timeout;
  callbackList: ((...args: unknown[]) => Promise<unknown>)[] = [];

  constructor(options: AwaitOptions = {}) {
    this.options = options;
  }

  addCallback(func: (...args: unknown[]) => unknown) {
    this.callbackList.push(
      () =>
        new Promise<void>((resolve) => {
          log(func(), 'func runner')
          resolve();
        })
    );
  }

  start(options: AwaitOptions = {}) {
    options = { ...this.options, ...options };
    if (!this.resolveFunc && !this.awaitPromise) {
      this.awaitPromise = new Promise<void>((resolve) => (this.resolveFunc = resolve));
    }
    if (options.timeout) {
      this._timer = setTimeout(this.release.bind(this), options.timeout);
    }
    return log(this.awaitPromise, 'this.awaitPromise');
  }

  async release() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.resolveFunc();
    await concurrentFetch(this.callbackList);
    this.callbackList = [];
    this.resolveFunc = null;
    this.awaitPromise = null;
    return this;
  }
}
