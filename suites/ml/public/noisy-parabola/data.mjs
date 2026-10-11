// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Training targets are x*x - 0.5 plus Gaussian noise (0.2). The hidden test targets are the clean curve.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const curve = (v) => v * v - 0.5;
  const make = (n, noisy) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const v = 2 * rng() - 1;
      x.push([v]);
      y.push(curve(v) + (noisy ? 0.2 * gauss() : 0));
    }
    return [x, y];
  };
  const [trainX, trainY] = make(trainSize, true);
  const [testX, testY] = make(testSize, false);
  return { trainX, trainY, testX, testY };
}
