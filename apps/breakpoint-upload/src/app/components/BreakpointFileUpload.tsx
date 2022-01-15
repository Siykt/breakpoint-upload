import { Button, Typography, Table, Progress, message } from 'antd';
import React, { BaseSyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PauseOutlined, UploadOutlined, ClearOutlined, FileAddOutlined } from '@ant-design/icons';
// eslint-disable-next-line import/no-webpack-loader-syntax
import ComputeHashWorker from 'worker-loader!./computeHash.worker';
import axios, { AxiosResponse } from 'axios';
import { UploadResponse } from '@breakpoint-upload/api-interfaces';
import { throttle } from 'lodash';

const log: <T>(data: T) => T = (data) => {
  console.log('data ->', data);
  return data;
};

const { Paragraph, Text } = Typography;

function formatBitSize(size: number, isUpper = true) {
  let unit = 'b';
  if (size >= 1024 ** 3) {
    unit = 'gb';
    size /= 1024 ** 3;
  } else if (size >= 1024 ** 2) {
    unit = 'mb';
    size /= 1024 ** 2;
  } else if (size >= 1024) {
    unit = 'kb';
    size /= 1024;
  }
  return `${Math.ceil(size)}${isUpper ? unit.toUpperCase() : unit}`;
}

interface BreakpointFileUploadProps {
  breakpointSize?: number;
}

const STATUS = ['未开始', '已成功', '已失败', '暂停中'];
export type ChunkInfo = { blob: Blob };

