// Preprocessing: what happens to the inputs before the network sees them. Each feature is shifted to
// mean 0 and scaled to standard deviation 1, using the training inputs only.

export type Transform = (row: readonly number[]) => number[];

/** Learn a transform from the training inputs. */
export function fitTransform(trainX: readonly (readonly number[])[]): Transform {
  const width = trainX[0]!.length;
  const mean = new Array<number>(width).fill(0);
  for (const row of trainX) for (let i = 0; i < width; i++) mean[i] = mean[i]! + row[i]! / trainX.length;
  const spread = new Array<number>(width).fill(0);
  for (const row of trainX) for (let i = 0; i < width; i++) spread[i] = spread[i]! + (row[i]! - mean[i]!) ** 2 / trainX.length;
  const scale = spread.map((v) => Math.max(Math.sqrt(v), 1e-8));
  return (row) => row.map((v, i) => (v - mean[i]!) / scale[i]!);
}
