// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// The moons problem with its first feature divided by 50 and its second multiplied by 800 and shifted.
// An optimizer with one fixed step size cannot suit both axes unless the features are rescaled.
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
      const t = Math.PI * rng();
      const px = (label === 0 ? Math.cos(t) : 1 - Math.cos(t)) + 0.12 * gauss();
      const py = (label === 0 ? Math.sin(t) : 0.5 - Math.sin(t)) + 0.12 * gauss();
      x.push([px / 50 + 3, py * 800 + 400]);
      y.push(label);
    }
    return shuffle(x, y);
  };
  const [trainX, trainY] = make(trainSize);
  const [testX, testY] = make(testSize);
  return { trainX, trainY, testX, testY };
}
