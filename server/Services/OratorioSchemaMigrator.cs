using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;
using BoardTaskStatus = Oratorio.Server.Domain.TaskStatus;

namespace Oratorio.Server.Services;

public sealed class OratorioSchemaMigrator(OratorioDbContext db)
{
    public async Task ApplyAsync(CancellationToken ct = default)
    {
        await db.Database.EnsureCreatedAsync(ct);
        await EnsureRunColumnAsync("progress_percent", "INTEGER NOT NULL DEFAULT 0", ct);
        await EnsureRunColumnAsync("status_message", "TEXT NULL", ct);
        await EnsureRunColumnAsync("last_heartbeat_at", "INTEGER NULL", ct);
        await EnsureRunColumnAsync("mock_outcome", "TEXT NOT NULL DEFAULT 'Success'", ct);
        await EnsureRunColumnAsync("mock_duration_seconds", "INTEGER NOT NULL DEFAULT 8", ct);
        await EnsureRunColumnAsync("turn_id", "TEXT NULL", ct);
        await EnsureRunColumnAsync("app_server_endpoint", "TEXT NULL", ct);
        await EnsureRunColumnAsync("prompt_context_json", "TEXT NULL", ct);
        await EnsureRunColumnAsync("base_workspace_path", "TEXT NULL", ct);
        await EnsureRunColumnAsync("worktree_path", "TEXT NULL", ct);
        await EnsureRunColumnAsync("worktree_branch", "TEXT NULL", ct);
        await EnsureRunColumnAsync("base_ref", "TEXT NULL", ct);
        await EnsureRunColumnAsync("base_sha", "TEXT NULL", ct);
        await EnsureRunColumnAsync("worktree_status", "TEXT NOT NULL DEFAULT 'NotRequired'", ct);
        await EnsureRunColumnAsync("worktree_error_code", "TEXT NULL", ct);
        await EnsureRunColumnAsync("worktree_error_message", "TEXT NULL", ct);
        await EnsureRunColumnAsync("retry_count", "INTEGER NOT NULL DEFAULT 0", ct);
        await EnsureRunColumnAsync("next_retry_at", "INTEGER NULL", ct);
        await EnsureRunColumnAsync("lease_owner", "TEXT NULL", ct);
        await EnsureRunColumnAsync("lease_acquired_at", "INTEGER NULL", ct);
        await EnsureRunColumnAsync("worktree_cleanup_after_at", "INTEGER NULL", ct);
        await EnsureRunColumnAsync("worktree_cleaned_at", "INTEGER NULL", ct);
        await EnsureRunColumnAsync("purpose", "TEXT NOT NULL DEFAULT 'ReviewAnalysis'", ct);
        await EnsureRunColumnAsync("dispatch_trigger", "TEXT NOT NULL DEFAULT 'Manual'", ct);
        await EnsureRunColumnAsync("target_head_sha", "TEXT NULL", ct);
        await EnsureRunColumnAsync("delivery_policy", "TEXT NOT NULL DEFAULT 'ManualDelivery'", ct);
        await EnsureRunColumnAsync("implementation_turn_count", "INTEGER NOT NULL DEFAULT 0", ct);
        await EnsureItemColumnAsync("external_url", "TEXT NULL", ct);
        await EnsureItemColumnAsync("labels_json", "TEXT NULL", ct);
        await EnsureItemColumnAsync("source_updated_at", "INTEGER NULL", ct);
        await EnsureItemColumnAsync("is_draft", "INTEGER NOT NULL DEFAULT 0", ct);
        await EnsureItemColumnAsync("head_sha", "TEXT NULL", ct);
        await EnsureItemColumnAsync("source_state", "TEXT NOT NULL DEFAULT 'Unknown'", ct);
        await EnsureItemColumnAsync("source_details_status", "TEXT NOT NULL DEFAULT 'NotRequired'", ct);
        await EnsureItemColumnAsync("source_details_hydrated_at", "INTEGER NULL", ct);
        await EnsureItemColumnAsync("source_details_error_code", "TEXT NULL", ct);
        await EnsureItemColumnAsync("source_details_error_message", "TEXT NULL", ct);
        await EnsureItemColumnAsync("source_closed_at", "INTEGER NULL", ct);
        await EnsureItemColumnAsync("source_merged_at", "INTEGER NULL", ct);
        await EnsureItemColumnAsync("archive_reason", "TEXT NULL", ct);
        await EnsureItemColumnAsync("parent_item_id", "TEXT NULL", ct);
        await EnsureItemColumnAsync("generated_from_draft_id", "TEXT NULL", ct);
        await EnsureItemColumnAsync("short_id_int", "INTEGER NULL", ct);
        await EnsureItemColumnAsync("short_id", "TEXT NULL", ct);
        await EnsureItemColumnAsync("board_sort_order", "INTEGER NOT NULL DEFAULT 0", ct);
        await EnsureCommentColumnAsync("source", "TEXT NULL", ct);
        await EnsureCommentColumnAsync("source_comment_id", "TEXT NULL", ct);
        await EnsureCommentColumnAsync("external_url", "TEXT NULL", ct);
        await EnsureCommentColumnAsync("source_updated_at", "INTEGER NULL", ct);
        await EnsureCommentColumnAsync("purpose", "TEXT NOT NULL DEFAULT 'Feedback'", ct);
        await EnsureSchemaMetadataTableAsync(ct);
        await EnsureTaskShortIdCountersTableAsync(ct);
        await EnsureItemBoardSortIndexAsync(ct);
        await EnsureSourceSnapshotsTableAsync(ct);
        await EnsureSourceWriteLogsTableAsync(ct);
        await EnsureReviewDraftTablesAsync(ct);
        await EnsureImplementationDraftsTableAsync(ct);
        await EnsureFollowUpDraftsTableAsync(ct);
        await EnsureDiscussionTurnsTableAsync(ct);
        await EnsureConfigurationChangesTableAsync(ct);
        await EnsureGitHubSyncTablesAsync(ct);
        await EnsureGitLabSyncTablesAsync(ct);
        await EnsureSourceSyncSchedulesTableAsync(ct);
        await EnsureAutoReviewStateTablesAsync(ct);
        await NormalizeSourceSnapshotsAsync(ct);
        await BackfillSourceDetailsStatusAsync(ct);
        await BackfillCommentPurposeAsync(ct);
        await PruneDuplicateSourceSyncedTimelineEventsAsync(ct);
        await BackfillRunLifecycleColumnsAsync(ct);
        await BackfillShortIdsAsync(ct);
        await BackfillBoardSortOrdersAsync(ct);
    }

