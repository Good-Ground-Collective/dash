export class DuplicateProbeNameError extends Error {
  override name = 'DuplicateProbeNameError';

  constructor(props: { probeName: string }) {
    super(`More than one health probe is named '${props.probeName}'`);
  }
}
