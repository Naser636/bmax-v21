# ODG BTP — WORLD-CLASS EXCELLENCE MASTER ROADMAP
## V12.4 — Cumulative Functional, Technical, Normative, Operational and Commercial Programme

**Document type:** Master roadmap / proposed canonical extension  
**Priority:** Strategic P0  
**Scope:** BTP, bâtiment, rénovation, construction, travaux publics, maintenance and all associated métiers  
**Status:** Roadmap specification — implementation, integration and qualification required  
**Authority:** ODG exclusively  
**Final code validator:** ODG  
**Technical provider:** Claude Code only, subordinate to ODG  
**Architecture constraint:** Exactly nine permanent ODG primitives; no tenth primitive and no parallel governance system.

---

# 0. MANDATE AND AUTHORITY

This programme extends the existing ODG BTP specifications cumulatively.

It MUST preserve:
- The original 20 mandatory Intelligent Devis functions.
- The complete voice/photo/video field-operation requirements.
- All existing BTP capabilities, contracts, tests, evidence and accepted work.
- The canonical Boussole V12.4 and its existing semantics.
- The nine permanent primitives.
- Truth Lock, deny-by-default, permissions, evidence and recovery mechanisms.
- Existing architecture and accepted implementation decisions unless ODG proves a necessary correction.

No existing requirement may be silently deleted, weakened, renamed to evade acceptance, duplicated or replaced.

## Authority hierarchy

1. Boussole V12.4 remains the canonical strategic and governance reference.
2. ODG is the exclusive operational authority for mission selection, planning, execution coordination, technical decisions, code inspection and final validation.
3. ODG must use its own available deterministic and local capabilities whenever possible.
4. Claude Code is a bounded technical provider. It may propose, explain, generate or modify code only within a task explicitly authorized and controlled by ODG.
5. Claude Code is NOT the project owner, mission authority, independent validator or final acceptance authority.
6. ODG must inspect provider output, run or coordinate tests, verify evidence, inspect diffs and accept or reject the result itself.
7. If ODG cannot independently verify a result, the result remains NOT VALIDATED.
8. No provider-generated assertion is sufficient evidence of completion.

## Execution safety

This roadmap does not authorize:
- VPS access or modification.
- Deployment or production release.
- systemd, sudo or remote commands.
- Secrets, credentials or environment-secret extraction.
- Production database mutation.
- Paid provider calls or purchases.
- External communications, orders, signatures or financial commitments.
- Changes to production services.

Work is limited to authorized source-code, documentation, tests, local simulations and reversible repository operations.

---

# 1. STRATEGIC OBJECTIVE — WORLD-CLASS BTP

Build ODG BTP toward world-class capability across the complete construction lifecycle.

The ambition is to become a leading integrated intelligence and operations system, not merely a quotation generator, invoicing application or project dashboard.

ODG must progressively combine:

- Technical and regulatory intelligence.
- Photo, video, plan and document understanding.
- Intelligent quantity surveying and estimating.
- Material, supplier and price intelligence.
- Labour, equipment and fleet costing.
- Planning and work preparation.
- Voice-first field operations.
- End-to-end chantier management.
- Quality, safety and compliance.
- Financial control and actual profitability.
- Customer relationship management.
- Commercial acquisition and marketing.
- Competitive intelligence and continuous improvement.

"Number one worldwide" is an ambition, not a factual status or guaranteed outcome. It must be pursued through measurable benchmarks, real customer outcomes, reliability, safety, technical coverage, usability, performance and independently reproducible evidence.

ODG must never claim global leadership without comparative evidence.

---

# 2. FUNCTIONAL ARCHITECTURE — 15 INTEGRATED DOMAINS

These are functional domains, not new permanent primitives.

