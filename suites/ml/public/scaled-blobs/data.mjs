// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// Two Gaussian blobs, easy to separate. The second feature is stretched by 1000 and shifted by
// 500, so an optimizer with one fixed step size struggles unless the features are rescaled.
export function generate(rng, { trainSize, testSize }) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const make = (n) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const centre = label === 1 ? 1 : -1;
      const a = centre + 0.9 * gauss();
      const b = centre + 0.9 * gauss();
      x.push([a, b * 1000 + 500]);
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
