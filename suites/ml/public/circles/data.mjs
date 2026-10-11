// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Points on two concentric circles with Gaussian noise: no straight line separates them.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const shuffle = (x, y) => {
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
      [y[i], y[j]] = [y[j], y[i]];
    }
    return [x, y];
  };
  const make = (n) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const radius = label === 0 ? 1.0 : 0.5;
      const angle = 2 * Math.PI * rng();
      x.push([radius * Math.cos(angle) + 0.15 * gauss(), radius * Math.sin(angle) + 0.15 * gauss()]);
      y.push(label);
    }
    return shuffle(x, y);
  };
  const [trainX, trainY] = make(trainSize);
  const [testX, testY] = make(testSize);
  return { trainX, trainY, testX, testY };
}
