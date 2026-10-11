// The optimizer: how a gradient becomes a change to the parameters. Stochastic gradient descent with
// momentum: each step carries on in part in the direction of the last ones.

export interface Optimizer {
  step(params: Float64Array, grads: Float64Array, rate: number): void;
}

const MOMENTUM = 0.9;

export function makeOptimizer(size: number): Optimizer {
  const velocity = new Float64Array(size);
  return {
    step(params, grads, rate) {
      for (let i = 0; i < params.length; i++) {
        velocity[i] = MOMENTUM * velocity[i]! + grads[i]!;
        params[i] = params[i]! - rate * velocity[i]!;
      }
    },
  };
}