D01 — Technical Intelligence and Knowledge
D02 — Intelligent Devis and Estimation
D03 — Visual Intelligence: photos, videos, plans and documents
D04 — Métré, quantities and technical calculations
D05 — Normative and regulatory knowledge
D06 — Materials, supplier and price intelligence
D07 — Work preparation and planning
D08 — Field operations and voice-first chantier assistant
D09 — Workforce, skills and subcontractors
D10 — Fleet, equipment and machinery
D11 — Procurement, inventory and logistics
D12 — Quality, safety and compliance
D13 — Finance, billing and profitability
D14 — Customer, CRM and after-sales
D15 — Commercial intelligence, marketing and growth

All domains must reuse canonical client, supplier, employee, product, chantier, document, financial and organizational records.

No unnecessary duplicate database, service, authority or parallel primitive is permitted.

---

# 3. PRESERVATION — ORIGINAL 20 INTELLIGENT DEVIS FUNCTIONS

All 20 functions remain mandatory.

## A. Acquisition and creation

1. Devis from chantier photo.
2. Analysis of PDF or image plans.
3. Devis from voice description.
4. Assisted manual creation.

## B. Métré and costing

5. Automatic quantity surveying with human validation.
6. Material and quantity calculations.
7. Labour hours, skills and team calculations.
8. Equipment, machinery and transport calculations.
9. Supplier price consultation and tariff library.
10. Indirect costs and overhead calculations.
11. Configurable chantier margin.
12. VAT and special conditions.

## C. Commercial construction

13. Economic, standard and premium variants.
14. Options, exclusions and work not included.
15. Detection of omissions, inconsistencies, technical risks and underpricing.

## D. Lifecycle

16. PDF with company identity and logo.
17. Signature and acceptance.
18. Automatic follow-up for unanswered quotations.
19. Accepted quotation converted into chantier dossier.
20. Comparison of initial quotation, forecast budget and actual costs.

Each line must contain unit, quantity, unit price and amount.

Uncertain quantities must remain explicitly estimated until validated.

Supplier prices must retain source, date, unit, geographic scope and conditions.

Labour must use configured loaded labour cost.

Margin must remain distinct from markup.

VAT must be determined using applicable rules and validated before issue.

No quotation may be represented as final when critical information is missing.

---

# 4. VOICE-FIRST FIELD ASSISTANT

Create a fast, mobile-first assistant usable by company owners, managers and authorized workers.

Supported interaction modes:
- Voice.
- Text.
- Photo.
- Video.
- PDF.
- Plan.
- Mixed voice + photo.
- Offline capture with secure synchronization.

Language strategy:
- French.
- Moroccan Darija.
- Arabic.
- English.
- Additional languages according to verified demand.

Examples:
- "ODG, annule mon rendez-vous de demain."
- "Décale la visite à vendredi."
- "Nous avons terminé les fondations."
- "Ajoute six heures pour cette équipe."
- "Il manque quinze sacs de ciment."
- "Signale un retard de livraison."
- "Enregistre cette fissure."
- "Prépare un devis complémentaire."
- "Combien avons-nous dépensé aujourd'hui ?"
- "Prépare le rapport du chantier."
- "Ajoute cette livraison au stock."
- "Le véhicule est en panne."

ODG must identify the speaker's permissions, active chantier, intended action, target object and missing information.

Ambiguous actions require clarification.

External cancellations, notifications, orders, signatures, financial actions and legally significant operations require the appropriate permission and confirmation.

Never silently act on the wrong chantier, customer, employee or appointment.

Voice records must preserve transcript, timestamp, author, confidence, action and validation history.

Recording must respect applicable consent, privacy and data-protection requirements.

---

# 5. PHOTO, VIDEO AND MULTIMODAL INTELLIGENCE

ODG must progressively understand:

- Existing site conditions.
- Work areas and rooms.
- Walls, floors, ceilings and openings.
- Materials and visible equipment.
- Construction progress.
- Deliveries and quantities visible on documents.
- Defects and anomalies.
- Cracks, leaks and damage.
- Before/after differences.
- Safety observations.
- Installation progress.
- Work completed and work remaining.

Capabilities:
1. Image classification.
2. Document and plan extraction.
3. Visual comparison.
4. Object and work-area identification.
5. Annotated images.
6. Photo-to-task creation.
7. Photo-to-report generation.
8. Video-based progress documentation.
9. Evidence association with chantier and task.
10. Confidence and uncertainty reporting.

