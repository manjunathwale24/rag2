import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 384;

export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIMENSIONS})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value.slice(1, -1).split(",").map(Number);
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentTokens: integer("parent_tokens").notNull(),
  childTokens: integer("child_tokens").notNull(),
  overlapTokens: integer("overlap_tokens").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kbId: uuid("kb_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    pathname: text("pathname").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status", { enum: ["pending", "indexed", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("documents_kb_pathname_idx").on(table.kbId, table.pathname)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kbId: uuid("kb_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Null for parent chunks. Child chunks point at the parent they were split from. */
    parentId: uuid("parent_id"),
    /** 0 = parent (returned as context), 1 = child (embedded and searched). */
    level: integer("level").notNull(),
    position: integer("position").notNull(),
    headingPath: text("heading_path").notNull().default(""),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    embedding: vector("embedding"),
  },
  (table) => [
    index("chunks_kb_level_idx").on(table.kbId, table.level),
    index("chunks_document_idx").on(table.documentId),
    index("chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
