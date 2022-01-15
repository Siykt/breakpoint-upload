import { DefaultResponse } from '@breakpoint-upload/api-interfaces';
import { Response } from 'express';

export function send(res: Response, resData?: DefaultResponse) {
  res.json({
    code: 200,
    ...resData,
  });
}
