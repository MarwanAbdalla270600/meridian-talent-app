CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."developer_status" AS ENUM('P1_IN_ERFASSUNG', 'P1_EINGEREICHT', 'P2_FREIGEGEBEN');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('cv', 'consent', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('processing', 'extracted', 'failed', 'manual', 'completed');--> statement-breakpoint
CREATE TYPE "public"."language_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'NATIVE');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('de', 'en');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'interview', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'proposed', 'interview', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('egypt_editor', 'austria_reviewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('junior', 'mid', 'senior', 'lead');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('language', 'backend', 'frontend', 'cloud', 'devops', 'database', 'mobile', 'qa', 'legacy', 'other');--> statement-breakpoint
CREATE TYPE "public"."skill_status" AS ENUM('approved', 'pending');--> statement-breakpoint
CREATE TYPE "public"."virus_scan_status" AS ENUM('pending', 'clean', 'infected', 'skipped', 'error');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"diff" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"developer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_imports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"developer_id" uuid,
	"status" "import_status" DEFAULT 'processing' NOT NULL,
	"model" text,
	"extraction" jsonb,
	"error_code" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_languages" (
	"developer_id" uuid NOT NULL,
	"language" text NOT NULL,
	"level" "language_level" NOT NULL,
	CONSTRAINT "developer_languages_developer_id_language_pk" PRIMARY KEY("developer_id","language")
);
--> statement-breakpoint
CREATE TABLE "developer_skills" (
	"developer_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"years" numeric(4, 1) DEFAULT 0 NOT NULL,
	CONSTRAINT "developer_skills_developer_id_skill_id_pk" PRIMARY KEY("developer_id","skill_id"),
	CONSTRAINT "developer_skills_level_chk" CHECK ("developer_skills"."level" between 1 and 5),
	CONSTRAINT "developer_skills_years_chk" CHECK ("developer_skills"."years" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"public_ref" integer GENERATED ALWAYS AS IDENTITY (sequence name "developers_public_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version" integer DEFAULT 1 NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"title" text,
	"seniority" "seniority" DEFAULT 'mid' NOT NULL,
	"location" text,
	"available_from" date,
	"hourly_rate_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" "developer_status" DEFAULT 'P1_IN_ERFASSUNG' NOT NULL,
	"is_placed" boolean DEFAULT false NOT NULL,
	"summary_de" text,
	"summary_en" text,
	"education_de" text,
	"education_en" text,
	"internal_note" text,
	"review_note" text,
	"consent_given" boolean DEFAULT false NOT NULL,
	"consent_at" date,
	"consent_version" text,
	"processing_restricted" boolean DEFAULT false NOT NULL,
	"restricted_at" timestamp with time zone,
	"restriction_reason" text,
	"deletion_flagged_at" timestamp with time zone,
	"deletion_flag_reason" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developers_rate_chk" CHECK ("developers"."hourly_rate_cents" is null or "developers"."hourly_rate_cents" >= 0),
	CONSTRAINT "developers_currency_chk" CHECK ("developers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "developers_approved_chk" CHECK ("developers"."status" <> 'P2_FREIGEGEBEN' or "developers"."approved_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"developer_id" uuid,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"uploaded_by" uuid,
	"virus_scan_status" "virus_scan_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"developer_id" uuid NOT NULL,
	"role" text NOT NULL,
	"company" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"description_de" text,
	"description_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiences_dates_chk" CHECK ("experiences"."to_date" is null or "experiences"."to_date" >= "experiences"."from_date")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_developers" (
	"request_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"proposed_by" uuid,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_developers_request_id_developer_id_pk" PRIMARY KEY("request_id","developer_id")
);
--> statement-breakpoint
CREATE TABLE "request_skills" (
	"request_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"min_level" smallint NOT NULL,
	CONSTRAINT "request_skills_request_id_skill_id_pk" PRIMARY KEY("request_id","skill_id"),
	CONSTRAINT "request_skills_level_chk" CHECK ("request_skills"."min_level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"seniority" "seniority",
	"start_by" date,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"note" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"must_enroll_totp" boolean DEFAULT false NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"category" "skill_category" DEFAULT 'other' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "skill_status" DEFAULT 'approved' NOT NULL,
	"proposed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"developer_id" uuid NOT NULL,
	"from_status" "developer_status",
	"to_status" "developer_status" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"display_name" text NOT NULL,
	"locale" "locale" DEFAULT 'de' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_imports" ADD CONSTRAINT "cv_imports_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_imports" ADD CONSTRAINT "cv_imports_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_imports" ADD CONSTRAINT "cv_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_languages" ADD CONSTRAINT "developer_languages_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_skills" ADD CONSTRAINT "developer_skills_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_skills" ADD CONSTRAINT "developer_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_developers" ADD CONSTRAINT "request_developers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_developers" ADD CONSTRAINT "request_developers_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_developers" ADD CONSTRAINT "request_developers_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_skills" ADD CONSTRAINT "request_skills_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_skills" ADD CONSTRAINT "request_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "certifications_developer_idx" ON "certifications" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cv_imports_created_by_idx" ON "cv_imports" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "developer_skills_skill_idx" ON "developer_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developers_public_ref_uq" ON "developers" USING btree ("public_ref");--> statement-breakpoint
CREATE INDEX "developers_status_idx" ON "developers" USING btree ("status") WHERE "developers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "developers_updated_idx" ON "developers" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "developers_available_idx" ON "developers" USING btree ("available_from");--> statement-breakpoint
CREATE INDEX "developers_search_trgm_idx" ON "developers" USING gin ((coalesce("first_name", '') || ' ' || coalesce("last_name", '') || ' ' || coalesce("title", '')) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_uq" ON "documents" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "documents_developer_idx" ON "documents" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "experiences_developer_idx" ON "experiences" USING btree ("developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prt_token_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "prt_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "request_developers_dev_idx" ON "request_developers" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "requests_client_idx" ON "requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_name_lower_uq" ON "skills" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "status_history_developer_idx" ON "status_history" USING btree ("developer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));