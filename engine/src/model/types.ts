export type ModelRequest = {
  id: string;
  input: string;
};

export type ModelResponse = {
  id: string;
  output: string;
  model: string;
  timestamp: number;
};
