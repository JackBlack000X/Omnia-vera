import { commonFr } from './common';
import { modalFr } from './modal';

const bundle = {
  ...commonFr,
  modal: modalFr,
} as const;

export default bundle;
