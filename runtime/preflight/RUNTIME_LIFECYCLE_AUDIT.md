# ODG Runtime Lifecycle Audit

Generated : 2026-07-12T12:18:11+00:00

==================================================
COMPONENT : capability-registry.ts
--------------------------------------------------
Constructors :
None

Public methods :
7:register(c:Capability){this.capabilities.set(c.id,c);}
8:all(){return [...this.capabilities.values()];}

Instantiated by :
None

==================================================
COMPONENT : event-bus.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : execution-memory.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : execution-planner.ts
--------------------------------------------------
Constructors :
19:  constructor(

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : index.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : mission-loader.ts
--------------------------------------------------
Constructors :
10:  constructor(

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : mission-orchestrator.ts
--------------------------------------------------
Constructors :
15:  constructor(

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : plugin-registry.ts
--------------------------------------------------
Constructors :
None

Public methods :
7:register(p:Plugin){this.plugins.set(p.id,p);}
8:all(){return [...this.plugins.values()];}

Instantiated by :
None

==================================================
COMPONENT : runtime-demo.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : runtime-events.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : runtime-executor.ts
--------------------------------------------------
Constructors :
None

Public methods :
15:  execute(id:string,name:string){

Instantiated by :
None

==================================================
COMPONENT : runtime-facade.ts
--------------------------------------------------
Constructors :
None

Public methods :
11:status(){
15:runtimeService(){
19:report(data:unknown){

Instantiated by :
None

==================================================
COMPONENT : runtime-health.ts
--------------------------------------------------
Constructors :
None

Public methods :
2:check(){

Instantiated by :
None

==================================================
COMPONENT : runtime-reporter.ts
--------------------------------------------------
Constructors :
None

Public methods :
2:report(input:unknown){

Instantiated by :
None

==================================================
COMPONENT : runtime-service.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : runtime-state.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
COMPONENT : runtime-types.ts
--------------------------------------------------
Constructors :
None

Public methods :
None

Instantiated by :
None

==================================================
SUMMARY

Mission READ ONLY.
No source file modified.

Build      : OK
TypeScript : OK
Git        : OK
