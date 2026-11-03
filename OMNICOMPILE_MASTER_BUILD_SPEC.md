# OmniCompile Core — Master Build Specification

## Distributed Resource-Aware Compiler for Hardware-Adaptive Optimization

**Document Type:** Senior Software Architect → Engineering Team Handoff
**Status:** Authoritative Build Specification
**System Name:** OmniCompile Core
**Primary Objective:** Build a functioning distributed, resource-aware, hardware-adaptive compilation and optimization platform supporting C, Python, and Java.

---

# 1. EXECUTIVE SUMMARY

OmniCompile Core is a distributed compiler and optimization platform in which available computing devices can voluntarily join a controlled distributed computing environment as worker nodes.

The system consists of:

1. An **Admin/Coordinator environment** responsible for creating and managing the distributed computing network.
2. **Worker Nodes** that join the network exclusively through an administrator-generated participation link and execute assigned compiler/optimization workloads.
3. A **Compilation User interface** through which users submit source code in C, Python, or Java and receive the appropriate compiled/optimized output.
4. A **resource-aware distributed scheduler** that assigns computational workloads to appropriate heterogeneous worker nodes based on node capabilities and current resource conditions.
5. A **performance/evaluation layer** that aggregates distributed results and supports adaptive optimization decisions.

The system combines:

Language-specific compiler pipelines
Language-specific analysis
Language-specific intermediate representations
Language-specific optimization passes
Language-specific distributed optimization
Resource-aware task scheduling
Heterogeneous worker nodes
Adaptive workload distribution
Result aggregation
Language-specific code generation/output generation

The three languages are not merely alternative frontends to one common compiler pipeline.

Each language has its own complete processing pipeline.

The shared portion of the architecture is primarily the distributed computing infrastructure and orchestration layer.

The fundamental architecture is:

                         OmniCompile Core
                              │
                    Language Selection
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        C Pipeline       Python Pipeline    Java Pipeline
             │                │                │
             │                │                │
       C-specific         Python-specific   Java-specific
       compilation        compilation       compilation
             │                │                │
       C-specific         Python-specific   Java-specific
       optimization       optimization      optimization
             │                │                │
             ▼                ▼                ▼
       Distributed        Distributed       Distributed
       C Optimization     Python            Java
                          Optimization      Optimization
             │                │                │
             └────────────────┼────────────────┘
                              │
                    Shared Distributed
                    Infrastructure
                              │
                  Resource-aware scheduling
                              │
                     Heterogeneous nodes

Therefore:

OmniCompile Core is one distributed compiler platform containing three distinct language-specific compiler and distributed-optimization pipelines.

The central technical idea is:

> OmniCompile Core does not merely distribute compilation jobs across computers. It uses the current capabilities and resource state of heterogeneous computing nodes to make resource-aware decisions about where compiler analysis and optimization workloads should execute.

The distributed system is entered through an explicit node-participation link.

A peer device does **not** become a worker node merely because it is connected to the same network.

The required lifecycle is:

**Admin creates node link → Peer opens link → Peer explicitly accepts participation → Worker registration → Node authentication/session establishment → Node information collection → Node appears in Admin Dashboard → Node becomes available for scheduling.**

Separately:

**User selects language → Uploads/pastes source code → Compiler analyzes source → Intermediate representation → Optimization tasks → Resource-aware distribution → Worker computation → Result aggregation → Adaptive evaluation → Language-appropriate output generation → Result displayed → Output downloaded.**

---

# 2. CORE PROJECT DEFINITION

## 2.1 Primary Project Title

**OmniCompile Core: A Distributed Resource-Aware Compiler for Hardware-Adaptive Optimization**

---

# 3. NON-NEGOTIABLE ARCHITECTURAL PRINCIPLES

The following requirements are fixed.

## 3.1 Distributed-system entry point

The **administrator-generated participation link is the gateway to the distributed worker network**.

A device cannot become a worker node without going through the node joining process.

Required sequence:

1. Admin starts coordinator.
2. Admin creates distributed node session.
3. System generates unique participation link/token.
4. Admin shares link.
5. Peer opens link.
6. Peer is shown node-participation information.
7. Peer explicitly accepts.
8. Worker connection/agent is established.
9. Coordinator registers the device as a worker node.
10. Node receives a unique Node ID.
11. Node information becomes visible to Admin Dashboard.
12. Node becomes part of the scheduling pool.

## 3.2 Node and User roles are separate

There are two distinct roles:

### Compilation User

A user submits source code for compilation and receives output.

Capabilities:

* Select language.
* Upload source file.
* Paste source code.
* Submit compilation.
* Monitor compilation status.
* View results.
* View relevant performance information.
* Download generated output.

### Worker Node

A node contributes computational resources.

Capabilities:

* Join through node link.
* Accept participation.
* Register with coordinator.
* Report required resource information.
* Maintain heartbeat.
* Receive authorized tasks.
* Execute assigned computation.
* Return results.
* Report task status.

A device enrolled as a worker node must not simultaneously be treated as a normal compilation user.

The system must maintain explicit role separation.

Shared infrastructure

The following infrastructure is shared across all languages:

Coordinator
Distributed session
Node participation link
Worker registration
Node registry
Resource monitoring
Heartbeat
Worker communication
Task management infrastructure
Resource-aware scheduler infrastructure
Result management
Job management
Performance monitoring
Admin dashboard
Authentication/session infrastructure
Storage infrastructure
Language-specific infrastructure

Each supported language has its own:

Lexer/parser or equivalent parser
Syntax analysis
Semantic analysis
Language-specific IR
Language-specific optimization passes
Optimization task decomposition
Language-specific distributed optimization workflow
Language-specific result interpretation
Code generation/output generation
Language-specific compilation validation

This distinction MUST be preserved.

5. NON-NEGOTIABLE REQUIREMENT: THREE COMPLETE PIPELINES

OmniCompile Core MUST contain three independent compiler/optimization pipelines:

Pipeline 1

C Compilation + Distributed C Optimization

Pipeline 2