A normal photograph must never be treated as an exact dimensional measurement without a valid scale, calibrated capture, reference dimension or human measurement.

Critical structural, electrical, safety and compliance decisions require qualified human validation.

---

# 6. COMPLETE CHANTIER LIFECYCLE

ODG must manage the chantier from initial customer request to final profitability.

## Before work

- Customer request and qualification.
- Technical visit.
- Plans and photos.
- Measurements.
- Devis and variants.
- Acceptance.
- Initial budget.
- Planning and milestones.
- Team and equipment assignment.
- Material preparation.
- Supplier orders.
- Required documents and checks.

## Start

- Start date and initial state.
- Initial photos.
- Team presence.
- Material and equipment availability.
- Site readiness.
- Safety and prerequisite checks.

## Execution

- Task progress.
- Progress by zone.
- Hours worked.
- Materials consumed.
- Deliveries.
- Expenses.
- Photos and voice journal.
- Incidents and delays.
- Subcontracting.
- Variations and additional work.

## Control

- Planned versus actual quantities.
- Forecast versus actual costs.
- Quality inspections.
- Delay and risk detection.
- Budget and margin alerts.
- Forecast completion.
- Corrective action proposals.

## Closeout

- Work completion.
- Outstanding items and reservations.
- Corrections.
- Final photographs.
- Acceptance and handover.
- Final documents.
- Final invoicing and payments.
- Actual cost and profitability.
- Archiving and lessons learned.

The complete timeline must remain auditable and reconstructable.

---

# 7. NORMATIVE AND REGULATORY INTELLIGENCE

Build a versioned, source-backed, jurisdiction-aware knowledge system.

Priority scope:
- France.
- European Union.
- International standards.
- Additional countries according to market expansion.

Research and classify:
- NF and applicable French standards.
- NF DTU and professional rules.
- NF C 15-100 and electrical installation rules.
- Eurocodes and national annexes.
- Concrete and reinforcement standards.
- Masonry and structural execution.
- Thermal and acoustic insulation.
- Waterproofing and roofing.
- Plumbing and drainage.
- Heating, ventilation and air conditioning.
- Fire safety.
- Accessibility.
- Construction product regulation.
- Product declarations and conformity.
- BIM and ISO 19650.
- Environmental requirements.
- Waste management.
- Occupational safety and INRS guidance.
- Public works and infrastructure rules.

Each rule record must contain:
- Unique reference.
- Exact title.
- Jurisdiction.
- Applicable métier.
- Work and building scope.
- Edition and version.
- Publication date.
- Effective date.
- Withdrawal or replacement date if known.
- Official source.
- Legal or normative status.
- Applicability conditions.
- Exceptions.
- Related rules.
- Evidence and last verification date.

Classify each item:
- Binding legislation.
- Mandatory regulatory provision.
- Applicable contractual requirement.
- Published standard.
- Professional recommendation.
- Technical guidance.
- Draft or consultation document.

Never present a draft as an effective standard.

Do not reproduce protected or paid standards unlawfully. Use authorized access, lawful metadata and permitted summaries.

## Example: kitchen electrical outlets

ODG must understand the room, surface, layout, equipment and applicable version of the electrical rules.

For a kitchen, it must:
- Identify the applicable minimum socket requirements.
- Distinguish general-purpose outlets from dedicated appliance circuits.
- Check countertop placement and applicable exceptions.
- Identify circuit and protection requirements.
- Propose a plan layout.
- Calculate materials and labour.
- Cite the applicable source and version.
- Explain assumptions and request electrician validation when needed.

It must never hard-code a remembered number as universally valid.

## Version transition management

Research the official status and transition of second-generation Eurocodes.

Track CPR 2024/3110, harmonised technical specifications and product-family transition dates.

Track ISO 19650 published editions separately from drafts and revisions.

Every normative answer must be reproducible against the source version applicable to the chantier.

---

