export type RecordingEntry = {
  requestId: string;
  request: any;
  response: any;
};

export class Recorder {
  private entries: RecordingEntry[] = [];
  record(requestId: string, request: any, response: any) {
    this.entries.push({ requestId, request, response });
  }
  getEntries() {
    return this.entries;
  }
  toJson() {
    return { entries: this.entries };
  }
}
