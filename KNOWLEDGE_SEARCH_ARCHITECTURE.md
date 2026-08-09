# Knowledge Search Architecture — Headless AI Integration Runtime

## 1. Role in Headless Agent Loop

Knowledge Search is a strategic, first-class capability for tool discovery and contextual search.

```
User Prompt
     ↓
AI Planner
     ↓
Knowledge Search (pgvector + semantic search)
     ↓
Tool Discovery (discovers relevant piece & action metadata)
     ↓
MCP / Sandbox Execution
     ↓
Result
```

---

## 2. Core Technical Strengths

Knowledge Search provides deterministic, high-accuracy tool and document retrieval:
1. **pgvector Retrieval**: Vector embeddings stored in PostgreSQL using HNSW indexes for fast similarity lookup.
2. **Semantic Search & Keyword Floor**: Hybrid search combining cosine similarity vector search with full-text search (`tsvector`), ensuring exact keyword matches (e.g. piece names) are never missed.
3. **τ No-Match Gate**: Confidence threshold ($\tau$) filtering out low-relevance results before passing context to the LLM planner.
4. **Deterministic `buildRetrievalDoc`**: Ensures indexing and query-time document representations are identical, avoiding train/evaluation mismatch.

---

## 3. Promotion to First-Class Runtime Core

- Ensure entity registration for `KnowledgeSearch` in `database-connection.ts` is active.
- Expose Knowledge Search endpoints via `POST /v1/knowledge-search/query` for runtime planner access.
- Decouple any historical references to flow IDs from knowledge search documents, using `projectId` and `toolName` as primary namespaces.
