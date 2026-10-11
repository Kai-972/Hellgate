// Preprocessing: what happens to the inputs before the network sees them. Nothing, to begin with.

export type Transform = (row: readonly number[]) => number[];

/** Learn a transform from the training inputs. */
export function fitTransform(_trainX: readonly (readonly number[])[]): Transform {
  return (row) => [...row];
}