Python Compilation + Distributed Python Optimization

Pipeline 3

Java Compilation + Distributed Java Optimization

The user selects the language before submitting source code.

The selected language determines the complete pipeline.

The system MUST NOT simply perform:

Any Language
→ Common IR
→ Common Optimizer
→ Common Code Generator

as the primary architecture.

Instead:

C
→ C Compiler Pipeline
→ C Optimization
→ Distributed C Optimization
→ C Output

Python
→ Python Compiler Pipeline
→ Python Optimization
→ Distributed Python Optimization
→ Python Output

Java
→ Java Compiler Pipeline
→ Java Optimization
→ Distributed Java Optimization
→ Java Output

---

# 4. HIGH-LEVEL SYSTEM OBJECTIVES

OmniCompile Core must:

1. Provide a coordinator-controlled distributed computing environment.
2. Allow peers to become worker nodes through an explicit link-based enrollment process.
3. Display connected nodes and their relevant resource information to the administrator.
4. Continuously monitor node availability.
5. Maintain node heartbeat/status.
6. Support heterogeneous computing resources.
7. Accept C, Python, and Java source code.
8. Allow language selection before compilation.
9. Accept both uploaded files and pasted source text.
10. Parse/analyze source using the appropriate language pipeline.
11. Produce an intermediate representation or equivalent internal compilation representation.
12. Create optimization workloads.
13. Distribute suitable workloads across available nodes.
14. Select nodes based on capability and current resource state.
15. Execute workloads on worker nodes.
16. Collect distributed results.
17. Evaluate results using measurable performance parameters.
18. Support adaptive optimization/scheduling decisions.
19. Generate language-appropriate output.
20. Present compilation and performance results to the user.
21. Allow the user to download the resulting artifact.
22. Handle worker failure and task reassignment.
23. Maintain a clear distinction between administrator, worker node, and compilation user.

---

# 5. SYSTEM ACTORS

## 5.1 Administrator

The administrator controls the distributed environment.

Responsibilities:

* Start/stop coordinator.
* Create distributed node session.
* Generate node participation link.
* Share node link.
* Monitor nodes.
* View node status.
* View resource status.
* View task status.
* Monitor distributed jobs.
* View worker failures.
* Monitor completed tasks.
* Manage active node sessions.

The administrator is not required to manually assign every compiler task.

The scheduler performs resource-aware task assignment.

---

## 5.2 Peer / Worker

A peer becomes a worker only after explicitly joining through the generated link.

Responsibilities:

* Open participation link.
* Review participation information.
* Accept node participation.
* Establish worker connection.
* Run worker agent.
* Report resource information.
* Maintain heartbeat.
* Execute authorized tasks.
* Return computation results.

The worker should not need to manually understand the internal compiler architecture.

---

## 5.3 Compilation User

The user interacts with the compilation interface.

Responsibilities:

* Select language.
* Submit source.
* Start compilation.
* Monitor job.
* View results.
* Download output.

The user does not need to know which worker node processes their optimization tasks.

---

# 6. TWO MAJOR SYSTEM MODULES

The system is conceptually divided into exactly two major modules.

# MODULE 1 — HETEROGENEOUS NODE & RESOURCE INTELLIGENCE

Purpose:

Create and manage the distributed computational environment and maintain a live understanding of available worker resources.

Major components:

* Coordinator
* Node Session Manager
* Node Link Generator
* Peer Join Interface
* Worker Agent
* Node Registration
* Node Authentication/Session Validation
* Node Registry
* Resource Profiler
* Heartbeat Service
* Node Status Manager
* Admin Dashboard

Primary responsibilities:

* Generate participation link.
* Register accepted nodes.
* Generate Node IDs.
* Maintain node lifecycle.
* Collect required resource information.
* Monitor availability.
* Maintain heartbeat.
* Detect inactive nodes.
* Maintain scheduling capability information.

Expected outputs:

* Node availability.
* Node resource profile.
* Node capability information.
* Node status.
* Current task state.
* Heartbeat state.
* Scheduling eligibility.

---

# MODULE 2 — DISTRIBUTED ADAPTIVE COMPILATION & OPTIMIZATION

Purpose:

Process submitted source code, create compiler workloads, distribute appropriate workloads to heterogeneous nodes, evaluate results, and produce the final language-appropriate output.

Major components:

* Language Selection
* Source Input Handler
* Language Frontends
* Lexical/Syntax/Semantic Analysis
* Intermediate Representation
* Optimization Analyzer
* Task Decomposer
* Resource-Aware Scheduler
* Distributed Task Manager
* Worker Execution Engine
* Result Aggregator
* Optimization Evaluator
* Adaptive Decision Engine
* Code Generation
* Linking/Packaging
* Output Manager

Expected outputs:

* Compilation result.
* Optimized intermediate representation.
* Performance measurements.
* Language-appropriate output artifact.
* Compilation report.

---

# 7. ADMIN WORKFLOW — COMPLETE

## 7.1 Start system

Administrator launches OmniCompile Core.

Coordinator initializes.

Initial dashboard:

* Coordinator: Online
* Distributed Session: Not Created
* Connected Nodes: 0
* Available Nodes: 0
* Running Tasks: 0
* Completed Tasks: 0

---

## 7.2 Create distributed session

Admin selects:

**Create Distributed Node Network**

System creates a distributed session.

The session must receive a unique identifier.

Example conceptual values:

```text
Session ID: SESSION-2026-001
Status: Active
Coordinator: Online
```

---

## 7.3 Generate node participation link

System generates a unique participation URL/token.

Example:

```text
https://<coordinator>/join/<session-token>
```

The exact URL structure is implementation-defined.

The link must identify the active distributed session.

The link is specifically a **worker enrollment link**, not a normal compilation-user link.

---

## 7.4 Share link

Administrator can copy/share the link with authorized peers.

The system does not automatically register anyone merely because they receive the link.

---

# 8. PEER NODE JOIN WORKFLOW

## 8.1 Peer opens link

Peer opens the participation link.

The system displays:

