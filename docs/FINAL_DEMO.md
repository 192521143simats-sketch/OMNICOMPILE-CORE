# Final end-to-end demonstration

Demonstration date: 2026-10-04

The final demonstration used Docker Engine 27.2.0, the healthy Compose-managed MySQL 8.4 service, the real coordinator, and a native worker. No node, timing, result, or artifact was simulated.

1. Admin created session `SESSION-6552704b-312d-4002-9877-e1d6795194ff` and its participation link.
2. The peer opened the link contract through the join API and explicitly accepted the disclosure.
3. The one-use enrollment credential registered `NODE-d1a67048-eb7f-43a1-9d24-d2188ec06fb9`.
4. A heartbeat made the profiled C/Python/Java-capable node `AVAILABLE` in the admin snapshot.
5. A user submitted `final-demo.c`, containing two functions, through the public compilation API.
6. The C frontend validated and lowered the source; the coordinator created real function-level worker tasks.
7. The scheduler assigned the tasks to the eligible node, which optimized and returned measured results.
8. Aggregation accepted both candidates with 0.626 ms total measured worker time.
9. GCC generated `omnicompile-89c4183b.exe`; MySQL persisted the completed job and artifact metadata.
10. The download endpoint returned the genuine 135,922-byte executable for job `JOB-f4fa199b-4d95-47ed-80d5-7d6d89c4183b`.

The same persisted distributed job path had already been verified for genuine Python `.pyc` and Java `.jar` artifacts. The repeatable final project gate is `npm run verify`.
