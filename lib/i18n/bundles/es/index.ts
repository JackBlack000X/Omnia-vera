import { commonEs } from './common';
import { modalEs } from './modal';

const bundle = {
  ...commonEs,
  modal: modalEs,
} as const;

export default bundle;
