import SparkMD5 from 'spark-md5';
import { log } from '../../utils';
import { AwaitDone } from '../../utils/AwaitDone';
import { DEFAULT_BREAKPOINT_CHUNK_SIZE } from '../constants';

function calculateHashSample(file: File) {
  const OFFSET = DEFAULT_BREAKPOINT_CHUNK_SIZE;
  const MID_OFFSET = 2;
  const { size } = file;
  let cur = OFFSET;

  const chunks = [file.slice(0, OFFSET)];
  while (cur < size) {
    if (cur + OFFSET > size) {
      chunks.push(file.slice(cur));
    } else {
      chunks.push(file.slice(cur, cur + MID_OFFSET), file.slice(cur + OFFSET - MID_OFFSET, cur + OFFSET));
    }
    cur += OFFSET;
  }

  return chunks;
}
export interface ComputedInfoMessage {
  percentage: number;
  hash?: string;
}

let isPaused = false;

const Sleep = new AwaitDone();

// eslint-disable-next-line
const ctx: Worker = self as any;

export type ComputeEntryMessage = MessageEvent<Blob[] | File | -1 | 1>;
export type ComputeMessageEvent = MessageEvent<{ percentage: number; hash?: string }>;

ctx.onmessage = (e: ComputeEntryMessage) => {
  const { data } = e;
  let chunks: Blob[];

  if (data === -1) {
    isPaused = true;
    return;
  } else if (data === 1) {
    Sleep.release();
    return;
  }

  if (Array.isArray(data)) {
    chunks = data;
  } else {
    chunks = calculateHashSample(data);
  }

  const spark = new SparkMD5.ArrayBuffer();
  let computedCount = 0;

  // 读取内容计算 hash 值
  const load = async (event: ProgressEvent<FileReader>) => {
    if (typeof event.target.result !== 'string') {
      spark.append(event.target.result);
    } else {
      throw new TypeError('LoadEventError, 无法获取字符串数据');
    }

    // 暂停时等待
    if (isPaused) {
      await Sleep.start();
    }

    if (++computedCount === chunks.length) {
      const hash = spark.end();
      ctx.postMessage({ percentage: 100, hash });

      spark.reset();
      spark.destroy();
    } else {
      ctx.postMessage({ percentage: 100 / chunks.length });
    }
  };

  for (const blob of chunks) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.addEventListener('load', load);
  }
};
