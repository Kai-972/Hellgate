// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Two interleaving half-circles with Gaussian noise: not separable by a straight line.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const make = (n) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const t = Math.PI * rng();
      const px = label === 0 ? Math.cos(t) : 1 - Math.cos(t);
      const py = label === 0 ? Math.sin(t) : 0.5 - Math.sin(t);
      x.push([px + 0.2 * gauss(), py + 0.2 * gauss()]);
      y.push(label);
    }
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
      [y[i], y[j]] = [y[j], y[i]];
    }
    return [x, y];
  };
  const [trainX, trainY] = make(trainSize);
  const [testX, testY] = make(testSize);
  return { trainX, trainY, testX, testY };
}
