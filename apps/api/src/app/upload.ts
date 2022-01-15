import { Router } from 'express';
import { Form } from 'multiparty';
import { send } from '../utils/common';
import * as fs from 'fs-extra';
import { resolve } from 'path';
import { memoize } from 'lodash';
import { UploadBreakpointMergeRequestParams } from '@breakpoint-upload/api-interfaces';

const router = Router();
const filter = memoize((str: string) => str.replace(/[\\/:*?"<>|]/, ''));

router.post('/upload/breakpoint', (req, res) => {
  const multipart = new Form();

  multipart.parse(req, async (error, fields, files) => {
    if (error) {
      console.log('error ->', error);
      send(res, {
        data: error,
        msg: '解析文件错误',
        code: 500,
      });
      return;
    }
    const [hash] = fields.hash;
    const [fileName]: string = fields.fileName;
    const [chunk] = files.chunk;

    // ! 使用文件名作为目录需要过滤特殊字符
    const dirPath = resolve(__dirname, 'upload', 'temp', filter(fileName));

    try {
      if (!(await fs.pathExists(dirPath))) {
        await fs.mkdirs(dirPath);
      }
      const filePath = resolve(dirPath, hash);
      if (!(await fs.pathExists(filePath))) {
        await fs.move(chunk.path, resolve(dirPath, hash));
      }
      send(res, {
        code: 200,
        data: { status: 1 },
      });
    } catch (error) {
      send(res, {
        code: 500,
        data: error,
      });
    }
  });
});

router.post('/upload/breakpoint/merge', async (req, res) => {
  const data: UploadBreakpointMergeRequestParams = req.body;

  if (!data.size) {
    send(res, { code: 415, data: false, msg: 'size不存在' });
    return;
  }
  if (!data.delimiter) {
    send(res, { code: 415, data: false, msg: 'delimiter不存在' });
    return;
  }
  if (!data.fileName) {
    send(res, { code: 415, data: false, msg: 'fileName不存在' });
    return;
  }

  const tempDirPath = resolve(__dirname, 'upload', 'temp', filter(data.fileName));
  const outPath = resolve(__dirname, 'upload', filter(data.fileName));

  if (!(await fs.pathExists(tempDirPath))) {
    send(res, { code: 415, data: false, msg: '文件不存在' });
    return;
  }

  // 从文件目录读取所有的切片文件名
  const chunks = await fs.readdir(tempDirPath);

  // 根据下标排序, 顺序不正确会导致写入的文件错误
  chunks.sort((perv, next) => parseInt(perv.split(data.delimiter)[1]) - parseInt(next.split(data.delimiter)[1]));

  try {
    await Promise.all(
      chunks.map(
        (chunkPath, index) =>
          new Promise<void>((_resolve, reject) => {
            chunkPath = resolve(tempDirPath, chunkPath);
            const rs = fs.createReadStream(chunkPath);
            rs.on('end', async () => {
              await fs.remove(chunkPath);
              _resolve();
            });
            rs.on('error', (error) => reject(error));
            const options: unknown = {
              start: index++ * data.size,
              end: index * data.size,
            };
            rs.pipe(fs.createWriteStream(outPath, options));
          })
      )
    );
    await fs.remove(tempDirPath);
    send(res, { code: 200, data: true, msg: '合并文件成功' });
  } catch (error) {
    console.log('error ->', error);
    send(res, { code: 500, data: error, msg: '合并文件失败' });
  }

  filter.cache.delete(data.fileName);
});

export default router;
