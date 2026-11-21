CREATE TABLE "admin_users" (
	"admin_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_role_check" CHECK ("admin_users"."role" in ('CLERK', 'HOD', 'SUPER_ADMIN'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"log_id" serial PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_student_id" uuid,
	"actor_role" varchar(20) NOT NULL,
	"action" varchar(50) NOT NULL,
	"from_status" varchar(30),
	"status_after" varchar(30) NOT NULL,
	"remarks" text,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" in ('SUBMITTED', 'VERIFIED_DOCS', 'APPROVED', 'REJECTED', 'GENERATED_PDF', 'GENERATION_FAILED')),
	CONSTRAINT "audit_logs_actor_role_check" CHECK ("audit_logs"."actor_role" in ('STUDENT', 'CLERK', 'HOD', 'SUPER_ADMIN')),
	CONSTRAINT "audit_logs_single_actor_check" CHECK (num_nonnulls("audit_logs"."actor_id", "audit_logs"."actor_student_id") = 1),
	CONSTRAINT "audit_logs_status_after_check" CHECK ("audit_logs"."status_after" in ('SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'READY'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"admin_id" uuid,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"ip_address" varchar(64),
	"user_agent" text,
	CONSTRAINT "auth_sessions_single_actor_check" CHECK (num_nonnulls("auth_sessions"."student_id", "auth_sessions"."admin_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "certificate_requests" (
	"request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"certificate_type" varchar(20) NOT NULL,
	"purpose" text NOT NULL,
	"supporting_doc_url" text,
	"status" varchar(30) DEFAULT 'SUBMITTED' NOT NULL,
	"admin_remarks" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_requests_type_check" CHECK ("certificate_requests"."certificate_type" in ('BONAFIDE', 'LC', 'DIPLOMA')),
	CONSTRAINT "certificate_requests_status_check" CHECK ("certificate_requests"."status" in ('SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'READY')),
	CONSTRAINT "certificate_requests_purpose_check" CHECK (char_length("certificate_requests"."purpose") between 10 and 1000)
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"certificate_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"certificate_number" varchar(64) NOT NULL,
	"verification_code" varchar(64) NOT NULL,
	"object_key" text NOT NULL,
	"sha256" char(64) NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_credentials" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"student_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roll_number" varchar(20) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"date_of_birth" date NOT NULL,
	"email" varchar(100) NOT NULL,
	"phone" varchar(15),
	"programme" varchar(50) NOT NULL,
	"batch_year" integer NOT NULL,
	"current_semester" integer,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_status_check" CHECK ("students"."status" in ('ACTIVE', 'GRADUATED', 'DROPPED')),
	CONSTRAINT "students_batch_year_check" CHECK ("students"."batch_year" between 1990 and 2100),
	CONSTRAINT "students_semester_check" CHECK ("students"."current_semester" is null or "students"."current_semester" between 1 and 8)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_request_id_certificate_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."certificate_requests"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_admin_users_admin_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("admin_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_student_id_students_student_id_fk" FOREIGN KEY ("actor_student_id") REFERENCES "public"."students"("student_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_admin_id_admin_users_admin_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("admin_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_verified_by_admin_users_admin_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."admin_users"("admin_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_request_id_certificate_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."certificate_requests"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_generated_by_admin_users_admin_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."admin_users"("admin_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credentials" ADD CONSTRAINT "student_credentials_student_id_students_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uq" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_logs_request_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uq" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_student_idx" ON "auth_sessions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_admin_idx" ON "auth_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "certificate_requests_student_status_idx" ON "certificate_requests" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "certificate_requests_status_created_idx" ON "certificate_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_request_uq" ON "certificates" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_number_uq" ON "certificates" USING btree ("certificate_number");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_verification_code_uq" ON "certificates" USING btree ("verification_code");--> statement-breakpoint
CREATE UNIQUE INDEX "students_roll_number_uq" ON "students" USING btree ("roll_number");--> statement-breakpoint
CREATE UNIQUE INDEX "students_email_uq" ON "students" USING btree ("email");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE are forbidden'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();