    private async Task EnsureRunColumnAsync(string columnName, string columnDefinition, CancellationToken ct)
    {
        var columns = await db.Database.SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info('runs')").ToListAsync(ct);
        if (columns.Contains(columnName, StringComparer.OrdinalIgnoreCase))
        {
            return;
        }

        var sql = "ALTER TABLE runs ADD COLUMN " + columnName + " " + columnDefinition;
        await db.Database.ExecuteSqlRawAsync(sql, ct);
    }

    private Task EnsureItemColumnAsync(string columnName, string columnDefinition, CancellationToken ct) =>
        EnsureColumnAsync("items", columnName, columnDefinition, ct);

    private Task EnsureCommentColumnAsync(string columnName, string columnDefinition, CancellationToken ct) =>
        EnsureColumnAsync("comments", columnName, columnDefinition, ct);

    private async Task EnsureColumnAsync(string tableName, string columnName, string columnDefinition, CancellationToken ct)
    {
        if (tableName is not ("items" or "comments"))
        {
            throw new ArgumentOutOfRangeException(nameof(tableName), tableName, "Unsupported table.");
        }

        var pragmaSql = tableName == "items"
            ? "SELECT name AS Value FROM pragma_table_info('items')"
            : "SELECT name AS Value FROM pragma_table_info('comments')";
        var columns = await db.Database.SqlQueryRaw<string>(pragmaSql).ToListAsync(ct);
        if (columns.Contains(columnName, StringComparer.OrdinalIgnoreCase))
        {
            return;
        }

        var sql = "ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + columnDefinition;
        await db.Database.ExecuteSqlRawAsync(sql, ct);
    }

    private async Task EnsureSourceSnapshotsTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS source_snapshots (
                snapshot_id TEXT NOT NULL CONSTRAINT pk_source_snapshots PRIMARY KEY,
                item_id TEXT NOT NULL,
                source TEXT NOT NULL,
                external_id TEXT NOT NULL,
                repository TEXT NULL,
                head_sha TEXT NULL,
                source_updated_at INTEGER NULL,
                payload_json TEXT NOT NULL,
                payload_hash TEXT NOT NULL DEFAULT '',
                synced_at INTEGER NOT NULL,
                CONSTRAINT fk_source_snapshots_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE
            );
            """,
            ct);
        await EnsureSourceSnapshotColumnAsync("payload_hash", "TEXT NOT NULL DEFAULT ''", ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_source_snapshots_item_id_synced_at ON source_snapshots (item_id, synced_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_comments_source_source_comment_id ON comments (source, source_comment_id) WHERE source_comment_id IS NOT NULL",
            ct);
    }

    private Task EnsureSourceSnapshotColumnAsync(string columnName, string columnDefinition, CancellationToken ct) =>
        EnsureTableColumnAsync("source_snapshots", columnName, columnDefinition, ct);

    private Task EnsureReviewDraftCommentColumnAsync(string columnName, string columnDefinition, CancellationToken ct) =>
        EnsureTableColumnAsync("review_draft_comments", columnName, columnDefinition, ct);

    private async Task EnsureSourceWriteLogsTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS source_write_logs (
                write_id TEXT NOT NULL CONSTRAINT pk_source_write_logs PRIMARY KEY,
                item_id TEXT NOT NULL,
                round_id TEXT NULL,
                decision_id TEXT NULL,
                source TEXT NOT NULL,
                kind TEXT NOT NULL,
                intent TEXT NOT NULL,
                status TEXT NOT NULL,
                repository TEXT NULL,
                number INTEGER NULL,
                head_sha TEXT NULL,
                request_json TEXT NOT NULL,
                response_json TEXT NULL,
                external_id TEXT NULL,
                external_url TEXT NULL,
                attempt_count INTEGER NOT NULL,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER NULL,
                CONSTRAINT fk_source_write_logs_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT fk_source_write_logs_rounds_round_id FOREIGN KEY (round_id) REFERENCES rounds (round_id),
                CONSTRAINT fk_source_write_logs_decisions_decision_id FOREIGN KEY (decision_id) REFERENCES decisions (decision_id)
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_source_write_logs_item_id_created_at ON source_write_logs (item_id, created_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_source_write_logs_status ON source_write_logs (status)",
            ct);
    }

    private async Task EnsureTaskShortIdCountersTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS task_short_id_counters (
                workspace_id TEXT NOT NULL CONSTRAINT pk_task_short_id_counters PRIMARY KEY,
                prefix TEXT NOT NULL,
                next_value INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_items_workspace_short_id ON items (workspace_id, short_id) WHERE short_id IS NOT NULL",
            ct);
    }

    private async Task EnsureSchemaMetadataTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS schema_metadata (
                key TEXT NOT NULL CONSTRAINT pk_schema_metadata PRIMARY KEY,
                value TEXT NOT NULL
            );
            """,
            ct);
    }

    private async Task EnsureItemBoardSortIndexAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_items_workspace_board_sort ON items (workspace_id, board_sort_order)",
            ct);
    }

    private async Task EnsureReviewDraftTablesAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS review_drafts (
                draft_id TEXT NOT NULL CONSTRAINT pk_review_drafts PRIMARY KEY,
                item_id TEXT NOT NULL,
                round_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                status TEXT NOT NULL,
                summary_body TEXT NOT NULL,
                major_count INTEGER NOT NULL,
                minor_count INTEGER NOT NULL,
                suggestion_count INTEGER NOT NULL,
                warnings_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                published_at INTEGER NULL,
                source_write_id TEXT NULL,
                CONSTRAINT fk_review_drafts_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT fk_review_drafts_rounds_round_id FOREIGN KEY (round_id) REFERENCES rounds (round_id),
                CONSTRAINT fk_review_drafts_runs_run_id FOREIGN KEY (run_id) REFERENCES runs (run_id),
                CONSTRAINT fk_review_drafts_source_write_logs_source_write_id FOREIGN KEY (source_write_id) REFERENCES source_write_logs (write_id)
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_review_drafts_item_id_created_at ON review_drafts (item_id, created_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_review_drafts_run_id ON review_drafts (run_id)",
            ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS review_draft_comments (
                draft_comment_id TEXT NOT NULL CONSTRAINT pk_review_draft_comments PRIMARY KEY,
                draft_id TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                path TEXT NOT NULL,
                line INTEGER NOT NULL,
                side TEXT NOT NULL,
                start_line INTEGER NULL,
                start_side TEXT NULL,
                suggestion_replacement TEXT NULL,
                comment_only_reason TEXT NULL,
                status TEXT NOT NULL,
                warning TEXT NULL,
                CONSTRAINT fk_review_draft_comments_review_drafts_draft_id FOREIGN KEY (draft_id) REFERENCES review_drafts (draft_id) ON DELETE CASCADE
            );
            """,
            ct);
        await EnsureReviewDraftCommentColumnAsync("comment_only_reason", "TEXT NULL", ct);
        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE review_draft_comments
            SET comment_only_reason = 'needsHumanDecision'
            WHERE comment_only_reason IS NULL
              AND (suggestion_replacement IS NULL OR TRIM(suggestion_replacement) = '')
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_review_draft_comments_draft_id ON review_draft_comments (draft_id)",
            ct);
    }

    private async Task EnsureImplementationDraftsTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS implementation_drafts (
                draft_id TEXT NOT NULL CONSTRAINT pk_implementation_drafts PRIMARY KEY,
                item_id TEXT NOT NULL,
                round_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                status TEXT NOT NULL,
                delivery_policy TEXT NOT NULL,
                summary TEXT NOT NULL,
                tests_json TEXT NOT NULL,
                risks_json TEXT NOT NULL,
                changed_files_json TEXT NOT NULL,
                proposed_commit_message TEXT NOT NULL,
                proposed_pr_title TEXT NOT NULL,
                proposed_pr_body TEXT NOT NULL,
                branch_name TEXT NULL,
                commit_sha TEXT NULL,
                pull_request_item_id TEXT NULL,
                pull_request_url TEXT NULL,
                source_write_id TEXT NULL,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                delivered_at INTEGER NULL,
                CONSTRAINT fk_implementation_drafts_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT fk_implementation_drafts_rounds_round_id FOREIGN KEY (round_id) REFERENCES rounds (round_id),
                CONSTRAINT fk_implementation_drafts_runs_run_id FOREIGN KEY (run_id) REFERENCES runs (run_id),
                CONSTRAINT fk_implementation_drafts_pull_request_item_id FOREIGN KEY (pull_request_item_id) REFERENCES items (item_id),
                CONSTRAINT fk_implementation_drafts_source_write_id FOREIGN KEY (source_write_id) REFERENCES source_write_logs (write_id)
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_implementation_drafts_item_id_created_at ON implementation_drafts (item_id, created_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_implementation_drafts_run_id ON implementation_drafts (run_id)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_items_parent_item_id ON items (parent_item_id)",
            ct);
    }

    private async Task EnsureFollowUpDraftsTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS follow_up_drafts (
                draft_id TEXT NOT NULL CONSTRAINT pk_follow_up_drafts PRIMARY KEY,
                item_id TEXT NOT NULL,
                round_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                rationale TEXT NULL,
                repository TEXT NULL,
                assignee TEXT NULL,
                branch TEXT NULL,
                labels_json TEXT NULL,
                created_item_id TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                resolved_at INTEGER NULL,
                CONSTRAINT fk_follow_up_drafts_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT fk_follow_up_drafts_rounds_round_id FOREIGN KEY (round_id) REFERENCES rounds (round_id),
                CONSTRAINT fk_follow_up_drafts_runs_run_id FOREIGN KEY (run_id) REFERENCES runs (run_id),
                CONSTRAINT fk_follow_up_drafts_created_item_id FOREIGN KEY (created_item_id) REFERENCES items (item_id)
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_follow_up_drafts_item_id_created_at ON follow_up_drafts (item_id, created_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_follow_up_drafts_run_id ON follow_up_drafts (run_id)",
            ct);
    }

    private async Task EnsureDiscussionTurnsTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS discussion_turns (
                discussion_turn_id TEXT NOT NULL CONSTRAINT pk_discussion_turns PRIMARY KEY,
                item_id TEXT NOT NULL,
                round_id TEXT NULL,
                question_comment_id TEXT NOT NULL,
                reply_comment_id TEXT NULL,
                base_run_id TEXT NOT NULL,
                thread_id TEXT NOT NULL,
                turn_id TEXT NULL,
                model_id TEXT NULL,
                app_server_endpoint TEXT NULL,
                status TEXT NOT NULL,
                prompt_context_json TEXT NULL,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER NULL,
                completed_at INTEGER NULL,
                CONSTRAINT fk_discussion_turns_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT fk_discussion_turns_rounds_round_id FOREIGN KEY (round_id) REFERENCES rounds (round_id),
                CONSTRAINT fk_discussion_turns_question_comment_id FOREIGN KEY (question_comment_id) REFERENCES comments (comment_id),
                CONSTRAINT fk_discussion_turns_reply_comment_id FOREIGN KEY (reply_comment_id) REFERENCES comments (comment_id),
                CONSTRAINT fk_discussion_turns_base_run_id FOREIGN KEY (base_run_id) REFERENCES runs (run_id)
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_discussion_turns_item_id_status ON discussion_turns (item_id, status)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_discussion_turns_base_run_id ON discussion_turns (base_run_id)",
            ct);
    }

    private async Task EnsureConfigurationChangesTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS configuration_changes (
                change_id TEXT NOT NULL CONSTRAINT pk_configuration_changes PRIMARY KEY,
                created_at INTEGER NOT NULL,
                actor TEXT NOT NULL,
                remote_address TEXT NULL,
                base_revision TEXT NOT NULL,
                new_revision TEXT NOT NULL,
                changed_fields_json TEXT NOT NULL,
                impact_warnings_json TEXT NOT NULL,
                before_json TEXT NOT NULL,
                after_json TEXT NOT NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_configuration_changes_created_at ON configuration_changes (created_at)",
            ct);
    }

    private async Task EnsureGitHubSyncTablesAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS github_sync_jobs (
                job_id TEXT NOT NULL CONSTRAINT pk_github_sync_jobs PRIMARY KEY,
                sync_trigger TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                repositories_total INTEGER NOT NULL DEFAULT 0,
                repositories_completed INTEGER NOT NULL DEFAULT 0,
                repositories_failed INTEGER NOT NULL DEFAULT 0,
                issues_imported INTEGER NOT NULL DEFAULT 0,
                pull_requests_imported INTEGER NOT NULL DEFAULT 0,
                comments_imported INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER NULL,
                completed_at INTEGER NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_github_sync_jobs_status ON github_sync_jobs (status)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_github_sync_jobs_created_at ON github_sync_jobs (created_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS github_sync_repository_runs (
                repository_run_id TEXT NOT NULL CONSTRAINT pk_github_sync_repository_runs PRIMARY KEY,
                job_id TEXT NOT NULL,
                repository TEXT NOT NULL,
                status TEXT NOT NULL,
                phase TEXT NOT NULL,
                issues_discovered INTEGER NOT NULL DEFAULT 0,
                pull_requests_discovered INTEGER NOT NULL DEFAULT 0,
                issues_imported INTEGER NOT NULL DEFAULT 0,
                pull_requests_imported INTEGER NOT NULL DEFAULT 0,
                comments_imported INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER NULL,
                completed_at INTEGER NULL,
                CONSTRAINT fk_github_sync_repository_runs_jobs_job_id FOREIGN KEY (job_id) REFERENCES github_sync_jobs (job_id) ON DELETE CASCADE
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_github_sync_repository_runs_job_id_repository ON github_sync_repository_runs (job_id, repository)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_github_sync_repository_runs_repository_status_completed_at ON github_sync_repository_runs (repository, status, completed_at)",
            ct);
    }

    private async Task EnsureGitLabSyncTablesAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS gitlab_sync_jobs (
                job_id TEXT NOT NULL CONSTRAINT pk_gitlab_sync_jobs PRIMARY KEY,
                sync_trigger TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                projects_total INTEGER NOT NULL DEFAULT 0,
                projects_completed INTEGER NOT NULL DEFAULT 0,
                projects_failed INTEGER NOT NULL DEFAULT 0,
                issues_imported INTEGER NOT NULL DEFAULT 0,
                merge_requests_imported INTEGER NOT NULL DEFAULT 0,
                comments_imported INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER NULL,
                completed_at INTEGER NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_gitlab_sync_jobs_status ON gitlab_sync_jobs (status)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_gitlab_sync_jobs_created_at ON gitlab_sync_jobs (created_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS gitlab_sync_project_runs (
                project_run_id TEXT NOT NULL CONSTRAINT pk_gitlab_sync_project_runs PRIMARY KEY,
                job_id TEXT NOT NULL,
                project_path TEXT NOT NULL,
                status TEXT NOT NULL,
                phase TEXT NOT NULL,
                issues_discovered INTEGER NOT NULL DEFAULT 0,
                merge_requests_discovered INTEGER NOT NULL DEFAULT 0,
                issues_imported INTEGER NOT NULL DEFAULT 0,
                merge_requests_imported INTEGER NOT NULL DEFAULT 0,
                comments_imported INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER NULL,
                completed_at INTEGER NULL,
                CONSTRAINT fk_gitlab_sync_project_runs_jobs_job_id FOREIGN KEY (job_id) REFERENCES gitlab_sync_jobs (job_id) ON DELETE CASCADE
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_gitlab_sync_project_runs_job_id_project_path ON gitlab_sync_project_runs (job_id, project_path)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_gitlab_sync_project_runs_project_path_status_completed_at ON gitlab_sync_project_runs (project_path, status, completed_at)",
            ct);
    }

    private async Task EnsureSourceSyncSchedulesTableAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS source_sync_schedules (
                provider TEXT NOT NULL CONSTRAINT pk_source_sync_schedules PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 0,
                interval_seconds INTEGER NOT NULL DEFAULT 300,
                next_run_at INTEGER NULL,
                last_scheduled_at INTEGER NULL,
                last_job_id TEXT NULL,
                last_error_code TEXT NULL,
                last_error_message TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_source_sync_schedules_enabled_next_run_at ON source_sync_schedules (enabled, next_run_at)",
            ct);
    }

    private async Task EnsureAutoReviewStateTablesAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS auto_review_repository_states (
                repository TEXT NOT NULL CONSTRAINT pk_auto_review_repository_states PRIMARY KEY,
                enabled INTEGER NOT NULL,
                initialized_at INTEGER NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS auto_review_item_states (
                item_id TEXT NOT NULL CONSTRAINT pk_auto_review_item_states PRIMARY KEY,
                repository TEXT NOT NULL,
                last_observed_head_sha TEXT NULL,
                last_queued_head_sha TEXT NULL,
                last_queued_run_id TEXT NULL,
                last_error_code TEXT NULL,
                last_error_message TEXT NULL,
                last_error_at INTEGER NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                CONSTRAINT fk_auto_review_item_states_items_item_id FOREIGN KEY (item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT fk_auto_review_item_states_runs_last_queued_run_id FOREIGN KEY (last_queued_run_id) REFERENCES runs (run_id) ON DELETE SET NULL
            );
            """,
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_auto_review_item_states_repository_updated_at ON auto_review_item_states (repository, updated_at)",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_auto_review_item_states_last_queued_run_id ON auto_review_item_states (last_queued_run_id)",
            ct);
    }

    private async Task NormalizeSourceSnapshotsAsync(CancellationToken ct)
    {
        var snapshots = await db.SourceSnapshots.ToListAsync(ct);
        foreach (var snapshot in snapshots.Where(x => string.IsNullOrWhiteSpace(x.PayloadHash)))
        {
            snapshot.PayloadHash = ComputePayloadHash(snapshot.PayloadJson);
        }

        await db.SaveChangesAsync(ct);

        var duplicateIds = snapshots
            .GroupBy(x => new { x.ItemId, x.Source, x.ExternalId, x.PayloadHash })
            .SelectMany(group => group
                .OrderByDescending(x => x.SyncedAt)
                .ThenByDescending(x => x.SnapshotId, StringComparer.Ordinal)
                .Skip(1)
                .Select(x => x.SnapshotId))
            .ToArray();

        if (duplicateIds.Length > 0)
        {
            await db.SourceSnapshots
                .Where(x => duplicateIds.Contains(x.SnapshotId))
                .ExecuteDeleteAsync(ct);
        }

        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_source_snapshots_item_id_source_external_id_payload_hash ON source_snapshots (item_id, source, external_id, payload_hash)",
            ct);
    }

    private async Task PruneDuplicateSourceSyncedTimelineEventsAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM timeline_events
            WHERE rowid NOT IN (
                SELECT MAX(rowid)
                FROM timeline_events
                WHERE round_id IS NULL
                    AND run_id IS NULL
                    AND kind = 'SourceSynced'
                    AND actor_kind = 'Source'
                    AND actor_name = 'GitHub'
                    AND title = 'GitHub synchronized'
                GROUP BY item_id, kind, actor_kind, actor_name, title, body
            )
            AND round_id IS NULL
            AND run_id IS NULL
            AND kind = 'SourceSynced'
            AND actor_kind = 'Source'
            AND actor_name = 'GitHub'
            AND title = 'GitHub synchronized';
            """,
            ct);
    }

    private async Task BackfillRunLifecycleColumnsAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE runs SET progress_percent = 100 WHERE status IN ('Succeeded', 'Failed', 'TimedOut') AND progress_percent = 0",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE runs SET status_message = 'Review output is ready.' WHERE status = 'Succeeded' AND status_message IS NULL",
            ct);
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE runs SET status_message = COALESCE(error_message, 'Run failed.') WHERE status IN ('Failed', 'TimedOut') AND status_message IS NULL",
            ct);
    }

    private async Task BackfillShortIdsAsync(CancellationToken ct)
    {
        var missingItems = await db.Items
            .Where(x => x.ShortId == null || x.ShortIdInteger == null)
            .OrderBy(x => x.WorkspaceId)
            .ThenBy(x => x.CreatedAt)
            .ThenBy(x => x.ItemId)
            .ToListAsync(ct);

        if (missingItems.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var group in missingItems.GroupBy(x => x.WorkspaceId))
        {
            var workspaceId = string.IsNullOrWhiteSpace(group.Key) ? "default" : group.Key;
            var prefix = TaskShortIdAllocator.DerivePrefix(workspaceId);
            var nextValue = (await db.Items
                .Where(x => x.WorkspaceId == workspaceId && x.ShortIdInteger != null)
                .MaxAsync(x => (int?)x.ShortIdInteger, ct) ?? 0) + 1;

            foreach (var item in group)
            {
                item.WorkspaceId = workspaceId;
                item.ShortIdInteger = nextValue;
                item.ShortId = $"{prefix}-{nextValue}";
                nextValue++;
            }

            var counter = await db.TaskShortIdCounters.FirstOrDefaultAsync(x => x.WorkspaceId == workspaceId, ct);
            if (counter is null)
            {
                db.TaskShortIdCounters.Add(new OratorioTaskShortIdCounter
                {
                    WorkspaceId = workspaceId,
                    Prefix = prefix,
                    NextValue = nextValue,
                    UpdatedAt = now
                });
            }
            else if (counter.NextValue < nextValue)
            {
                counter.Prefix = prefix;
                counter.NextValue = nextValue;
                counter.UpdatedAt = now;
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task BackfillSourceDetailsStatusAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE items
            SET source_details_status = 'Current',
                source_details_hydrated_at = COALESCE(source_details_hydrated_at, last_source_sync_at)
            WHERE source = 'github'
              AND source_details_status = 'NotRequired';
            """,
            ct);
    }

    private async Task BackfillCommentPurposeAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE comments
            SET purpose = 'SourceContext'
            WHERE purpose = 'Feedback'
              AND (source IS NOT NULL OR source_comment_id IS NOT NULL OR visibility = 'Source');
            """,
            ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE comments
            SET purpose = 'SystemNote'
            WHERE purpose = 'Feedback'
              AND author_kind = 'System';
            """,
            ct);
    }

    private async Task BackfillBoardSortOrdersAsync(CancellationToken ct)
    {
        const string markerKey = "migrations.board_sort_order_backfill";
        var alreadyApplied = await db.Database
            .SqlQueryRaw<string>("SELECT value AS Value FROM schema_metadata WHERE key = 'migrations.board_sort_order_backfill'")
            .AnyAsync(ct);
        if (alreadyApplied)
        {
            return;
        }

        var items = await db.Items
            .OrderBy(x => x.WorkspaceId)
            .ThenByDescending(x => x.UpdatedAt)
            .ThenBy(x => x.ItemId)
            .ToListAsync(ct);

        foreach (var workspaceItems in items.GroupBy(x => string.IsNullOrWhiteSpace(x.WorkspaceId) ? "default" : x.WorkspaceId))
        {
            foreach (var statusItems in workspaceItems.GroupBy(x => TaskStatusMapping.Project(x.State)))
            {
                var columnIndex = BoardColumnIndex(statusItems.Key);
                var position = 0;
                foreach (var item in statusItems.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.ItemId))
                {
                    item.WorkspaceId = workspaceItems.Key;
                    item.BoardSortOrder = ComposeBoardSortOrder(columnIndex, position);
                    position++;
                }
            }
        }

        await db.SaveChangesAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ({markerKey}, '1')",
            ct);
    }

    private async Task EnsureTableColumnAsync(string tableName, string columnName, string columnDefinition, CancellationToken ct)
    {
        if (tableName is not ("source_snapshots" or "review_draft_comments"))
        {
            throw new ArgumentOutOfRangeException(nameof(tableName), tableName, "Unsupported table.");
        }

        var pragmaSql = tableName == "source_snapshots"
            ? "SELECT name AS Value FROM pragma_table_info('source_snapshots')"
            : "SELECT name AS Value FROM pragma_table_info('review_draft_comments')";
        var columns = await db.Database.SqlQueryRaw<string>(pragmaSql).ToListAsync(ct);
        if (columns.Contains(columnName, StringComparer.OrdinalIgnoreCase))
        {
            return;
        }

        var sql = "ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + columnDefinition;
        await db.Database.ExecuteSqlRawAsync(sql, ct);
    }

    private static string ComputePayloadHash(string payloadJson) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payloadJson))).ToLowerInvariant();

    private static long ComposeBoardSortOrder(int columnIndex, int position) => (columnIndex * 1000L) + position;

    private static int BoardColumnIndex(BoardTaskStatus status) =>
        status switch
        {
            BoardTaskStatus.Todo => 0,
            BoardTaskStatus.InProgress => 1,
            BoardTaskStatus.InReview => 2,
            BoardTaskStatus.Done => 3,
            BoardTaskStatus.Cancelled => 4,
            _ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unsupported task status.")
        };
}
