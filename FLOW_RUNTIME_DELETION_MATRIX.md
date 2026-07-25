# Flow Runtime Deletion Matrix

This document provides a detailed deletion readiness audit for every component in the legacy Flow Runtime. Every component is evaluated against the 8 readiness criteria: Reachability, Compilation, Registration, Export, Database Entities, API Endpoints, Test Dependencies, and Business Confidence.

Only components with **HIGH** Business Confidence may be deleted in PR4. Components with **LOW** Business Confidence represent future strategic roadmap capabilities and must be retained and/or refactored.

---

## Business Confidence Metric Definitions

| Confidence | Meaning | Action |
| :--- | :--- | :--- |
| **HIGH** | Feature intentionally removed from product vision (visual workflows, runs, triggers, releases). | **DELETE** in designated PR stage |
| **MEDIUM** | Legacy feature but may return in some format. | **HOLD** / Re-evaluate |
| **LOW** | Future strategic capability (MCP, Knowledge Search, Sandbox, OAuth, Connections). | **KEEP & REFACTOR** |

---

## Component Readiness Matrix

| Component Area | File Count | Business Confidence | Designated PR Phase | Action |
| :--- | :---: | :---: | :---: | :--- |
| **API flows/flow** | 12 | **HIGH** | PR4A | **DELETE** |
| **API flows/flow-run** | 18 | **HIGH** | PR4A | **DELETE** |
| **API flows/flow-version**| 31 | **HIGH** | PR4A | **DELETE** |
| **API flows/folder** | 3 | **HIGH** | PR4A | **DELETE** |
| **API flows/step-run** | 2 | **HIGH** | PR4A | **DELETE** |
| **API flows/ root** | 2 | **HIGH** | PR4A | **DELETE** |
| **API trigger** | 16 | **HIGH** | PR4B | **DELETE** |
| **API webhooks** | 5 | **HIGH** | PR4B | **DELETE** |
| **API ee/project-release**| 18 | **HIGH** | PR4A / PR4B | **DELETE** |
| **API ee/project-replace**| 3 | **HIGH** | PR4A / PR4B | **DELETE** |
| **API mcp** | 72 | **LOW** | N/A | **KEEP & REFACTOR** |
| **API knowledge-base**| 6 | **LOW** | N/A | **KEEP & REFACTOR** |
| **Engine Handlers (loop/router)** | 4 | **HIGH** | PR4C | **DELETE** |
| **Engine Operations (flow)** | 1 | **HIGH** | PR4C | **DELETE** |
| **Core flows** | 40 | **HIGH** | PR4E | **DELETE** |
| **Core flow-run** | 10 | **HIGH** | PR4E | **DELETE** |
| **Core workers** | 4 | **HIGH** | PR4E | **DELETE** |
| **Core agents** | 4 | **HIGH** | PR4E | **DELETE** |
| **Core engine (contracts)**| 7 | **LOW** | N/A | **KEEP & RETAIN** |