# 8. VISUAL MÉTRÉ AND TECHNICAL CALCULATION ENGINE

Develop progressive capabilities for:
- Floor and wall areas.
- Volumes.
- Lengths and perimeters.
- Openings and deductions.
- Concrete quantities.
- Reinforcement estimates.
- Excavation and earthworks.
- Tile, flooring and coating quantities.
- Paint and plaster.
- Insulation.
- Plumbing and electrical quantities.
- Waste and loss coefficients.
- Material packaging and rounding.
- Equipment and labour time.

Support:
- PDF plans.
- Raster images.
- Vector drawings where supported.
- CAD/BIM data where available.
- Scale and dimension extraction.
- Cross-checking between plan dimensions and annotations.
- Multiple plan versions.
- Measurement uncertainty and confidence.

Every calculated quantity must retain:
- Formula.
- Input dimensions.
- Units.
- Source.
- Assumptions.
- Rounding.
- Uncertainty.
- Validation status.

Never fabricate a dimension or silently resolve contradictory plan measurements.

---

# 9. TRADE KNOWLEDGE AND METHODS LIBRARY

Build knowledge for all existing ODG métiers, including:

- General construction and masonry.
- Foundations, concrete, reinforcement and formwork.
- Roofing and waterproofing.
- Facades and external insulation.
- Drywall, plastering and ceilings.
- Painting and finishing.
- Joinery and carpentry.
- Electrical work.
- Plumbing and sanitation.
- Heating and HVAC.
- Tiling and flooring.
- Resin and decorative concrete.
- Exterior landscaping and terraces.
- Earthworks and roads.
- Networks and utilities.
- Equipment and lifting.
- Maintenance and renovation.

For each métier:
- Work taxonomy.
- Execution stages.
- Materials.
- Units and quantity methods.
- Required tools and equipment.
- Competency requirements.
- Reference labour times.
- Applicable standards.
- Safety controls.
- Quality checkpoints.
- Frequent defects.
- Acceptance criteria.
- Cost model.
- Required evidence.

Do not assume every trade can be qualified to the same level. Report coverage and evidence separately for each métier.

---

# 10. PRICE, SUPPLIER AND PROCUREMENT INTELLIGENCE

Develop a reliable price and supply reference system.

Distinguish:
- Public catalogue price.
- Negotiated price.
- Actual purchase price.
- Discount and rebate.
- Delivery cost.
- Availability.
- Delivery lead time.
- Loaded labour cost.
- Equipment cost.
- Rental.
- Transport.
- Waste removal.
- Subcontracting.
- Overhead.
- Risk allowance.
- Margin.
- Markup.

Each price must retain:
- Supplier.
- Product reference.
- Description.
- Unit.
- Currency.
- Geographic scope.
- Price date.
- Validity period.
- Source evidence.
- Tax treatment.
- Delivery conditions.

Build supplier comparisons and procurement recommendations.

Never place real orders or commit funds without authorization.

Preserve accepted quotation prices historically even when supplier prices later change.

---

# 11. PLANNING, WORKFORCE, FLEET AND INVENTORY

Integrate:
- Resource availability.
- Worker skills and qualifications.
- Team composition.
- Workload.
- Hours and attendance.
- Absence and substitution.
- Subcontractors.
- Vehicle allocation.
- Equipment availability.
- Fuel and mileage.
- Maintenance and inspections.
- Stock levels.
- Reservations.
- Material consumption.
- Deliveries and discrepancies.

ODG must detect scheduling conflicts and propose feasible alternatives.

Sensitive employment, payroll and legal records must follow appropriate permissions and validation.

---

# 12. QUALITY, SAFETY AND COMPLIANCE

Build:
- Inspection checklists.
- Work-stage quality controls.
- Defect and non-conformity records.
- Photo evidence.
- Corrective actions.
- Safety observations.
- Incident records.
- Required document tracking.
- Insurance certificate tracking.
- Applicable décennale and RC Pro evidence.
- Subcontractor qualification checks.
- Waste and environmental records.
- Handover and reservations.

