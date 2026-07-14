export interface BusinessContextModel {
  generatedAt: string;
  domain: string;
  objectives: string[];
}

export class BusinessContext {

  private context?: BusinessContextModel;

  build(): BusinessContextModel {
    this.context = {
      generatedAt: new Date().toISOString(),
      domain: "UNKNOWN",
      objectives: []
    };

    return this.context;
  }

  current() {
    return this.context;
  }

}
