# Runtime Migration Map

| Current Node Engine | Target TypeScript Engine | Status |
|---------------------|--------------------------|--------|
| mission-interpreter | mission-engine.ts | TODO |
| mission-loader.js | mission-loader.ts | TODO |
| execution-planner.js | execution-planner.ts | TODO |
| capability-registry.js | capability-registry.ts | TODO |
| knowledge-engine.js | runtime-executor.ts | TODO |
| decision-engine.js | runtime-governor.ts | TODO |
| patch-engine.js | patch-engine.ts | TODO |
| validation-engine.js | runtime-reporter.ts | TODO |

Target Runtime Entry:

RuntimeKernel
    ↓
RuntimeExecutor
    ↓
MissionEngine
