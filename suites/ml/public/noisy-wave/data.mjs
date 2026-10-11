// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Training targets are sin(2a) * cos(2b) plus Gaussian noise (0.25), for a and b in [-1.5, 1.5].
// The hidden test targets are the clean surface.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const surface = (a, b) => Math.sin(2 * a) * Math.cos(2 * b);
  const make = (n, noisy) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const a = 3 * rng() - 1.5;
      const b = 3 * rng() - 1.5;
      x.push([a, b]);
      y.push(surface(a, b) + (noisy ? 0.25 * gauss() : 0));
    }
    return [x, y];
  };
  const [trainX, trainY] = make(trainSize, true);
  const [testX, testY] = make(testSize, false);
  return { trainX, trainY, testX, testY };
}
