export interface DefaultResponse {
  code?: number;
  msg?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface UploadResponse extends DefaultResponse {
  code: 200 | 500;
  data: {
    hash: string;
    status: 0 | 1;
  };
}

export interface UploadMergeResponse extends DefaultResponse {
  code: 0 | 200;
  data: boolean;
}

/** 切片上传接口的formData参数 hash */
export interface UploadBreakpointMergeRequestParams {
  /** hash的大小 */
  size: number;
  /** hash的分隔符 */
  delimiter: string;
  /** 文件名 */
  fileName: string;
}

export interface UploadBreakpointRequestParams {
  /** 文件 hash */
  hash: string;
  /** 文件切片内容 */
  chunk: string;
}