* Distributed system name.
* Session information.
* Purpose.
* Node responsibilities.
* Information collected.
* Participation implications.
* Accept button.
* Decline button.

---

## 8.2 Peer accepts

Peer explicitly chooses:

**Join as Worker Node**

This is the authorization point.

No node registration should occur before acceptance.

---

## 8.3 Worker establishment

The worker environment establishes a connection to the coordinator.

Depending on implementation, this may use:

* WebSocket
* HTTP
* TCP
* secure session channel

The exact communication technology may be selected by the engineering team.

The architectural requirement is persistent, reliable coordinator-worker communication.

---

## 8.4 Node registration

Coordinator creates:

```text
Node ID
Session ID
Role = WORKER
Status = ONLINE/CONNECTING
```

The node is associated with the current distributed session.

---

# 9. NODE INFORMATION

The system should collect only information necessary for distributed computation and monitoring.

Node record may include:

## Identity

* Node ID
* Session ID
* Worker role
* Registration timestamp
* Connection state

## Resource/capability information

* CPU capability
* CPU availability/utilization
* Memory availability/utilization
* Processing capacity
* Supported compiler/runtime capabilities
* Current workload

## Runtime information

* Online/offline state
* Last heartbeat
* Current task
* Task state
* Last completed task
* Error state

Avoid unnecessary personal information.

Do not make unrelated personal information a requirement.

---

# 10. ADMIN DASHBOARD

The dashboard must make the distributed environment observable.

At minimum, display:

## System

* Coordinator status
* Active distributed session
* Total nodes
* Online nodes
* Available nodes
* Busy nodes
* Offline nodes
* Running jobs
* Completed jobs

## Node table

For each node:

* Node ID
* Status
* CPU/resource state
* Memory/resource state
* Capability state
* Current task
* Task status
* Last heartbeat
* Availability

## Task monitoring

Display:

* Job ID
* Task ID
* Task type
* Assigned node
* Status
* Start time
* Completion time
* Error state

---

# 11. HEARTBEAT AND NODE LIFECYCLE

Worker nodes must periodically communicate with the coordinator.

Conceptual lifecycle:

**REGISTERING → ONLINE → AVAILABLE → BUSY → AVAILABLE → OFFLINE**

A worker may transition to:

**ONLINE → HEARTBEAT LOST → UNAVAILABLE**

The coordinator must detect stale/inactive nodes.

If a node becomes unavailable while processing a task:

1. Mark node unavailable.
2. Mark task as interrupted/failed.
3. Determine whether task is recoverable.
4. Requeue/reassign task where appropriate.
5. Select another eligible node.
6. Continue the compilation job.

The implementation must not assume every node remains connected for the entire lifetime of a compilation job.

---

# 12. NODE CAPABILITY MODEL

Node selection must consider more than raw CPU availability.

Each worker should expose capabilities relevant to supported workloads.

Examples:

```text
CPU capability
Memory capability
Current CPU load
Current memory load
C toolchain availability
Python runtime availability
Java runtime availability
Worker availability
```

The exact profiling implementation is flexible.

The scheduler must be able to answer:

> Can this node execute this workload?

and:

> Is this node currently suitable for this workload?

---

# 13. USER WORKFLOW — COMPLETE

## 13.1 Open compilation interface

A normal compilation user opens the OmniCompile Core compilation interface.

The user is not entering the node enrollment workflow.

---

## 13.2 Select programming language

The user must select one:

* C
* Python
* Java

The selection determines the language-specific compilation pipeline.

---

## 13.3 Input source

Two input methods are required:

### Method A — File upload

Examples:

```text
program.c
program.py
Program.java
```

### Method B — Source text

User pastes source code into the editor.

The backend receives the source and the explicitly selected language.

---

## 13.4 Input validation

System validates:

* Source availability.
* Selected language.
* Supported file type.
* Basic input integrity.
* Compilation job validity.

The system must not silently interpret a file as another language.

---

# 14. LANGUAGE-SPECIFIC COMPILATION ARCHITECTURE

The system must support three languages while maintaining a common distributed optimization framework.

The architecture is:

```text
Language Selection
       ↓
Language-Specific Frontend
       ↓
Language-Specific Analysis
       ↓
Common/Compatible Intermediate Representation
       ↓
Optimization
       ↓
Distributed Resource-Aware Execution
       ↓
Language-Specific Output Generation
```

Do not build three completely unrelated applications.

The distributed coordination, scheduling, monitoring, result aggregation, and adaptive infrastructure should be shared.

---

# 15. C PIPELINE

For C:

```text
Source
→ Lexical Analysis
→ Syntax Analysis
→ Semantic Analysis
→ Intermediate Representation
→ Optimization Analysis
→ Distributed Optimization
→ Result Aggregation
→ Adaptive Evaluation
→ Code Generation
→ Object Code
→ Linking
→ Native Executable
```

Example output:

```text
program.exe
```

or an appropriate native executable for the target operating system.

---

# 16. PYTHON PIPELINE

Python must not be falsely represented as a traditional native compiler pipeline.

Recommended conceptual pipeline:

```text
Python Source
→ Parsing
→ Syntax/Semantic/Static Analysis
→ Intermediate Representation / Bytecode Representation
→ Optimization
→ Distributed Analysis/Optimization
→ Result Aggregation
→ Optimized Python/Bytecode Artifact
→ Optional Packaging
```

Possible output:

```text
program_optimized.py
```

or a bytecode/package artifact.

If a standalone executable is implemented, it should be treated as a packaging/deployment stage rather than claiming Python is compiled identically to C.

The engineering team may choose the exact Python compilation/runtime technology, provided the architectural behavior remains consistent.

---

# 17. JAVA PIPELINE

For Java:

```text
Java Source
→ Lexical Analysis
→ Syntax Analysis
→ Semantic/Type Analysis
→ Intermediate Representation
→ Distributed Optimization
→ Result Aggregation
→ Adaptive Evaluation
→ JVM Bytecode Generation
→ .class / .jar
```

Example output:

