export interface Plugin{
id:string;
version:string;
}
export class PluginRegistry{
private readonly plugins=new Map<string,Plugin>();
register(p:Plugin){this.plugins.set(p.id,p);}
all(){return [...this.plugins.values()];}
}
