// The learner: train a small network on the training set, then predict the test inputs.
// Every run is a pure function of the task and the seeded `kit.random`.
import type { MlKit, MlTask, Predictions } from './contract.ts';
import { initParams, lossAndGrad, predict, type Shape } from './model.ts';
import { makeOptimizer } from './optim.ts';
import { fitTransform } from './prep.ts';
import { learningRate } from './schedule.ts';

const HIDDEN = 16;
const EPOCHS = 200;
const BATCH = 20;
const BASE_RATE = 0.01;

export async function fit(task: MlTask, kit: MlKit): Promise<Predictions> {
  const transform = fitTransform(task.train.x);
  const xs = task.train.x.map(transform);
  const ys = task.train.y;
  const shape: Shape = { inputs: task.features, hidden: HIDDEN, outputs: task.kind === 'classification' ? task.classes! : 1 };

  const params = initParams(shape, kit.random);
  const grads = new Float64Array(params.length);
  const optimizer = makeOptimizer(params.length);
  const order = xs.map((_, i) => i);

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(kit.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const rate = learningRate(epoch, EPOCHS, BASE_RATE);
    let loss = 0;
    for (let start = 0; start < order.length; start += BATCH) {
      grads.fill(0);
      loss += lossAndGrad(params, grads, shape, task.kind, xs, ys, order.slice(start, start + BATCH));
      optimizer.step(params, grads, rate);
    }
    if (epoch % 50 === 0 || epoch === EPOCHS - 1) kit.trace('epoch', { epoch, loss: Math.round(1000 * loss) / 1000 });
  }

  // A network that diverged predicts nothing sensible; report 0 for it rather than a non-finite number.
  const y = task.testX.map((row) => {
    const p = predict(params, shape, task.kind, transform(row));
    return Number.isFinite(p) ? p : 0;
  });
  return { y };
}
