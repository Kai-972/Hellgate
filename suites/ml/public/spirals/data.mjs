// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Two spiral arms wound around the origin, one the mirror image of the other. The hardest of the
// nonlinear tasks: a small network needs enough training to follow the winding.
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
      const t = 0.15 + 0.85 * rng();
      const angle = 3 * Math.PI * t + (label === 0 ? 0 : Math.PI);
      x.push([t * Math.cos(angle) + 0.03 * gauss(), t * Math.sin(angle) + 0.03 * gauss()]);
      y.push(label);
    }
    return shuffle(x, y);
  };
  const [trainX, trainY] = make(trainSize);
  const [testX, testY] = make(testSize);
  return { trainX, trainY, testX, testY };
}
