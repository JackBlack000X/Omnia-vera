import { commonEn } from './common';
import { modalEn } from './modal';

const bundle = {
  ...commonEn,
  modal: modalEn,
} as const;

export default bundle;