export default function BreakpointFileUpload({ breakpointSize }: BreakpointFileUploadProps) {
  const DEFAULT_BREAKPOINT_SIZE = useMemo(() => 1024 ** 2, []);

  // 处理 breakpointSize 为零或为空的情况
  breakpointSize = breakpointSize || DEFAULT_BREAKPOINT_SIZE;

  const fileRef = useRef<HTMLInputElement>();
  const [hash, setHash] = useState('');
  const [size, setSize] = useState(0);
  const [fileName, setFileName] = useState('');
  const [isNormal, setIsNormal] = useState(false);
  const [isComputingHash, setIsComputingHash] = useState(false);
  const [fileChunks, setFileChunks] = useState<ChunkInfo[]>([]);
  const [uploadStatusMap, setUploadStatusMap] = useState<{ [x: number]: number }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedPercentage, setUploadedPercentage] = useState(0);
  const [hashComputePercentage, setHashComputePercentage] = useState(0);
  const sizeStr = useMemo(() => formatBitSize(size), [size]);
  const breakpointSizeStr = useMemo(() => formatBitSize(breakpointSize), [breakpointSize]);
  const dataSource = useMemo(
    () =>
      Array(fileChunks.length)
        .fill(0)
        .map((_, index) => ({
          index,
          hash: hash ? `${hash}_${index}` : '未计算',
          size: fileChunks.length - index === -1 ? breakpointSize : size % breakpointSize,
          status: uploadStatusMap[index],
        })),
    [fileChunks.length, hash, uploadStatusMap, breakpointSize, size]
  );
  const columnRender = (text: string) => <Text>{text}</Text>;
  const getStatusText = useCallback((status: number) => STATUS[status || 0], []);
  const columns = [
    {
      title: '下标',
      dataIndex: 'index',
      render: columnRender,
    },
    {
      title: 'hash',
      dataIndex: 'hash',
      render: columnRender,
    },
    {
      title: '大小',
      dataIndex: 'size',
      render: columnRender,
    },
    {
      title: '上传状态',
      dataIndex: 'status',
      render: (status: number) => <Text>{getStatusText(status)}</Text>,
    },
  ];

  const ProgressGroup = useCallback(
    () => (
      <Paragraph>
        {!isNormal && (
          <>
            <Text type="secondary">hash计算进度</Text>
            <Progress className="ml10" percent={Math.floor(hashComputePercentage)} />
            <Text type="secondary" className="ml10">
              上传进度条
            </Text>
          </>
        )}
        <Progress className="ml10" percent={Math.floor(uploadedPercentage)} />
      </Paragraph>
    ),
    [hashComputePercentage, isNormal, uploadedPercentage]
  );

  const Description = useCallback(
    () => (
      <Paragraph>
        <Text type="secondary">
          文件名称: {fileName} 文件大小: {sizeStr} 切片大小: {breakpointSizeStr}
          {!isNormal && hash && ` 文件hash: ${hash}`}
        </Text>
      </Paragraph>
    ),
    [breakpointSizeStr, fileName, hash, isNormal, sizeStr]
  );

  // 文件修改事件
  const handleChange = ({ target }: BaseSyntheticEvent) => {
    const files: FileList = target.files;
    const file = files.item(0);

    if (!file) {
      return;
    }

    const fileSize = file.size;

    // 重置与文件hash相关的视图
    setHash('');
    setIsUploading(false);
    setUploadedPercentage(0);
    setHashComputePercentage(0);
    setUploadStatusMap({});
    setFileChunks([]);

    if (fileSize > breakpointSize) {
      // 启用切片模式
      const fileChunk: ChunkInfo[] = [];
      for (let cur = 0; cur < fileSize; cur += breakpointSize) {
        fileChunk.push({ blob: file.slice(cur, cur + breakpointSize) });
      }
      setIsNormal(false);
      setFileChunks(fileChunk);

      // 计算 hash 的 Web Worker
      const computeHashWorker = new ComputeHashWorker();
      computeHashWorker.onmessage = (event: MessageEvent<{ percentage: number; hash?: string }>) => {
        const { percentage, hash } = event.data;

        throttle(setHashComputePercentage, 100)(percentage);
        if (hash) {
          setHash(hash);
          computeHashWorker.terminate();
        }
      };
      computeHashWorker.postMessage(fileChunk);
    } else {
      // 启用正常模式
      setIsNormal(true);
    }
    setSize(fileSize);
    setFileName(file.name);
  };

  // 上传事件
  const handleUpload = async () => {
    if (!size || (!isNormal && !fileChunks.length)) {
      message.error('请先选择文件!');
      return;
    }
    if (isComputingHash) {
      message.error('请等待hash计算完成!');
      return;
    }
    setIsUploading(true);
    if (isNormal) {
      // await axios.post('/api/');
    } else {
      const taskList: Promise<AxiosResponse<UploadResponse>>[] = [];
      for (const [index, { blob }] of Object.entries(fileChunks)) {
        const formData = new FormData();
        formData.append('chunk', blob);
        formData.append('fileName', fileName);
        formData.append('hash', `${hash}_${index}`);
        taskList.push(
          new Promise((resolve, reject) =>
            axios
              .post<UploadResponse>('/api/upload/breakpoint', formData)
              .then((res) => {
                setUploadedPercentage((percentage) => log(percentage + 100 / fileChunks.length));
                setUploadStatusMap((uploadStatusMap) => ({ ...uploadStatusMap, [index]: res.data.data.status }));
                resolve(res);
              })
              .catch(reject)
          )
        );
      }

      try {
        const res = await Promise.all(taskList);
        if (res.some(({ data }) => data.code !== 200)) {
          throw new Error('部分文件上传失败');
        }
        const mergeRes = await axios.post('/api/upload/breakpoint/merge', {
          size: breakpointSize,
          fileName,
          delimiter: '_',
        });
        console.log('res ->', res);
        console.log('mergeRes ->', mergeRes);
        setUploadedPercentage(100);
      } catch (error) {
        console.log('error ->', error);
      }
    }
    setIsUploading(false);
  };

  const handleChooseFile = () => {
    if (isComputingHash) {
      message.error('请等待hash计算完成!');
      return;
    }

    fileRef.current.click();
  };

  // 暂停事件
  const handlePaused = () => {
    if (!isUploading) {
      return;
    }
    if (isNormal) {
      message.error('此模式不支持暂停!');
      return;
    }
  };

  // 取消事件
  const handleCancel = () => {
    if (!isUploading) {
      return;
    }
  };

  return (
    <>
      <Paragraph>
        <style jsx>{`
          .file-input {
            position: absolute;
            top: -99999px;
            left: -99999px;
          }
        `}</style>
        <input ref={(el) => (fileRef.current = el)} className="file-input" type="file" onChange={handleChange} />
        <Button onClick={handleChooseFile} icon={<FileAddOutlined />}>
          选择文件
        </Button>
        <Button className="ml10" icon={<UploadOutlined />} type="primary" onClick={handleUpload}>
          上传
        </Button>
        <Button className="ml10" icon={<PauseOutlined />} onClick={handlePaused}>
          暂停
        </Button>
        <Button className="ml10" icon={<ClearOutlined />} onClick={handleCancel} danger>
          取消
        </Button>
      </Paragraph>
      {size !== 0 && (
        <>
          <Description />
          <ProgressGroup />
        </>
      )}
      {dataSource.length !== 0 && <Table rowKey="index" columns={columns} dataSource={dataSource} />}
    </>
  );
}