```text
Program.class
```

or:

```text
Program.jar
```

---

# 18. COMPILATION JOB CREATION

Every user submission becomes a logical compilation job.

Example:

```text
Job ID: JOB-1024
Language: C
Input: program.c
Status: QUEUED
```

Job lifecycle:

```text
SUBMITTED
→ VALIDATING
→ ANALYZING
→ IR_GENERATED
→ OPTIMIZATION_PENDING
→ DISTRIBUTING
→ EXECUTING
→ AGGREGATING
→ EVALUATING
→ CODE_GENERATING
→ COMPLETED
```

Failure states must be represented explicitly.

---

# 19. INTERMEDIATE REPRESENTATION

The compiler must not distribute arbitrary fragments of raw source code merely because the system is distributed.

The preferred architecture is:

**Source → Language Frontend → Structured IR → Optimization Workloads**

The IR acts as the common boundary between language-specific frontends and the distributed optimization layer.

The exact IR technology may be:

* custom IR
* LLVM-based IR where appropriate
* language-specific intermediate representation
* another well-supported compiler representation

The engineering team may choose based on implementation feasibility.

The architecture must preserve language-specific correctness.

---

# 20. OPTIMIZATION ANALYSIS

The compiler analyzes the IR for supported optimization opportunities.

Potential optimization classes include:

* Constant propagation
* Constant folding
* Dead-code elimination
* Common-subexpression elimination
* Control-flow analysis
* Data-flow analysis
* Loop optimization
* Instruction-level optimization
* Register-related optimization
* Other appropriate compiler optimization passes

The engineering team should implement a realistic subset first and expand only after the core pipeline is stable.

Do not create artificial optimization tasks merely to demonstrate distribution.

---

# 21. DISTRIBUTED TASK DECOMPOSITION

Optimization work is decomposed into computational tasks where technically appropriate.

Example:

```text
JOB-1024

TASK-01 → Analysis A
TASK-02 → Analysis B
TASK-03 → Optimization C
TASK-04 → Optimization D
```

Each task should contain enough metadata for reliable execution.

Suggested metadata:

* Job ID
* Task ID
* Language
* Optimization type
* Required capability
* Input representation/reference
* Priority
* Dependency information
* Status
* Assigned Node ID
* Attempt number
* Result reference

---

# 22. RESOURCE-AWARE SCHEDULING

The scheduler is a central feature of OmniCompile Core.

It must consider:

1. Node capability.
2. Current resource availability.
3. Current node load.
4. Task requirements.
5. Language/runtime/toolchain availability.
6. Node availability.
7. Existing task assignments.
8. Failure/unavailability state.

The scheduler should not simply use round-robin allocation.

Conceptual decision:

```text
Task requirement
        ↓
Eligible nodes
        ↓
Capability filtering
        ↓
Current resource filtering
        ↓
Load evaluation
        ↓
Node selection
        ↓
Task assignment
```

The exact scheduling algorithm may be selected by the engineering team.

Possible implementation approaches include:

* Weighted resource score
* Capability-aware priority queue
* Load-aware scheduling
* Dynamic task allocation
* Resource suitability scoring

Do not expose an arbitrary "AI scheduler" unless an actual technically justified algorithm is implemented.

---

# 23. EXAMPLE NODE SELECTION

Suppose:

```text
NODE-001
CPU: High availability
Memory: Medium
Java: Available
Status: Idle

NODE-002
CPU: Medium availability
Memory: High
Java: Available
Status: Busy

NODE-003
CPU: High availability
Memory: High
Java: Not available
Status: Idle
```

For a Java optimization task:

NODE-003 is not eligible because the required capability is unavailable.

NODE-002 may be eligible but is currently busy.

NODE-001 is eligible and available.

The scheduler can therefore select NODE-001.

This demonstrates:

**Capability-aware + resource-aware + state-aware scheduling.**

---

# 24. WORKER TASK EXECUTION

When a node receives a task:

1. Worker validates task.
2. Worker checks required capability.
3. Worker accepts task.
4. Worker changes task state to RUNNING.
5. Worker executes compiler/optimization operation.
6. Worker collects result and performance metrics.
7. Worker sends result to coordinator.
8. Worker changes state to AVAILABLE.

Worker must not directly make global scheduling decisions.

The coordinator remains the orchestration authority.

---

# 25. RESULT AGGREGATION

The coordinator receives results from workers.

Each result must be associated with:

* Job ID
* Task ID
* Node ID
* Attempt number
* Status
* Result payload/reference
* Execution duration
* Resource measurements
* Error information

The aggregator reconstructs the logical optimization process.

---

# 26. PERFORMANCE EVALUATION

OmniCompile Core must measure meaningful parameters.

Recommended primary parameters:

* Compilation Time
* Optimization Time
* Execution Time
* Task Completion Rate
* Throughput
* Parallel Efficiency
* CPU Utilization
* Memory Utilization
* Resource Utilization Efficiency
* Optimization Gain
* Task Scheduling Time
* Node Load Balance
* Node Failure Recovery
* Dynamic Task Reallocation

The final academic evaluation can select approximately 6–8 primary parameters.

Do not fabricate performance values.

Measurements must come from actual system execution.

---

# 27. ADAPTIVE DECISION ENGINE

The system should use measured execution information to influence future scheduling/optimization decisions.

Core concept:

```text
Workload
+
Node Resources
+
Optimization Strategy
+
Observed Performance
        ↓
Adaptive Decision
```

The adaptive layer may learn or maintain historical performance information such as:

* Task type vs node capability.
* Task duration.
* Resource usage.
* Successful execution.
* Scheduling performance.

This information can be used to improve subsequent node selection.

The project does not require a machine-learning model unless one is later justified.

The core adaptive behavior should work using measurable performance feedback.

---

# 28. OUTPUT GENERATION

The final output depends on selected language.

## C

Output:

* Native executable and/or relevant compiled artifact.

Example:

```text
program.exe
```

## Python

Output:

* Optimized Python source, bytecode, package, or optionally packaged executable.

Example:

