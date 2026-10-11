// The optimizer: how a gradient becomes a change to the parameters. Plain stochastic gradient
// descent, one fixed step size, no memory between steps.

export interface Optimizer {
  step(params: Float64Array, grads: Float64Array, rate: number): void;
}

export function makeOptimizer(_size: number): Optimizer {
  return {
    step(params, grads, rate) {
      for (let i = 0; i < params.length; i++) params[i] = params[i]! - rate * grads[i]!;
    },
  };
}