ODG must not replace qualified safety professionals, inspectors, engineers, insurers or legal advisers.

---

# 13. FINANCIAL INTELLIGENCE AND TRUE PROFITABILITY

Calculate by chantier, métier, customer, team and company:

- Initial quoted amount.
- Accepted amount.
- Forecast materials.
- Actual materials.
- Forecast labour.
- Actual labour.
- Equipment.
- Transport.
- Subcontracting.
- Overhead.
- Additional work.
- Invoiced amount.
- Collected amount.
- Unpaid invoices.
- Forecast margin.
- Actual margin.
- Cash impact.
- Variance explanations.

Distinguish revenue, gross margin, operating profit and net profit.

Never describe an estimated margin as realized profit.

Provide reproducible calculations and complete cost provenance.

---

# 14. CUSTOMER, CRM AND COMMERCIAL AUTONOMY

Build an integrated commercial engine:

1. Market segmentation.
2. Regional demand analysis.
3. Customer discovery.
4. Prospect qualification.
5. CRM and contact history.
6. Appointment management.
7. Technical visit preparation.
8. Devis conversion.
9. Follow-up.
10. Customer communication.
11. Contract and document tracking.
12. After-sales.
13. Customer satisfaction.
14. Repeat business.
15. Referral opportunities.

Commercial automation:
- Campaign preparation.
- Content generation.
- Landing pages.
- Marketing experiments.
- Lead scoring.
- Conversion analysis.
- Sales pipeline.
- Customer retention.
- Customer acquisition cost.
- Channel profitability.

ODG must distinguish lawful public business information from personal data and apply GDPR, French prospecting rules and consent requirements.

External messages, mass campaigns, contracts and financial commitments must respect permissions and approval thresholds.

---

# 15. PERMANENT RADAR — RESEARCH AND COMPETITIVE INTELLIGENCE

The Radar is a continuous improvement mechanism.

Research:
- Leading French BTP software.
- European construction platforms.
- Global construction management systems.
- BIM and digital twin systems.
- Visual inspection technology.
- AI quantity surveying.
- Computer vision.
- Voice interfaces.
- Mobile/offline construction applications.
- Procurement and supplier platforms.
- Project controls.
- Safety and quality technology.
- Construction finance and ERP.
- New regulations and standards.
- New materials and construction methods.

Initial competitor universe to investigate, not to assume superiority or feature parity:

France and Europe:
- Obat.
- Tolteck.
- Batappli.
- ProGBat.
- Vertuoza.
- Graneet.
- Alobees.
- Sage.
- EBP.
- Codial.
- PlanRadar.

International:
- Procore.
- Autodesk Construction Cloud.
- Oracle Aconex.
- Bentley Systems.
- Trimble.
- Fieldwire.
- Buildertrend.
- Raken.
- Bluebeam.
- Dalux.

For every competitor:
- Official product pages.
- Actual modules and workflows.
- Target customer.
- Pricing where public and current.
- Integrations.
- Mobile capabilities.
- Offline capabilities.
- AI capabilities.
- BIM and document support.
- Customer feedback and complaints.
- Strengths and weaknesses.
- Evidence date and source.
- Unverified claims explicitly labelled.

Do not copy protected software, proprietary code, branding or confidential information.

## Radar cycle

RESEARCH
→ SOURCE VERIFICATION
→ CAPABILITY EXTRACTION
→ COMPETITIVE COMPARISON
→ GAP ANALYSIS
→ CUSTOMER VALUE ASSESSMENT
→ PRIORITIZATION
→ AUTHORIZED MISSION PROPOSAL
→ ODG EXECUTION
→ TESTS
→ INDEPENDENT INSPECTION
→ EVIDENCE
→ CANONICAL UPDATE

The Radar must not invent missions or bypass the Boussole.

Every proposed improvement must state:
- Source.
- Evidence.
- User problem.
- Capability gap.
- Expected benefit.
- Cost and dependencies.
- Risk.
- Priority.
- Acceptance criteria.

---