```text
program_optimized.py
```

## Java

Output:

* `.class` or `.jar`.

Example:

```text
Program.jar
```

The system must clearly label the output type.

---

# 29. USER RESULT PAGE

After completion, display:

* Job ID
* Selected language
* Input filename
* Compilation status
* Optimization status
* Number of nodes used
* Number of tasks
* Completed tasks
* Failed/reassigned tasks
* Compilation time
* Optimization time
* Relevant resource metrics
* Output type
* Download action

Example:

```text
Compilation Completed

Language: C
Input: program.c

Status: SUCCESS

Nodes Used: 3
Tasks Completed: 4/4

Compilation Time: 1.84 s
Optimization Time: 0.72 s

Output Type: Native Executable
Output: program.exe

[Download Output]
```

---

# 30. USER DOWNLOAD

The final artifact must be made available through the user interface.

User selects:

**Download Output**

The generated file is downloaded to the user's computer.

The server must not merely display a path on the server.

The browser/client must receive a valid downloadable artifact.

---

# 31. DATABASE MODEL

The implementation should maintain persistent records for the major system entities.

Suggested entities:

## Users

Fields may include:

* user_id
* role
* created_at
* status

Roles should distinguish:

* ADMIN
* COMPILATION_USER

Worker nodes should have their own node identity rather than being treated as normal users.

## Distributed Sessions

* session_id
* session_token/reference
* created_at
* expires_at
* status
* coordinator_id

## Nodes

* node_id
* session_id
* status
* capability information
* resource information
* last_heartbeat
* current_task_id
* registered_at
* disconnected_at

## Jobs

* job_id
* user/session reference
* language
* input filename
* input reference
* status
* created_at
* started_at
* completed_at
* output reference

## Tasks

* task_id
* job_id
* task_type
* required_capability
* assigned_node_id
* status
* attempt_number
* created_at
* started_at
* completed_at

## Results

* result_id
* task_id
* node_id
* status
* execution_time
* resource metrics
* result reference
* error information

## Performance Records

* job/task reference
* node reference
* metric name
* metric value
* timestamp

The exact schema may be modified for implementation quality.

---

# 32. COMMUNICATION ARCHITECTURE

The system requires reliable communication between:

**Admin/Coordinator ↔ Worker Nodes**

and:

**User Interface ↔ Backend/Compiler Coordinator**

Recommended pattern:

### HTTP/REST

Use for:

* session creation
* link generation
* user submissions
* job creation
* retrieving historical information
* downloading results

### WebSocket or equivalent persistent channel

Use for:

* worker registration state
* heartbeat
* live node status
* task assignment
* task progress
* task completion
* real-time dashboard updates

The exact technology is implementation-defined.

---

# 33. SECURITY REQUIREMENTS

The system should implement reasonable security boundaries.

## Node enrollment

Participation links must contain a unique session/token.

Do not expose unrestricted node registration.

## Node role

A node must be explicitly identified as:

```text
WORKER
```

after acceptance.

## Task validation

Workers should only execute tasks belonging to authorized active sessions/jobs.

## Input validation

User source files must be validated before compilation.

## Task isolation

Worker execution should be isolated as much as practical.

The implementation should avoid allowing arbitrary network/system operations merely because a source file was submitted.

## Resource controls

Worker tasks should have reasonable resource/time limits.

## Session expiry

Node participation sessions should support expiration or explicit termination.

---

# 34. IMPORTANT SECURITY CONSIDERATION FOR SOURCE CODE EXECUTION

User-submitted source code is potentially untrusted.

The worker architecture must therefore avoid directly executing arbitrary submitted programs with unrestricted host privileges.

Where possible:

* sandbox compilation/execution
* restrict filesystem access
* restrict network access
* apply CPU limits
* apply memory limits
* apply execution timeouts
* isolate temporary files
* clean temporary files after completion

The exact sandbox mechanism depends on the deployment environment.

This requirement is especially important because worker nodes belong to other participants.

---

# 35. NODE FAILURE HANDLING

Example:

A job is assigned to NODE-002.

NODE-002 disconnects during execution.

System behavior:

1. Coordinator detects heartbeat loss.
2. Node status becomes unavailable.
3. Task is marked interrupted.
4. Task result is not accepted as successful.
5. Scheduler searches for another eligible node.
6. Task is reassigned.
7. Attempt number increments.
8. New node executes task.
9. Result is collected.
10. Job continues.

The user should not be required to manually restart the compilation unless the job becomes unrecoverable.

---

# 36. NODE JOIN FAILURE

If peer accepts but worker connection fails:

Display:

* Connection failed.
* Retry option.
* Current session status.
* Appropriate diagnostic information.

Do not create a falsely "online" node entry.

---

# 37. NODE DISCONNECTION

When a node intentionally leaves:

1. Worker sends disconnect signal where possible.
2. Coordinator changes node state.
3. Active task is handled according to failure/reassignment rules.
4. Node is removed from active scheduling pool.
5. Historical information remains available where appropriate.

---

# 38. ADMIN VS USER INTERFACE

These must be separate interfaces.

## Admin interface

Primary views:

* System overview
* Generate node link
* Active nodes
* Node details
* Resource status
* Task monitoring
* Job monitoring
* Performance metrics
* Session management

## User interface

Primary views:

* Language selector
* Source editor
* File upload
* Compilation controls
* Job status
* Compilation output
* Performance summary
* Download output

## Worker interface

Minimal interface:

* Connection state
* Node ID
* Session state
* Resource state
* Current task
* Task status
* Worker status
* Disconnect/leave option

Worker UI should not expose the normal user compilation interface.

---

# 39. SUGGESTED TECHNOLOGY STACK

The following is recommended, but internal implementation choices may be adjusted.

## Compiler Core

* C/C++/java/python each seperate for its own compiler.
* Flex/Bison or equivalent compiler construction tooling
* Custom or established IR

## Backend / Coordinator

Possible:

* Python
* C++
* java
* Node.js/TypeScript

Select based on the compiler integration strategy.

