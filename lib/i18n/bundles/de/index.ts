import { commonDe } from './common';
import { modalDe } from './modal';

const bundle = {
  ...commonDe,
  modal: modalDe,
} as const;

export default bundle;
