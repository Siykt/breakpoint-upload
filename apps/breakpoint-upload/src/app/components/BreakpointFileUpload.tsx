import { Button, Typography, Table, Progress, message } from 'antd';
import React, { BaseSyntheticEvent, useCallback, useReducer, useMemo, useRef, useState, Reducer } from 'react';
import { PauseOutlined, UploadOutlined, ClearOutlined, FileAddOutlined, SyncOutlined } from '@ant-design/icons';
// eslint-disable-next-line import/no-webpack-loader-syntax
import ComputeHashWorker from 'worker-loader!./computeHash.worker';
import axios, { AxiosResponse } from 'axios';
import { UploadResponse } from '@breakpoint-upload/api-interfaces';
import { throttle } from 'lodash';
import { concurrentFetch, log } from '../../utils';
import { DEFAULT_BREAKPOINT_CHUNK_SIZE } from '../constants';
import { ComputeMessageEvent } from './computeHash.worker';
import { AwaitDone } from '../../utils/AwaitDone';

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

export interface BreakpointFileUploadState {
  hash: string;
  fileName: string;
  uploadFile: File;
  size: number;
  chunksLength: number;
  isNormal: boolean;
  isUploading: boolean;
  isComputingHash: boolean;
  uploadedPercentage: number;
  hashComputePercentage: number;
  uploadStatusMap: { [x: number]: number };
}

enum Action {
  update = 'update',
  uploading = 'uploading',
  uploaded = 'uploaded',
  computingHash = 'computingHash',
  computedHash = 'computedHash',
  addUploadedPercentage = 'addUploadedPercentage',
  addHashComputePercentage = 'addHashComputePercentage',
  updateUploadStatusMap = 'updateUploadStatusMap',
  updateHash = 'updateHash',
  reset = 'reset',
}

interface BreakpointFileUploadReducerAction {
  type: Action;
  uploadedPercentage?: BreakpointFileUploadState['uploadedPercentage'];
}

interface BreakpointFileUploadReducerAction {
  type: Action;
  hashComputePercentage?: BreakpointFileUploadState['hashComputePercentage'];
}

interface BreakpointFileUploadReducerAction {
  type: Action;
  uploadStatusMap?: BreakpointFileUploadState['uploadStatusMap'];
}

interface BreakpointFileUploadReducerAction {
  type: Action;
  hash?: BreakpointFileUploadState['hash'];
}

interface BreakpointFileUploadReducerAction {
  type: Action;
  payload?: BreakpointFileUploadState;
}

interface BreakpointFileUploadProps {
  breakpointSize?: number;
}

const STATUS = ['?????????', '?????????', '?????????', '?????????'];
const source = axios.CancelToken.source();
const Sleep = new AwaitDone();

function reducer(
  state: BreakpointFileUploadState,
  action: BreakpointFileUploadReducerAction
): BreakpointFileUploadState {
  switch (action.type) {
    case Action.update:
      return { ...state, ...action.payload };
    case Action.uploading:
      return { ...state, isUploading: true };
    case Action.uploaded:
      return { ...state, isUploading: false };
    case Action.computingHash:
      return { ...state, isComputingHash: true };
    case Action.computedHash:
      return { ...state, isComputingHash: false };
    case Action.addUploadedPercentage:
      return { ...state, uploadedPercentage: state.uploadedPercentage + action.uploadedPercentage };
    case Action.updateUploadStatusMap:
      return { ...state, uploadStatusMap: { ...state.uploadStatusMap, ...action.uploadStatusMap } };
    case Action.addHashComputePercentage:
      return { ...state, hashComputePercentage: state.hashComputePercentage + action.hashComputePercentage };
    case Action.updateHash:
      return { ...state, hash: action.hash };
    case Action.reset:
      return initState();
    default:
      throw new Error('??????type: ' + action.type);
  }
}

function initState(): BreakpointFileUploadState {
  return {
    hash: '',
    fileName: '',
    uploadFile: undefined,
    size: 0,
    chunksLength: 0,
    isNormal: false,
    isUploading: false,
    isComputingHash: false,
    uploadedPercentage: 0,
    hashComputePercentage: 0,
    uploadStatusMap: {},
  };
}

