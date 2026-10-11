// A small neural network: inputs → one tanh layer → outputs, with all parameters in one flat array so
// that an optimizer can treat them as a single vector. Classification ends in a softmax with
// cross-entropy; regression ends in one linear output with squared error.

export interface Shape {
  inputs: number;
  hidden: number;
  outputs: number;
}

export type Kind = 'classification' | 'regression';

export const paramCount = (s: Shape): number => s.hidden * s.inputs + s.hidden + s.outputs * s.hidden + s.outputs;

// Layout: W1 (hidden × inputs), b1 (hidden), W2 (outputs × hidden), b2 (outputs).
const offsets = (s: Shape) => {
  const b1 = s.hidden * s.inputs;
  const w2 = b1 + s.hidden;
  return { b1, w2, b2: w2 + s.outputs * s.hidden };
};

export function initParams(s: Shape, random: () => number): Float64Array {
  const params = new Float64Array(paramCount(s));
  const at = offsets(s);
  const limit1 = 1 / Math.sqrt(s.inputs);
  for (let i = 0; i < at.b1; i++) params[i] = (random() * 2 - 1) * limit1;
  const limit2 = 1 / Math.sqrt(s.hidden);
  for (let i = at.w2; i < at.b2; i++) params[i] = (random() * 2 - 1) * limit2;
  return params;
}

function forward(params: Float64Array, s: Shape, x: readonly number[], hidden: Float64Array, out: Float64Array): void {
  const at = offsets(s);
  for (let j = 0; j < s.hidden; j++) {
    let z = params[at.b1 + j]!;
    for (let i = 0; i < s.inputs; i++) z += params[j * s.inputs + i]! * x[i]!;
    hidden[j] = Math.tanh(z);
  }
  for (let k = 0; k < s.outputs; k++) {
    let z = params[at.b2 + k]!;
    for (let j = 0; j < s.hidden; j++) z += params[at.w2 + k * s.hidden + j]! * hidden[j]!;
    out[k] = z;
  }
}

/**
 * Add the mean gradient over `batch` (indices into `xs`) to `grads`, and return the mean loss.
 * `grads` must be zeroed by the caller.
 */
export function lossAndGrad(
  params: Float64Array,
  grads: Float64Array,
  s: Shape,
  kind: Kind,
  xs: readonly (readonly number[])[],
  ys: readonly number[],
  batch: readonly number[],
): number {
  const at = offsets(s);
  const hidden = new Float64Array(s.hidden);
  const out = new Float64Array(s.outputs);
  const dout = new Float64Array(s.outputs);
  const scale = 1 / batch.length;
  let loss = 0;
  for (const n of batch) {
    const x = xs[n]!;
    forward(params, s, x, hidden, out);
    if (kind === 'classification') {
      let top = -Infinity;
      for (let k = 0; k < s.outputs; k++) top = Math.max(top, out[k]!);
      let total = 0;
      for (let k = 0; k < s.outputs; k++) total += (dout[k] = Math.exp(out[k]! - top));
      for (let k = 0; k < s.outputs; k++) dout[k] = dout[k]! / total;
      loss -= Math.log(Math.max(dout[ys[n]!]!, 1e-12));
      dout[ys[n]!] = dout[ys[n]!]! - 1;
    } else {
      dout[0] = out[0]! - ys[n]!;
      loss += 0.5 * dout[0] * dout[0];
    }
    for (let k = 0; k < s.outputs; k++) {
      const g = dout[k]! * scale;
      grads[at.b2 + k] = grads[at.b2 + k]! + g;
      for (let j = 0; j < s.hidden; j++) grads[at.w2 + k * s.hidden + j] = grads[at.w2 + k * s.hidden + j]! + g * hidden[j]!;
    }
    for (let j = 0; j < s.hidden; j++) {
      let back = 0;
      for (let k = 0; k < s.outputs; k++) back += dout[k]! * params[at.w2 + k * s.hidden + j]!;
      const dz = back * (1 - hidden[j]! * hidden[j]!) * scale;
      grads[at.b1 + j] = grads[at.b1 + j]! + dz;
      for (let i = 0; i < s.inputs; i++) grads[j * s.inputs + i] = grads[j * s.inputs + i]! + dz * x[i]!;
    }
  }
  return loss * scale;
}

/** The class with the largest score, or the regression value. */
export function predict(params: Float64Array, s: Shape, kind: Kind, x: readonly number[]): number {
  const hidden = new Float64Array(s.hidden);
  const out = new Float64Array(s.outputs);
  forward(params, s, x, hidden, out);
  if (kind === 'regression') return out[0]!;
  let best = 0;
  for (let k = 1; k < s.outputs; k++) if (out[k]! > out[best]!) best = k;
  return best;
}
