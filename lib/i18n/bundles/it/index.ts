import { commonIt } from './common';
import { modalIt } from './modal';

const bundle = {
  ...commonIt,
  modal: modalIt,
} as const;

export default bundle;