# 16. RESEARCH SOURCE REGISTER

Use primary sources first and record source dates.

Official research starting points:

France:
- https://www.afnor.org/
- https://www.cstb.fr/
- https://www.legifrance.gouv.fr/
- https://www.inrs.fr/
- https://www.promotelec.com/
- https://www.impots.gouv.fr/
- https://www.economie.gouv.fr/

European Union:
- https://single-market-economy.ec.europa.eu/
- https://eur-lex.europa.eu/
- https://eurocodes.jrc.ec.europa.eu/
- https://energy.ec.europa.eu/
- https://ec.europa.eu/

International:
- https://www.iso.org/
- https://www.cencenelec.eu/
- https://www.buildingsmart.org/

Research priorities:
- Construction Products Regulation (EU) 2024/3110 and implementation.
- Eurocodes second-generation transition and national annexes.
- ISO 19650 and BIM information management.
- Applicable NF DTU and electrical requirements.
- French construction safety and prevention.
- French electronic invoicing timetable and accredited platform ecosystem.
- Construction product declarations, conformity and digital product information.
- Digital construction, AI, robotics, photogrammetry and computer vision.

Source pages are starting points, not proof that every referenced rule is applicable.

---

# 17. GLOBAL TECHNICAL ARCHITECTURE

All capabilities must be integrated into existing canonical architecture.

Requirements:
- One reliable identity and permission model.
- One traceable mission lifecycle.
- Canonical state and contracts.
- Deterministic calculation core.
- Versioned normative knowledge.
- Source-backed external information.
- Evidence-linked decisions.
- Reproducible execution.
- Safe recovery.
- Resource and quota optimization.
- Context minimization.
- Reuse of valid checkpoints.
- No unnecessary repeated tests.
- Cost and performance measurement.

Preserve the nine primitives exactly.

Do not create a tenth primitive, shadow authority, parallel scheduler, duplicate truth system or unapproved external service.

---

# 18. AUTONOMY MATURITY MODEL

A0 — Observe and retrieve.
A1 — Analyze, calculate and explain.
A2 — Prepare actions and request approval.
A3 — Execute authorized, reversible operations.
A4 — Coordinate multiple modules under policy.
A5 — Optimize continuously within explicit boundaries.

Each capability must have:
- Declared autonomy level.
- Permissions.
- Preconditions.
- Reversibility.
- Risk classification.
- Human approval requirements.
- Audit trail.
- Failure recovery.
- Test evidence.

Autonomy is earned through measured reliability, not assumed from the specification.

---

# 19. MASTER IMPLEMENTATION ROADMAP

PHASE 0 — Canonical audit and preservation
- Locate the actual Boussole V12.4 and current roadmap.
- Inspect repository state and accepted work.
- Map existing BTP modules, tests, contracts and evidence.
- Identify duplicates, missing capabilities and blockers.
- Preserve all valid work.
- Produce the source-of-truth integration plan.

GATE 0: Complete evidence-backed inventory.

PHASE 1 — Normative and technical knowledge
- Build source registry.
- Build versioned rule model.
- Research French and EU requirements.
- Add métier knowledge structures.
- Test applicability, dates and source traceability.

GATE 1: Rules are versioned, sourced and correctly scoped.

PHASE 2 — Intelligent devis and metré
- Qualify all 20 original functions.
- Integrate visual and plan extraction.
- Validate quantity calculations.
- Integrate supplier and labour prices.
- Test variants, margins, VAT and uncertainty.

GATE 2: Reproducible estimates with human validation.

PHASE 3 — Visual and voice field intelligence
- Voice capture.
- Multilingual interpretation.
- Photo and video evidence.
- Voice/photo event creation.
- Offline capture and synchronization.
- Appointment and task actions.
- Permissions and confirmation.

GATE 3: End-to-end field scenarios pass.

PHASE 4 — Full chantier lifecycle
- Planning.
- Workforce.
- Materials.
- Equipment.
- Progress.
- Quality and safety.
- Cost control.
- Handover and final profitability.