## Frontend

Recommended:

* React
* Tailwind CSS

## Database

Possible:

* MySQL

## Communication

Possible:

* WebSocket
* REST
* TCP where required

## Build

* CMake
* language-specific build systems where appropriate

## Version Control

* Git (https://github.com/192521143simats-sketch/PROJECT-OMNICOMPILE.git)

The engineering team may choose alternatives when technically justified.

---

# 40. RECOMMENDED PROJECT STRUCTURE

A conceptual repository structure:

```text
OmniCompile Core/
│
├── coordinator/
│   ├── api/
│   ├── scheduler/
│   ├── node-manager/
│   ├── job-manager/
│   ├── task-manager/
│   ├── result-manager/
│   └── performance/
│
├── compiler/
│   ├── common/
│   │   ├── ir/
│   │   ├── optimizer/
│   │   └── analysis/
│   │
│   ├── c/
│   │   ├── lexer/
│   │   ├── parser/
│   │   ├── semantic/
│   │   └── codegen/
│   │
│   ├── python/
│   │   ├── parser/
│   │   ├── analysis/
│   │   └── codegen/
│   │
│   └── java/
│       ├── lexer/
│       ├── parser/
│       ├── semantic/
│       └── codegen/
│
├── worker/
│   ├── agent/
│   ├── executor/
│   ├── resource-monitor/
│   └── communication/
│
├── frontend/
│   ├── admin/
│   ├── user/
│   └── worker/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── tests/
│   ├── compiler/
│   ├── scheduler/
│   ├── worker/
│   ├── api/
│   └── integration/
│
└── docs/
```

This structure is conceptual. It may be modified to fit the selected technology stack.

---

# 41. DEVELOPMENT PHASES

Do not attempt to build the complete platform as one uncontrolled implementation.

Build incrementally.

## Phase 1 — Repository and Architecture

Implement:

* Repository
* Build system
* Configuration
* Environment management
* Backend skeleton
* Frontend skeleton
* Database connection
* Shared types/models

Deliverable:

A clean bootable project.

---

## Phase 2 — Coordinator and Distributed Session

Implement:

* Coordinator
* Admin authentication where appropriate
* Session creation
* Session lifecycle
* Node-link generation
* Token/session validation

Deliverable:

Admin can create a distributed session and obtain a participation link.

---

## Phase 3 — Node Enrollment

Implement:

* Peer join page
* Participation information
* Accept/decline
* Worker registration
* Node ID generation
* Worker connection
* Node role enforcement

Deliverable:

A second computer can join through the link and become a registered worker.

---

## Phase 4 — Node Monitoring

Implement:

* Node registry
* Resource profiling
* Heartbeat
* Online/offline detection
* Admin dashboard
* Live status updates

Deliverable:

Admin can see connected worker nodes and their current status/resource information.

---

## Phase 5 — Worker Task Framework

Implement:

* Task creation
* Task queue
* Task assignment
* Worker execution
* Result return
* Task state management
* Failure/reassignment

Deliverable:

Coordinator can distribute a simple test computational workload and receive results.

Do this before integrating the real compiler.

---

## Phase 6 — Compiler Core

Implement:

* Source input
* Language selection
* Compiler frontend architecture
* IR
* Basic optimization framework
* Output pipeline

Start with one language to establish the architecture.

---

## Phase 7 — C Pipeline

Implement:

* C lexer
* C parser
* semantic analysis
* IR
* optimization passes
* code generation
* executable generation

Deliverable:

A C source file can be compiled locally through the OmniCompile Core pipeline.

---

## Phase 8 — Distributed C Optimization

Connect:

**C compiler → IR → task decomposition → scheduler → workers → result aggregation → final output**

Deliverable:

A real C compilation job uses multiple worker nodes for appropriate optimization workloads.

---

## Phase 9 — Python Pipeline

Implement:

* Python parsing
* analysis
* intermediate representation/bytecode integration
* optimization
* output generation/packaging

Deliverable:

Python source can travel through the OmniCompile Core pipeline.

---

## Phase 10 — Java Pipeline

Implement:

* Java parsing
* semantic/type analysis
* IR
* optimization
* JVM bytecode generation
* `.class`/`.jar` output

Deliverable:

Java source can travel through the OmniCompile Core pipeline.

---

## Phase 11 — Adaptive Scheduling

Implement:

* resource-aware scoring
* capability matching
* performance measurement
* scheduling feedback
* adaptive decisions
* historical performance data

Deliverable:

Scheduling behavior demonstrably responds to node capabilities and measured performance.

---

## Phase 12 — Complete User Experience

Implement:

* source editor
* file upload
* language selector
* job monitoring
* result page
* performance report
* download system

Deliverable:

A normal user can submit source and receive the appropriate output without interacting with the distributed-system internals.

---

## Phase 13 — Hardening

Test:

* Node joining
* Node rejection
* Duplicate joins
* Node disconnection
* Worker failure
* Task reassignment
* Invalid source
* Compilation errors
* Unsupported files
* Large source files
* Multiple simultaneous jobs
* Multiple nodes
* Zero nodes
* Partial node availability
* Session expiration

---

# 42. TESTING REQUIREMENTS

Testing must occur at multiple levels.

## Unit testing

Test:

* Compiler components
* Scheduler
* Resource classifier
* Node registry
* Task state machine
* Result aggregation
* Language selection
* File validation

## Integration testing

Test:

* Admin → Coordinator
* Peer → Node enrollment
* Node → Worker registration
* Coordinator → Worker task
* Worker → Result
* User → Compilation job
* Compiler → Scheduler
* Scheduler → Worker
* Result → Final output

## Failure testing

Test:

* Worker disconnect
* Heartbeat timeout
* Task timeout
* Worker crash
* Invalid result
* Coordinator failure where practical

## End-to-end testing

Test complete scenarios:

### Scenario A

One user + one node.

### Scenario B

One user + multiple nodes.

### Scenario C

Multiple users + multiple nodes.

### Scenario D

Worker failure during compilation.

### Scenario E

C compilation.

### Scenario F

Python compilation.

### Scenario G

Java compilation.

---

# 43. MINIMUM VIABLE END-TO-END DEMONSTRATION

Before adding advanced optimization, the following must work completely:

1. Admin starts system.
2. Admin creates distributed session.
3. Admin generates link.
4. Peer opens link.
5. Peer accepts.
6. Peer becomes worker.
7. Node appears in dashboard.
8. Node sends heartbeat.
9. User selects language.
10. User uploads source.
11. Compilation job is created.
12. Compiler analyzes source.
13. A real computational task is created.
14. Coordinator assigns task to worker.
15. Worker executes it.
16. Worker returns result.
17. Coordinator aggregates result.
18. Compiler completes output generation.
19. User sees result.
20. User downloads output.

This end-to-end path should work before the system is considered structurally complete.

---

# 44. IMPORTANT ARCHITECTURAL DISTINCTION

OmniCompile Core is **not** merely:

* a file-sharing application,
* a distributed file compiler,
* a generic cloud compiler,
* a computer cluster dashboard,
* a task queue,
* a load balancer,
* or three unrelated language compilers.

The central contribution is the integration of:

**Compiler Technology + Heterogeneous Computing + Distributed Task Execution + Resource-Aware Scheduling + Performance Feedback + Adaptive Optimization**

The project should always preserve this relationship.

---

# 45. WHAT IS ACTUALLY DISTRIBUTED?

The source program itself is not randomly divided between machines.

The preferred model is:

**One compilation job**

↓

**Language-specific frontend**

↓

**Intermediate representation**

↓

**Optimization workload decomposition**

↓

**Suitable optimization tasks**

↓

**Distributed execution across worker nodes**

↓

**Result aggregation**

↓

**Adaptive evaluation**

↓

**Final code generation**

Therefore:

> Input is one source program, while compiler analysis/optimization workloads are distributed across heterogeneous nodes.

This distinction is fundamental.

---

# 46. HARDWARE-ADAPTIVE PRINCIPLE

The system must not merely distribute tasks randomly.

The scheduler should consider:

**Workload requirements**

against:

**Node capabilities**

and:

**Current node state**

and, where implemented:

**Historical performance**

The core decision is:

> Which available node is technically suitable for this task at this moment?

This is the foundation of the hardware-adaptive architecture.

---

# 47. PERFORMANCE PARAMETERS

For academic evaluation, prioritize:

1. Compilation Time
2. Optimization Time
3. Execution Time
4. CPU Utilization
5. Memory Utilization
6. Task Completion Rate
7. Parallel Efficiency
8. Resource Utilization Efficiency
9. Node Load Balance
10. Task Reassignment/Recovery
11. Optimization Gain
12. Scheduling Time

Not every metric must be exposed to the end user.

The Admin Dashboard can show detailed system metrics while the user receives a simpler compilation report.

---

# 48. ADMIN DASHBOARD — EXPECTED EXPERIENCE

The administrator should be able to open the dashboard and immediately understand:

> How many nodes are connected?

> Which nodes are available?

> What resources do they have?

> Which nodes are currently busy?

> What task is each node performing?

> Which jobs are running?

> Did any worker fail?

> Were tasks reassigned?

> What is the current system utilization?

The dashboard should therefore prioritize observability rather than decorative UI.

---

# 49. USER EXPERIENCE — EXPECTED EXPERIENCE

The normal user should experience OmniCompile Core as a compiler service.

They should not have to understand:

* Node IDs
* Worker agents
* Heartbeats
* Task queues
* Resource schedulers
* Distributed sessions

unless the interface optionally provides advanced information.

The basic user workflow should remain:

**Select language → Upload/paste source → Compile & Optimize → Wait → View result → Download output.**

---

# 50. WORKER EXPERIENCE — EXPECTED EXPERIENCE

The worker participant should experience:

**Open link → Read participation information → Accept → Worker connects → Node becomes active → Node receives tasks → Worker executes tasks → Worker reports results → Node remains available.**

The worker should not need to manually select compiler tasks.

---

# 51. ROLE SEPARATION RULE

The system must maintain this conceptual separation at all times:

```text
ADMIN
    ↓
Controls distributed environment

WORKER NODE
    ↓
Contributes computation

COMPILATION USER
    ↓
Consumes compilation service
```

A node is not a user.

A user is not automatically a node.

A device must explicitly enter the worker role through the node participation process.

---

# 52. ERROR HANDLING

Errors should be explicit and user-friendly.

Examples:

### Invalid source

```text
Compilation failed:
Source contains syntax errors.
```

### No eligible nodes

```text
Compilation cannot begin distributed optimization:
No eligible worker nodes are currently available.
```

The system may optionally fall back to coordinator-local processing if such behavior is deliberately implemented.

Do not silently pretend distributed execution occurred when no worker node participated.

### Worker failure

```text
Worker NODE-002 became unavailable.
TASK-04 has been reassigned.
```

### Unsupported language

```text
Selected language is not supported.
Supported languages: C, Python, Java.
```

---

# 53. OBSERVABILITY AND LOGGING

The coordinator should maintain structured logs for:

* Session creation
* Node joining
* Node acceptance
* Node registration
* Heartbeat
* Task assignment
* Task completion
* Task failure
* Task reassignment
* Compilation start
* Compilation completion
* Compilation failure
* Result aggregation
* Output generation

Logs should contain:

* timestamp
* event type
* job ID where applicable
* task ID where applicable
* node ID where applicable
* severity
* message/context

Do not log sensitive source content unnecessarily.

---

# 54. CONCURRENCY REQUIREMENTS

The system should be designed so that multiple workers can operate concurrently.

Example:

```text
Job A
 ├── Task 1 → Node 1
 └── Task 2 → Node 2

Job B
 ├── Task 1 → Node 3
 └── Task 2 → Node 4
```

The scheduler must prevent conflicting assignment of the same worker resource unless the worker is explicitly designed to support concurrent tasks.

---

# 55. MULTIPLE COMPILATION JOBS

The architecture should support multiple users submitting jobs.

The scheduler should maintain:

* Job queues
* Task queues
* Worker availability
* Task priorities
* Job state

The initial implementation may restrict concurrency for simplicity, but the architecture should not make multi-job support impossible.

---

# 56. ZERO-NODE CONDITION

If no worker nodes are connected, the system must clearly report the state.

Possible behavior:

### Strict distributed mode

```text
No worker nodes available.
Distributed compilation cannot proceed.
```

or, if deliberately implemented:

### Hybrid fallback mode

```text
No worker nodes available.
Executing supported local processing on coordinator.
```

If fallback mode is implemented, the system must clearly label the execution as **local**, not distributed.

---

# 57. NO FALSE DISTRIBUTION

The project must not fake distributed computation.

If one node performs all work:

> Report one node.

If the coordinator performs the work:

> Report local execution.

If three workers actually execute tasks:

> Report three workers.

All academic performance measurements must be generated from real execution.

---

# 58. IMPLEMENTATION PRIORITY

When implementation tradeoffs arise, prioritize in this order:

1. Correctness
2. End-to-end functionality
3. Distributed architecture
4. Node lifecycle reliability
5. Compiler correctness
6. Resource-aware scheduling
7. Failure recovery
8. Performance measurement
9. Adaptive optimization
10. UI polish

Do not sacrifice the distributed architecture merely to make the interface look more advanced.

---

# 59. DO NOT OVERENGINEER EARLY

Do not begin by implementing:

* complex machine learning
* unnecessary microservices
* blockchain
* unnecessary cloud infrastructure
* complex authentication ecosystems
* arbitrary AI agents
* decorative analytics

The first objective is a real, functioning:

**Coordinator → Worker Node → Task → Result**

pipeline.

Then integrate the actual compiler.

---

# 60. IMPLEMENTATION FLEXIBILITY

The following are intentionally left open to the engineering team:

* Exact backend language.
* Exact database.
* Exact frontend library additions.
* Exact compiler framework.
* Exact IR implementation.
* Exact scheduling algorithm.
* Exact worker communication implementation.
* Exact sandbox technology.
* Exact deployment model.

However, these implementation decisions must preserve the behavior and architecture defined in this document.

If a proposed change fundamentally alters:

* node enrollment,
* role separation,
* distributed optimization,
* language support,
* resource-aware scheduling,
* adaptive behavior,

the engineering team must treat it as an architectural change rather than an ordinary implementation decision.

---

# 61. DEFINITION OF DONE

OmniCompile Core should not be considered complete merely because the frontend and backend run.

The project is considered functionally complete when:

### Distributed environment

* Admin can start the system.
* Admin can create a distributed session.
* Admin can generate a unique node participation link.
* Peer can open the link.
* Peer can explicitly accept.
* Peer becomes a registered worker.
* Worker receives Node ID.
* Node appears on dashboard.
* Resource information is available.
* Heartbeat works.
* Node can become available/busy/offline.

### Distributed computation

* Coordinator creates tasks.
* Scheduler selects eligible workers.
* Workers receive tasks.
* Workers execute tasks.
* Workers return results.
* Results are aggregated.
* Failed workers can trigger reassignment.

### Compiler

* User can select C.
* User can select Python.
* User can select Java.
* User can upload source files.
* User can paste source code.
* Appropriate language pipeline executes.
* Compiler analysis occurs.
* Optimization occurs.
* Distributed optimization can occur.
* Appropriate output is generated.

### User experience

* Compilation status is visible.
* Result is displayed.
* Performance information is displayed.
* Output artifact is downloadable.

### Integrity

* Node and user roles remain separate.
* Distributed execution is real.
* Performance measurements are real.
* Errors are handled.
* Logs are available.
* System survives ordinary worker disconnections.

---

# 62. FINAL SYSTEM CONCEPT

OmniCompile Core should ultimately behave as follows:

An administrator starts the OmniCompile Core coordinator and creates a distributed computing session. The coordinator generates a unique participation link. Authorized peers open this link and explicitly accept participation. Their devices establish worker connections and become registered worker nodes. The coordinator assigns Node IDs and collects the resource and capability information required for distributed scheduling. The nodes continuously report their availability through heartbeat communication, and the administrator can observe them through a live dashboard.

Separately, a normal compilation user opens the OmniCompile Core compiler interface. The user selects C, Python, or Java and either uploads the corresponding source file or enters source code directly. OmniCompile Core validates the submission and starts a compilation job using the selected language's frontend.

The compiler performs the appropriate lexical, syntactic, semantic, and language-specific analysis before producing an intermediate representation or equivalent internal representation. The optimization layer identifies suitable optimization workloads. These workloads are converted into distributed tasks.

The resource-aware scheduler evaluates the currently available worker nodes according to their capabilities, current resource conditions, language/runtime support, and workload requirements. Appropriate tasks are assigned to suitable nodes.

Worker nodes execute their assigned compiler/optimization computations and return results and performance information to the coordinator. The coordinator aggregates the results, handles failures and task reassignment where required, evaluates the optimization outcomes, and uses performance feedback to support adaptive scheduling and optimization decisions.

After optimization is completed, the appropriate language-specific output stage generates the final artifact. C produces a native executable or appropriate native artifact. Java produces JVM bytecode such as `.class` or `.jar`. Python produces an optimized Python/bytecode artifact and may optionally be packaged into an executable if that deployment capability is implemented.

The user receives a compilation result page containing the language, job status, node/task information, performance measurements, optimization information, and output details. The generated artifact is then made available for download to the user's computer.

The fundamental architecture is therefore:

**Admin-created link → Peer acceptance → Worker node registration → Resource/capability discovery → Live node monitoring → User source submission → Language-specific compilation → Intermediate representation → Optimization task generation → Resource-aware scheduling → Distributed worker computation → Result aggregation → Performance evaluation → Adaptive optimization → Language-specific code generation → Final output → User download.**

This sequence is the authoritative end-to-end behavior of OmniCompile Core.
