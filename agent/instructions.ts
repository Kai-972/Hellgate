// What the agent tells the model. Each entry is one instruction, joined by newlines into the system
// prompt. Beat the gate appends one quoted string to this list and changes nothing else.

export const RULES: string[] = [
  'You are a JavaScript programmer.',
  'Reply with the complete contents of the solution file.',
];