GATE 4: Complete lifecycle is reproducible.

PHASE 5 — Métier excellence
- Develop métier libraries.
- Benchmark each métier.
- Test technical calculations.
- Test methods, resources and quality controls.

GATE 5: Measured métier coverage.

PHASE 6 — Competitive Radar
- Benchmark the competitor universe.
- Research new standards and technologies.
- Produce evidence-backed gap reports.
- Propose authorized improvement missions.

GATE 6: Repeatable research-to-development cycle.

PHASE 7 — Commercial autonomy
- Market intelligence.
- CRM and prospecting.
- Marketing experiments.
- Sales pipeline.
- Conversion and retention.
- CAC and channel profitability.

GATE 7: Verified commercial workflows.

PHASE 8 — Global qualification
- Integration tests.
- Security tests.
- Performance tests.
- Reliability and recovery tests.
- Independent inspection.
- Evidence review.
- Final acceptance.

GATE 8: Operational acceptance based on reproducible proof.

Phases may be subdivided into coherent work lots according to the canonical ODG mission system. Dependencies and one-active-work-item constraints must be respected where applicable.

---

# 20. TEST AND BENCHMARK PROGRAMME

Build synthetic and reference datasets when real customer data is unavailable.

Test at least:
- All 20 Devis functions.
- Photo-to-devis.
- Plan-to-métré.
- Voice-to-devis.
- Kitchen electrical layout scenario.
- Conflicting plan dimensions.
- Uncertain photo measurements.
- Supplier price changes.
- VAT and special conditions.
- Margin versus markup.
- Labour cost.
- Economic, standard and premium variants.
- Missing work detection.
- Appointment cancellation ambiguity.
- Appointment rescheduling.
- Voice/photo delivery registration.
- Work-stage completion.
- Daily site report.
- Offline synchronization.
- Duplicate event handling.
- Wrong-site identification.
- Worker permission restrictions.
- Budget overrun.
- Negative margin.
- Additional work authorization.
- Handover and reservations.
- Final invoice.
- Forecast versus actual profitability.
- Full lifecycle from customer request to closeout.

For each test preserve:
- Test identifier.
- Scenario.
- Input data.
- Expected result.
- Actual result.
- Acceptance threshold.
- Evidence.
- Reproduction instructions.
- Validator.
- Status.

Do not inflate benchmark results by counting documentation-only demos as operational tests.

---

# 21. MEASUREMENT AND WORLD-CLASS SCORECARD

Measure:
- Devis calculation accuracy.
- Métré error against trusted reference.
- Normative source correctness.
- Visual recognition quality.
- Voice intent accuracy.
- Wrong-action rate.
- Synchronization reliability.
- Data completeness.
- Planning accuracy.
- Actual cost variance.
- Margin prediction accuracy.
- Quality defect detection.
- Security and permission violations.
- Recovery success.
- Performance and latency.
- Resource consumption.
- Cost per operation.
- Customer acquisition cost.
- Conversion rate.
- Customer retention.
- Customer satisfaction.
- Competitive capability coverage.

No invented scores.

Every benchmark must state its dataset, scope, sample size, methodology, date and limitations.

---

# 22. REQUIRED CANONICAL INTEGRATION PROCEDURE

ODG must perform the following only after inspecting the actual repository and canonical references:

1. Locate Boussole V12.4 and its current extension mechanism.
2. Determine the correct canonical integration location.
3. Compare this roadmap against existing V12.4 content.
4. Preserve every existing requirement.
5. Identify overlap and reference existing capabilities instead of duplicating them.
6. Add the BTP programme as a cumulative extension.
7. Link its phases, gates, dependencies and acceptance criteria to existing canonical governance.
8. Preserve exactly nine primitives.
9. Preserve the 166 capability reference and A01–A54 architectural contract relationships where applicable; do not fabricate mappings.
10. Update canonical registers only through authorized mechanisms.
11. Record source revision, timestamp, change summary and evidence.
12. Validate consistency with existing tests and contracts.
13. Produce an auditable integration report.

