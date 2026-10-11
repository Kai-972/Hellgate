// Hidden. Runs in the parent process only. The learner never sees this file or the test labels.
// The training set is 90% class 0 and 10% class 1. The hidden test set is balanced 50/50, so a
// learner that simply favours the common class scores about 50%.
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
  const point = (label) => {
    const t = Math.PI * rng();
    const px = label === 0 ? Math.cos(t) : 1 - Math.cos(t);
    const py = label === 0 ? Math.sin(t) : 0.5 - Math.sin(t);
    return [px + 0.18 * gauss(), py + 0.18 * gauss()];
  };
  const makeTrain = (n) => {
    const rare = Math.round(n * 0.1);
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const label = i < rare ? 1 : 0;
      x.push(point(label));
      y.push(label);
    }
    return shuffle(x, y);
  };
  const makeTest = (n) => {
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      x.push(point(label));
      y.push(label);
    }
    return shuffle(x, y);
  };
  const [trainX, trainY] = makeTrain(trainSize);
  const [testX, testY] = makeTest(testSize);
  return { trainX, trainY, testX, testY };
}
