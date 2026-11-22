import { customType, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { GaugeSize, Pattern } from '@stitch/pattern-ir'
import type { JobVerification, SourcePage } from '../types'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  login: text('login').notNull().unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export type PatternStatus = 'reading' | 'needs_review' | 'ready' | 'failed'
export type GaugeMode = 'unset' | 'as_is' | 'recalc' | 'remeasure'

export const patterns = pgTable(
  'patterns',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    craft: text('craft').$type<'knit' | 'crochet'>().notNull().default('knit'),
    title: text('title').notNull(),
    status: text('status').$type<PatternStatus>().notNull().default('reading'),
    source: text('source').$type<'upload' | 'sample'>().notNull().default('upload'),
    pdfKey: text('pdf_key'),
    pdfName: text('pdf_name'),
    pdfSha256: text('pdf_sha256'),
    currentVersionId: text('current_version_id'),
    gaugeMode: text('gauge_mode').$type<GaugeMode>().notNull().default('unset'),
    myGauge: jsonb('my_gauge').$type<GaugeSize | null>(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('patterns_owner_idx').on(t.ownerId, t.updatedAt)],
)

export const patternVersions = pgTable('pattern_versions', {
  id: text('id').primaryKey(),
  patternId: text('pattern_id').notNull(),
  kind: text('kind').$type<'original' | 'gauge'>().notNull(),
  ir: jsonb('ir').$type<Pattern>().notNull(),
  gauge: jsonb('gauge').$type<GaugeSize | null>(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export type JobStage = 'upload' | 'extract' | 'structure' | 'verify' | 'feedback' | 'review' | 'done'
export type JobStatus = 'queued' | 'running' | 'needs_review' | 'done' | 'failed'

export const conversionJobs = pgTable('conversion_jobs', {
  id: text('id').primaryKey(),
  patternId: text('pattern_id').notNull(),
  stage: text('stage').$type<JobStage>().notNull().default('upload'),
  status: text('status').$type<JobStatus>().notNull().default('queued'),
  verification: jsonb('verification').$type<JobVerification | null>(),
  pages: jsonb('pages').$type<SourcePage[] | null>(),
  llmCalls: integer('llm_calls').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  feedbackRounds: integer('feedback_rounds').notNull().default(0),
  /** 변환을 시작한 횟수 */
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const progressEntries = pgTable('progress_entries', {
  id: text('id').primaryKey(),
  patternId: text('pattern_id').notNull(),
  at: ts('at').notNull().defaultNow(),
  row: integer('row').notNull(),
  stitch: integer('stitch').notNull().default(0),
  finishingStep: integer('finishing_step'),
  memo: text('memo').notNull().default(''),
})

export const markers = pgTable('markers', {
  id: text('id').primaryKey(),
  patternId: text('pattern_id').notNull(),
  row: integer('row').notNull(),
  x: integer('x').notNull(),
  color: text('color').notNull(),
  name: text('name').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const avatars = pgTable('avatars', {
  userId: text('user_id').primaryKey(),
  value: jsonb('value').$type<Record<string, string>>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const entitlements = pgTable('entitlements', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  plan: text('plan').$type<'plus'>().notNull(),
  provider: text('provider').notNull(),
  startsAt: ts('starts_at').notNull().defaultNow(),
  endsAt: ts('ends_at'),
})

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (value) => new Uint8Array(value),
})

/** 올린 PDF를 데이터베이스에 두는 저장소 (STORAGE_DRIVER=db) */
export const files = pgTable('files', {
  key: text('key').primaryKey(),
  bytes: bytea('bytes').notNull(),
  size: integer('size').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

/** 변환을 시작한 기록. 도안을 지워도 남아서 상한을 셀 때 씁니다. */
export const usageEvents = pgTable('usage_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').$type<'conversion'>().notNull(),
  at: ts('at').notNull().defaultNow(),
})