If the canonical structure cannot be safely identified, STOP the integration mutation and produce an evidence-backed blocker. Do not guess file names, schema fields or authority mechanisms.

---

# 23. ODG EXECUTION AND VALIDATION CONTRACT

ODG must remain responsible for the complete engineering workflow:

- Read the roadmap.
- Compare it with Boussole.
- Select authorized missions.
- Plan dependencies.
- Execute available native capabilities.
- Delegate bounded technical subtasks to providers only when needed.
- Inspect provider output.
- Review diffs.
- Run tests.
- Verify contracts.
- Inspect security and permissions.
- Validate evidence.
- Accept or reject results.
- Record decisions.
- Update canonical status.

Claude Code may provide technical implementation assistance but cannot:
- Declare its own output accepted.
- Override ODG decisions.
- Create unauthorized missions.
- Change canonical authority.
- Bypass Truth Lock.
- Mark unverified features as operational.

ODG must use independent validation mechanisms where available. If a provider generated the implementation, the acceptance process must not rely solely on the provider's own assertions.

---

# 24. RESOURCE EFFICIENCY

Apply the canonical resource-economy policy:

- Use the smallest useful context.
- Reuse valid proofs and checkpoints.
- Avoid repeated audits without a reason.
- Avoid duplicate tests when evidence remains valid.
- Run targeted tests before broad suites where appropriate.
- Measure runtime, tokens, memory and provider cost.
- Prefer local deterministic execution.
- Avoid paid calls unless explicitly authorized.
- Preserve evidence needed for later validation.

Efficiency must not weaken quality or safety gates.

---

# 25. REQUIRED DELIVERABLES

ODG must maintain:

1. BTP capability inventory.
2. Canonical V12.4 integration record.
3. Requirement-to-code traceability matrix.
4. Normative source registry.
5. Versioned métier knowledge library.
6. Competitor benchmark database.
7. Radar findings and evidence.
8. Devis and metré benchmark suite.
9. Voice/photo/video benchmark suite.
10. Chantier lifecycle test suite.
11. Financial calculation test suite.
12. Security and permission test results.
13. Autonomy maturity matrix.
14. Performance and resource report.
15. Independent inspection report.
16. Unresolved blocker register.
17. Final acceptance report.

---

# 26. DEFINITION OF DONE

A capability is operational only when:
- Implemented in the authorized source.
- Integrated with canonical contracts.
- Tested against meaningful scenarios.
- Errors and edge cases examined.
- Permissions validated.
- Evidence reproducible.
- Independent ODG inspection completed.
- Acceptance recorded.

A document, mockup, demonstration or generated example is not proof of operational capability.

The global programme is not complete until all mandatory gates are satisfied or explicitly recorded as blocked with evidence.

---

# 27. FIRST REQUIRED ACTION AFTER ROADMAP REGISTRATION

ODG must NOT blindly begin mass implementation.

First:
- Recover the current source of truth.
- Read the latest user-provided execution report and current repository state.
- Identify the currently running or completed mission.
- Avoid interrupting active work.
- Reconcile the roadmap with the latest V12.4.
- Identify already implemented and accepted capabilities.
- Identify missing and partially implemented capabilities.
- Establish the next authorized work package.
- Produce a concise CTO status report with exact evidence.

The roadmap is persistent and cumulative. Future execution must resume from the verified current state, not restart completed work.

---

# FINAL DIRECTIVE

ODG BTP must evolve toward a world-class integrated construction intelligence and operating system.

It must understand the work, know the applicable rules, analyze plans and images, calculate quantities and prices, prepare quotations, coordinate people and equipment, listen to field workers, follow the chantier, detect risk, control quality, manage finances, measure actual profit and develop the business.

The Radar must continuously research the world, identify what the best systems do, detect what ODG lacks and propose evidence-backed improvements.

ODG owns the work and validates the code.

Claude Code remains a technical provider only.

Preserve V12.4, exactly nine permanent primitives, Truth Lock and all accepted work.

No feature is operational without evidence.

**END OF MASTER ROADMAP**
