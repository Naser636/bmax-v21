export interface Capability{
id:string;
name:string;
}
export class CapabilityRegistry{
private readonly capabilities=new Map<string,Capability>();
register(c:Capability){this.capabilities.set(c.id,c);}
all(){return [...this.capabilities.values()];}
}
