// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Training targets are sin(2*pi*x) plus Gaussian noise. The hidden test targets are the clean
// curve, so a point passes when the prediction is within the task's tolerance of the true value.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const target = (v) => Math.sin(2 * Math.PI * v);
  const trainX = [];
  const trainY = [];
  for (let i = 0; i < trainSize; i++) {
    const v = rng();
    trainX.push([v]);
    trainY.push(target(v) + 0.15 * gauss());
  }
  const testX = [];
  const testY = [];
  for (let i = 0; i < testSize; i++) {
    const v = rng();
    testX.push([v]);
    testY.push(target(v));
  }
  return { trainX, trainY, testX, testY };
}