type BreakpointFileUploadReducer = Reducer<BreakpointFileUploadState, BreakpointFileUploadReducerAction>;

export default function BreakpointFileUpload({ breakpointSize }: BreakpointFileUploadProps) {
  // ?????? breakpointSize ????????????????????????
  breakpointSize = breakpointSize || DEFAULT_BREAKPOINT_CHUNK_SIZE;
  const fileRef = useRef<HTMLInputElement>();
  const isPaused = useRef<boolean>(false);
  const computeHashWorker = useRef<ComputeHashWorker>();
  const [state, dispatch] = useReducer<BreakpointFileUploadReducer, BreakpointFileUploadState>(
    reducer,
    initState(),
    initState
  );
  const sizeStr = useMemo(() => formatBitSize(state.size), [state.size]);
  const breakpointSizeStr = useMemo(() => formatBitSize(breakpointSize), [breakpointSize]);
  const getStatusText = useCallback((status: number) => STATUS[status || 0], []);
  const dataSource = useMemo(() => {
    if (state.chunksLength) {
      const list = Array(state.chunksLength)
        .fill(0)
        .map((_, index) => ({
          index,
          hash: state.hash ? `${state.hash}_${index}` : '?????????',
          size: breakpointSize,
          status: state.uploadStatusMap[index],
        }));

      list[list.length - 1].size = state.size % breakpointSize ? state.size % breakpointSize : breakpointSize;
      return list;
    }
    return [];
  }, [state.chunksLength, state.size, state.hash, state.uploadStatusMap, breakpointSize]);

  const columnRender = (text: string) => <Text>{text}</Text>;
  const columns = [
    {
      title: '??????',
      dataIndex: 'index',
      render: columnRender,
    },
    {
      title: 'hash',
      dataIndex: 'hash',
      render: columnRender,
    },
    {
      title: '??????',
      dataIndex: 'size',
      render: columnRender,
    },
    {
      title: '????????????',
      dataIndex: 'status',
      render: (status: number) => <Text>{getStatusText(status)}</Text>,
    },
  ];

  const ProgressGroup = useCallback(
    () => (
      <Paragraph>
        {!state.isNormal && (
          <>
            <Text type="secondary">hash????????????</Text>
            <Progress percent={Math.floor(state.hashComputePercentage)} />
            <Text type="secondary">???????????????</Text>
          </>
        )}
        <Progress percent={Math.floor(state.uploadedPercentage)} />
      </Paragraph>
    ),
    [state.hashComputePercentage, state.isNormal, state.uploadedPercentage]
  );

  const Description = useCallback(
    () => (
      <Paragraph>
        <Text type="secondary">
          ????????????: {state.fileName} ????????????: {sizeStr} ????????????: {breakpointSizeStr}
          {!state.isNormal && state.hash && ` ??????hash: ${state.hash}`}
        </Text>
      </Paragraph>
    ),
    [breakpointSizeStr, state.fileName, state.hash, state.isNormal, sizeStr]
  );

  // ??????????????????
  const handleChange = ({ target }: BaseSyntheticEvent) => {
    const files: FileList = target.files;
    const file = files.item(0);

    if (!file) {
      return;
    }

    const fileSize = file.size;

    dispatch({
      type: Action.update,
      payload: {
        ...state,
        uploadFile: file,
        hash: '',
        chunksLength: Math.ceil(fileSize / breakpointSize),
        isUploading: false,
        uploadedPercentage: 0,
        hashComputePercentage: 0,
        uploadStatusMap: {},
        isNormal: fileSize <= breakpointSize,
        size: fileSize,
        fileName: file.name,
      },
    });
  };

  // ????????????
  const handleUpload = async () => {
    if (!state.uploadFile || !state.size || (!state.isNormal && !state.chunksLength)) {
      message.error('??????????????????!');
      return;
    }

    dispatch({ type: Action.uploading });

    if (state.isNormal) {
      // await axios.post('/api/');
    } else {
      dispatch({ type: Action.computingHash });
      // ?????? hash ??? WebWorker
      computeHashWorker.current = new ComputeHashWorker();
      const taskList: ((index: number) => Promise<AxiosResponse<UploadResponse>>)[] = [];
      const awaitHashComputedSuccess = new Promise<string>((resolve) => {
        computeHashWorker.current.onmessage = async (event: ComputeMessageEvent) => {
          const { percentage, hash } = event.data;
          const runner = () => {
            dispatch({ type: Action.addHashComputePercentage, hashComputePercentage: percentage });

            if (hash) {
              dispatch({ type: Action.updateHash, hash });
              resolve(hash);
              computeHashWorker.current.terminate();
            }
          };

          if (isPaused.current) {
            Sleep.addCallback(runner);
            await Sleep.start();
          } else {
            runner();
          }
        };
      });

      computeHashWorker.current.postMessage(state.uploadFile);

      try {
        const hash = await awaitHashComputedSuccess;
        for (let cur = 0, index = 0; cur < state.size; cur += breakpointSize) {
          const chunk = state.uploadFile.slice(cur, cur + breakpointSize);
          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('fileName', state.fileName);
          formData.append('hash', `${hash}_${index++}`);
          taskList.push(async (index) => {
            const res = await axios.post<UploadResponse>('/api/upload/breakpoint', formData, {
              cancelToken: source.token,
            });
            dispatch({ type: Action.addUploadedPercentage, uploadedPercentage: 100 / state.chunksLength });
            dispatch({ type: Action.updateUploadStatusMap, uploadStatusMap: { [index]: res.data.data.status } });
            return res;
          });
        }
        // ?????? hash ????????????
        dispatch({ type: Action.computedHash });

        const res = await concurrentFetch(taskList);

        if (res.some(({ data }) => data.code !== 200)) {
          throw new Error('????????????????????????');
        }

        const mergeRes = await axios.post('/api/upload/breakpoint/merge', {
          size: breakpointSize,
          fileName: state.fileName,
          delimiter: '_',
        });
        console.log('res ->', res);
        console.log('mergeRes ->', mergeRes);
        dispatch({ type: Action.addUploadedPercentage, uploadedPercentage: 1 });
      } catch (error) {
        console.log('error ->', error);
      }
    }

    dispatch({ type: Action.uploaded });
  };

  const handleChooseFile = () => {
    if (state.isComputingHash) {
      message.error('?????????hash????????????!');
      return;
    }

    fileRef.current.click();
  };

  // ????????????
  const handlePaused = () => {
    log('Paused', 'Event');
    if (!log(state.isUploading, 'state.isUploading')) {
      return;
    }
    if (log(state.isNormal)) {
      // ?????????????????????????????????
      handleCancel();
    } else {
      let message: -1 | 1 = -1;
      if (log(isPaused.current, 'isPaused.current')) {
        message = 1;
        Sleep.release();
      }
      if (computeHashWorker.current && state.isComputingHash) {
        computeHashWorker.current.postMessage(message);
      } else {
        source.cancel('??????????????????');
      }
      isPaused.current = !isPaused.current;
      dispatch({ type: Action.computedHash });
    }
  };

  // ????????????
  const handleCancel = () => {
    if (!state.isUploading) {
      return;
    }

    dispatch({ type: Action.reset });

    if (computeHashWorker.current && state.isComputingHash) {
      computeHashWorker.current.terminate();
      computeHashWorker.current = undefined;
    } else {
      source.cancel('??????????????????');
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
          ????????????
        </Button>
        <Button
          className="ml10"
          icon={<UploadOutlined />}
          type="primary"
          onClick={handleUpload}
          loading={state.isUploading}
        >
          ??????
        </Button>
        <Button className="ml10" icon={isPaused.current ? <SyncOutlined /> : <PauseOutlined />} onClick={handlePaused}>
          {isPaused.current ? '??????' : '??????'}
        </Button>
        <Button className="ml10" icon={<ClearOutlined />} onClick={handleCancel} danger>
          ??????
        </Button>
      </Paragraph>
      {state.size !== 0 && (
        <>
          <Description />
          <ProgressGroup />
        </>
      )}
      {dataSource.length !== 0 && <Table rowKey="index" columns={columns} dataSource={dataSource} />}
    </>
  );
}
