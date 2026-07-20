# NEXT RUNTIME CAPABILITY

Name:
System Configuration Loader

Objective:
At Runtime startup, load the system configuration from runtime/system/.

Responsibilities:
- Load CONSTITUTION.
- Load ROADMAP.
- Load POLICIES.
- Load STANDARDS.
- Load EXECUTION_BOARD.
- Build a single PROJECT_STATE in memory.
- Make PROJECT_STATE available to all Runtime services.
- Do not let services read these files directly.
- Fail fast if a required system file is missing or invalid.

Status:
PLANNED

Priority:
HIGH
