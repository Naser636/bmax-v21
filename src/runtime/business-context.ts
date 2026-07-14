export interface BusinessContextModel {
  generatedAt: string;
  domain: string;
  objectives: string[];
}

export class BusinessContext {

  build(): BusinessContextModel {
    return {
      generatedAt: new Date().toISOString(),
      domain: "UNKNOWN",
      objectives: []
    };
  }

}
