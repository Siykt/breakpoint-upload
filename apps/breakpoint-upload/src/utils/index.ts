/**
 * 可控并发数执行异步函数
 * @param asyncFuncList 异步函数数组
 * @param concurrentFetchLimit 线程上限, 为 0 执行 Promise.all
 * @returns 有序的异步返回值数组
 */
export function concurrentFetch<Res = unknown>(
  asyncFuncList: ((index?: number) => Promise<Res>)[],
  concurrentFetchLimit = 4
): Promise<Res[]> {
  return new Promise((resolve, reject) => {
    // 如果 concurrentFetchLimit 为 0 直接返回 Promise.all
    if (!concurrentFetchLimit) {
      return Promise.all(asyncFuncList.map((func, index) => func(index)));
    }

    const result: Res[] = [];
    const len = asyncFuncList.length;
    let next = concurrentFetchLimit;

    function completedDoneFunc(index: number) {
      return (response: Res) => {
        const func = asyncFuncList[next];
        // 使用 index 写入返回值, 保证返回值的顺序
        result[index] = response;
        // 当该线程完成任务继续下一个任务
        if (asyncFuncList.length > next) {
          func(next).then(completedDoneFunc(next)).catch(/** 错误直接抛出 catch */ reject);
        } else {
          resolve(result);
        }

        next++;
      };
    }

    // 如果输入内容的总数量为零则直接返回空数组
    if (!len) {
      return resolve(result);
    }

    // 控制线程的上限不超过 concurrentFetchLimit
    for (let index = 0; index < concurrentFetchLimit; index++) {
      const func = asyncFuncList[index];
      func(index).then(completedDoneFunc(index)).catch(reject);
    }
  });
}

export const log: <T>(data: T, logName?: string) => T = (data, logName = 'data') => {
  console.log(`${logName} ->`, data);
  return data;
};
