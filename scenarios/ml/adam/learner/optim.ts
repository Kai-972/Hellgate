// The optimizer: how a gradient becomes a change to the parameters. Adam keeps a running average of
// each parameter's gradient and of its square, so every parameter gets a step size suited to it.

export interface Optimizer {
  step(params: Float64Array, grads: Float64Array, rate: number): void;
}

const BETA1 = 0.9;
const BETA2 = 0.999;
const EPSILON = 1e-8;

export function makeOptimizer(size: number): Optimizer {
  const first = new Float64Array(size);
  const second = new Float64Array(size);
  let steps = 0;
  return {
    step(params, grads, rate) {
      steps++;
      const correct1 = 1 - BETA1 ** steps;
      const correct2 = 1 - BETA2 ** steps;
      for (let i = 0; i < params.length; i++) {
        const g = grads[i]!;
        first[i] = BETA1 * first[i]! + (1 - BETA1) * g;
        second[i] = BETA2 * second[i]! + (1 - BETA2) * g * g;
        params[i] = params[i]! - (rate * (first[i]! / correct1)) / (Math.sqrt(second[i]! / correct2) + EPSILON);
      }
    },
  };
}
