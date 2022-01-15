/* eslint-disable no-restricted-globals */
import SparkMD5 from 'spark-md5';
import { ChunkInfo } from './BreakpointFileUpload';

self.onmessage = (e: MessageEvent<ChunkInfo[]>) => {
  const chunks = e.data;
  const spark = new SparkMD5.ArrayBuffer();
  let percentage = 0;
  let computedCount = 0;
  // 读取内容计算 hash 值
  const load = (event: ProgressEvent<FileReader>) => {

    if (typeof event.target.result !== 'string') {
      spark.append(event.target.result);
    } else {
      throw new TypeError('LoadEventError, 无法获取字符串数据');
    }
    percentage += 100 / chunks.length;
    if (++computedCount === chunks.length) {
      const hash = spark.end();
      self.postMessage({ percentage: 100, hash });
      spark.reset();
    } else {
      self.postMessage({ percentage });
    }
  };

  for (const { blob } of chunks) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.addEventListener('load', load);
  }
};
