import { fileURLToPath } from 'node:url';

export default {
  extends: [fileURLToPath(import.meta.resolve('stylelint-config-standard'))],
};
