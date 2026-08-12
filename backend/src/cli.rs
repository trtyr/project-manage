//! CLI module — turns `project-manage-backend` into a dual-purpose binary:
//! - no args (or `serve`) → start the HTTP server (original behaviour)
//! - subcommands → HTTP client that talks to the API, with JSON output
//!   designed for both AI-driven automation and human inspection.
//!
//! Usage:
//!   project-manage                                    # serve
//!   project-manage projects list                       # list all projects
//!   project-manage projects list --client-id <uuid>    # filter by client
//!   project-manage projects create --data '{"name":"X",...}'
//!   project-manage tasks list --project-id <uuid>
//!   project-manage search "keyword"
//!   project-manage --api-url http://other:3000 projects list

use clap::{Parser, Subcommand};
use reqwest::Client;
use serde_json::{Value, json};
use std::process;

// ---------------------------------------------------------------------------
// Top-level CLI
// ---------------------------------------------------------------------------

/// project-manage CLI — manage clients, projects, tasks, phases, people,
/// assets, files, deliverables, and communications.
#[derive(Parser)]
#[command(name = "project-manage", version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    /// API server base URL (default: http://localhost:3000, or $PROJECT_MANAGE_URL)
    #[arg(long, default_value_t = default_api_url(), env = "PROJECT_MANAGE_URL")]
    pub api_url: String,

    /// Output format: json (default, AI-friendly) or table (human-readable)
    #[arg(long, default_value = "json")]
    pub format: OutputFormat,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Clone, clap::ValueEnum)]
pub enum OutputFormat {
    Json,
    Table,
}

fn default_api_url() -> String {
    std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .map(|p| format!("http://localhost:{p}"))
        .unwrap_or_else(|| "http://localhost:3000".into())
}

#[derive(Subcommand)]
pub enum Command {
    /// Start the HTTP server (same as no args)
    Serve,

    #[command(subcommand)]
    Projects(ProjectCmd),

    #[command(subcommand)]
    Clients(ClientCmd),

    #[command(subcommand)]
    Phases(PhaseCmd),

    #[command(subcommand)]
    Tasks(TaskCmd),

    #[command(subcommand)]
    People(PersonCmd),

    #[command(subcommand)]
    Assets(AssetCmd),

    #[command(subcommand)]
    Files(FileCmd),

    #[command(subcommand)]
    Communications(CommCmd),

    #[command(subcommand)]
    Deliverables(DeliverableCmd),

    /// Global search across projects/clients/communications/tasks/people
    Search { query: String },
}

// ---------------------------------------------------------------------------
// Per-resource subcommands
// ---------------------------------------------------------------------------

#[derive(Subcommand)]
pub enum ProjectCmd {
    /// List all projects, optionally filtered by client
    List {
        #[arg(long)]
        client_id: Option<String>,
    },
    /// Get a project by ID
    Get { id: String },
    /// Create a project (JSON body matching CreateProject DTO)
    Create { #[arg(long)] data: String },
    /// Update a project (JSON body matching UpdateProject DTO)
    Update { id: String, #[arg(long)] data: String },
    /// ⚠ Delete a project — also deletes all child rows (CASCADE)
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum ClientCmd {
    List,
    Get { id: String },
    Create { #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum PhaseCmd {
    /// List phases for a project
    List { #[arg(long)] project_id: String },
    Get { id: String },
    Create { #[arg(long)] project_id: String, #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum TaskCmd {
    /// List tasks for a project
    List { #[arg(long)] project_id: String },
    Get { id: String },
    Create { #[arg(long)] project_id: String, #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum PersonCmd {
    /// List people for a project (both sides by default)
    List { #[arg(long)] project_id: String },
    Get { id: String },
    Create { #[arg(long)] project_id: String, #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
    /// Move a person between team ↔ client
    Flip { id: String },
}

#[derive(Subcommand)]
pub enum AssetCmd {
    List { #[arg(long)] project_id: String },
    Get { id: String },
    Create { #[arg(long)] project_id: String, #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum FileCmd {
    /// List files for a project
    List { #[arg(long)] project_id: Option<String> },
    Get { id: String },
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum CommCmd {
    /// List communications for a project
    List { #[arg(long)] project_id: Option<String> },
    Get { id: String },
    Create { #[arg(long)] project_id: String, #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
}

#[derive(Subcommand)]
pub enum DeliverableCmd {
    List { #[arg(long)] project_id: String },
    Get { id: String },
    Create { #[arg(long)] project_id: String, #[arg(long)] data: String },
    Update { id: String, #[arg(long)] data: String },
    Delete { id: String },
}

// ---------------------------------------------------------------------------
// Runner — called from main.rs when CLI args are present
// ---------------------------------------------------------------------------

pub async fn run(cli: Cli) {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|e| {
            eprintln!("failed to build HTTP client: {e}");
            process::exit(1);
        });

    let fmt = cli.format;
    let api = cli.api_url.trim_end_matches('/');

    let result = match cli.command {
        Some(Command::Serve) => {
            eprintln!("'serve' is handled by the server entrypoint, not the CLI runner.");
            return;
        }
        Some(Command::Projects(cmd)) => do_projects(&client, api, cmd, fmt).await,
        Some(Command::Clients(cmd)) => do_clients(&client, api, cmd, fmt).await,
        Some(Command::Phases(cmd)) => do_phases(&client, api, cmd, fmt).await,
        Some(Command::Tasks(cmd)) => do_tasks(&client, api, cmd, fmt).await,
        Some(Command::People(cmd)) => do_people(&client, api, cmd, fmt).await,
        Some(Command::Assets(cmd)) => do_assets(&client, api, cmd, fmt).await,
        Some(Command::Files(cmd)) => do_files(&client, api, cmd, fmt).await,
        Some(Command::Communications(cmd)) => do_communications(&client, api, cmd, fmt).await,
        Some(Command::Deliverables(cmd)) => do_deliverables(&client, api, cmd, fmt).await,
        Some(Command::Search { query }) => do_search(&client, api, &query, fmt).await,
        None => {
            eprintln!("use 'project-manage --help' for available commands, or run without args to serve");
            return;
        }
    };

    match result {
        Ok(output) => {
            println!("{output}");
        }
        Err(err) => {
            eprintln!("CLI error: {err}");
            process::exit(1);
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CliResult = Result<String, String>;

/// GET a single JSON value, format it.
async fn get_one(client: &Client, url: &str, fmt: OutputFormat) -> CliResult {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    check_status(&resp)?;
    let val: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(format_val(val, fmt))
}

/// GET a JSON array, format it.
async fn get_list(client: &Client, url: &str, fmt: OutputFormat) -> CliResult {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    check_status(&resp)?;
    let val: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(format_val(val, fmt))
}

/// POST JSON body, return formatted response.
async fn post_json(client: &Client, url: &str, body: &str, fmt: OutputFormat) -> CliResult {
    let payload: Value = serde_json::from_str(body).map_err(|e| format!("invalid JSON: {e}"))?;
    let resp = client.post(url).json(&payload).send().await.map_err(|e| e.to_string())?;
    check_status(&resp)?;
    let val: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(format_val(val, fmt))
}

/// PUT JSON body, return formatted response.
async fn put_json(client: &Client, url: &str, body: &str, fmt: OutputFormat) -> CliResult {
    let payload: Value = serde_json::from_str(body).map_err(|e| format!("invalid JSON: {e}"))?;
    let resp = client.put(url).json(&payload).send().await.map_err(|e| e.to_string())?;
    check_status(&resp)?;
    let val: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(format_val(val, fmt))
}

/// DELETE, return empty success or error.
async fn delete_one(client: &Client, url: &str) -> CliResult {
    let resp = client.delete(url).send().await.map_err(|e| e.to_string())?;
    check_status(&resp)?;
    Ok(json!({"ok": true}).to_string())
}

/// POST with empty body, return formatted response.
async fn post_empty(client: &Client, url: &str, fmt: OutputFormat) -> CliResult {
    let resp = client.post(url).send().await.map_err(|e| e.to_string())?;
    check_status(&resp)?;
    let val: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(format_val(val, fmt))
}

fn check_status(resp: &reqwest::Response) -> Result<(), String> {
    let status = resp.status();
    if status.is_success() || status == reqwest::StatusCode::NO_CONTENT {
        Ok(())
    } else {
        Err(format!("{status}"))
    }
}

fn format_val(val: Value, fmt: OutputFormat) -> String {
    match fmt {
        OutputFormat::Json => serde_json::to_string_pretty(&val).unwrap_or_else(|_| format!("{val}")),
        OutputFormat::Table => format_as_table(val),
    }
}

/// Minimal table renderer for arrays of objects.
fn format_as_table(val: Value) -> String {
    match &val {
        Value::Array(items) if items.is_empty() => "[]\n".into(),
        Value::Array(items) => {
            // Collect keys from the first object
            let keys: Vec<String> = items
                .first()
                .and_then(|i| i.as_object())
                .map(|obj| obj.keys().map(|k| k.to_string()).collect())
                .unwrap_or_default();
            if keys.is_empty() {
                return serde_json::to_string_pretty(&val).unwrap_or_default();
            }
            // Format header + separator
            let col_widths: Vec<usize> = keys
                .iter()
                .map(|k| {
                    let max_val = items
                        .iter()
                        .flat_map(|i| i.get(k))
                        .map(|v| cell_str(v).len())
                        .max()
                        .unwrap_or(0);
                    k.len().max(max_val).min(40)
                })
                .collect();
            let header: String = keys
                .iter()
                .enumerate()
                .map(|(i, k)| format!("{:w$}", trunc(k, col_widths[i]), w = col_widths[i]))
                .collect::<Vec<_>>()
                .join(" │ ");
            let sep = col_widths
                .iter()
                .map(|w| "─".repeat(*w))
                .collect::<Vec<_>>()
                .join("─┼─");
            let rows: Vec<String> = items
                .iter()
                .map(|item| {
                    keys.iter()
                        .enumerate()
                        .map(|(i, k)| {
                            let s = item.get(k).map(cell_str).unwrap_or_default();
                            format!("{:w$}", trunc(&s, col_widths[i]), w = col_widths[i])
                        })
                        .collect::<Vec<_>>()
                        .join(" │ ")
                })
                .collect();
            format!("{header}\n{sep}\n{}\n{} items\n", rows.join("\n"), items.len())
        }
        other => serde_json::to_string_pretty(other).unwrap_or_default(),
    }
}

fn cell_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "-".into(),
        other => other.to_string(),
    }
}

fn trunc(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        format!("{}…", s.chars().take(max.saturating_sub(1)).collect::<String>())
    } else {
        s.to_string()
    }
}

// ---------------------------------------------------------------------------
// Resource dispatchers
// ---------------------------------------------------------------------------

async fn do_projects(client: &Client, api: &str, cmd: ProjectCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        ProjectCmd::List { client_id } => {
            let url = if let Some(cid) = client_id {
                format!("{api}/api/projects?client_id={cid}")
            } else {
                format!("{api}/api/projects")
            };
            get_list(client, &url, fmt).await
        }
        ProjectCmd::Get { id } => get_one(client, &format!("{api}/api/projects/{id}"), fmt).await,
        ProjectCmd::Create { data } => post_json(client, &format!("{api}/api/projects"), &data, fmt).await,
        ProjectCmd::Update { id, data } => put_json(client, &format!("{api}/api/projects/{id}"), &data, fmt).await,
        ProjectCmd::Delete { id } => delete_one(client, &format!("{api}/api/projects/{id}")).await,
    }
}

async fn do_clients(client: &Client, api: &str, cmd: ClientCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        ClientCmd::List => get_list(client, &format!("{api}/api/clients"), fmt).await,
        ClientCmd::Get { id } => get_one(client, &format!("{api}/api/clients/{id}"), fmt).await,
        ClientCmd::Create { data } => post_json(client, &format!("{api}/api/clients"), &data, fmt).await,
        ClientCmd::Update { id, data } => put_json(client, &format!("{api}/api/clients/{id}"), &data, fmt).await,
        ClientCmd::Delete { id } => delete_one(client, &format!("{api}/api/clients/{id}")).await,
    }
}

async fn do_phases(client: &Client, api: &str, cmd: PhaseCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        PhaseCmd::List { project_id } => {
            get_list(client, &format!("{api}/api/projects/{project_id}/phases"), fmt).await
        }
        PhaseCmd::Get { id } => get_one(client, &format!("{api}/api/phases/{id}"), fmt).await,
        PhaseCmd::Create { project_id, data } => {
            post_json(client, &format!("{api}/api/projects/{project_id}/phases"), &data, fmt).await
        }
        PhaseCmd::Update { id, data } => put_json(client, &format!("{api}/api/phases/{id}"), &data, fmt).await,
        PhaseCmd::Delete { id } => delete_one(client, &format!("{api}/api/phases/{id}")).await,
    }
}

async fn do_tasks(client: &Client, api: &str, cmd: TaskCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        TaskCmd::List { project_id } => {
            get_list(client, &format!("{api}/api/projects/{project_id}/tasks"), fmt).await
        }
        TaskCmd::Get { id } => get_one(client, &format!("{api}/api/tasks/{id}"), fmt).await,
        TaskCmd::Create { project_id, data } => {
            post_json(client, &format!("{api}/api/projects/{project_id}/tasks"), &data, fmt).await
        }
        TaskCmd::Update { id, data } => put_json(client, &format!("{api}/api/tasks/{id}"), &data, fmt).await,
        TaskCmd::Delete { id } => delete_one(client, &format!("{api}/api/tasks/{id}")).await,
    }
}

async fn do_people(client: &Client, api: &str, cmd: PersonCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        PersonCmd::List { project_id } => {
            get_list(client, &format!("{api}/api/projects/{project_id}/people"), fmt).await
        }
        PersonCmd::Get { id } => get_one(client, &format!("{api}/api/people/{id}"), fmt).await,
        PersonCmd::Create { project_id, data } => {
            post_json(client, &format!("{api}/api/projects/{project_id}/people"), &data, fmt).await
        }
        PersonCmd::Update { id, data } => put_json(client, &format!("{api}/api/people/{id}"), &data, fmt).await,
        PersonCmd::Delete { id } => delete_one(client, &format!("{api}/api/people/{id}")).await,
        PersonCmd::Flip { id } => post_empty(client, &format!("{api}/api/people/{id}/flip-side"), fmt).await,
    }
}

async fn do_assets(client: &Client, api: &str, cmd: AssetCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        AssetCmd::List { project_id } => {
            get_list(client, &format!("{api}/api/projects/{project_id}/assets"), fmt).await
        }
        AssetCmd::Get { id } => get_one(client, &format!("{api}/api/assets/{id}"), fmt).await,
        AssetCmd::Create { project_id, data } => {
            post_json(client, &format!("{api}/api/projects/{project_id}/assets"), &data, fmt).await
        }
        AssetCmd::Update { id, data } => put_json(client, &format!("{api}/api/assets/{id}"), &data, fmt).await,
        AssetCmd::Delete { id } => delete_one(client, &format!("{api}/api/assets/{id}")).await,
    }
}

async fn do_files(client: &Client, api: &str, cmd: FileCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        FileCmd::List { project_id } => {
            let url = if let Some(pid) = project_id {
                format!("{api}/api/projects/{pid}/files")
            } else {
                format!("{api}/api/files")
            };
            get_list(client, &url, fmt).await
        }
        FileCmd::Get { id } => get_one(client, &format!("{api}/api/files/{id}"), fmt).await,
        FileCmd::Delete { id } => delete_one(client, &format!("{api}/api/files/{id}")).await,
    }
}

async fn do_communications(client: &Client, api: &str, cmd: CommCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        CommCmd::List { project_id } => {
            let url = if let Some(pid) = project_id {
                format!("{api}/api/projects/{pid}/communications")
            } else {
                format!("{api}/api/communications/recent")
            };
            get_list(client, &url, fmt).await
        }
        CommCmd::Get { id } => get_one(client, &format!("{api}/api/communications/{id}"), fmt).await,
        CommCmd::Create { project_id, data } => {
            post_json(client, &format!("{api}/api/projects/{project_id}/communications"), &data, fmt).await
        }
        CommCmd::Update { id, data } => {
            put_json(client, &format!("{api}/api/communications/{id}"), &data, fmt).await
        }
        CommCmd::Delete { id } => delete_one(client, &format!("{api}/api/communications/{id}")).await,
    }
}

async fn do_deliverables(client: &Client, api: &str, cmd: DeliverableCmd, fmt: OutputFormat) -> CliResult {
    match cmd {
        DeliverableCmd::List { project_id } => {
            get_list(client, &format!("{api}/api/projects/{project_id}/deliverables"), fmt).await
        }
        DeliverableCmd::Get { id } => get_one(client, &format!("{api}/api/deliverables/{id}"), fmt).await,
        DeliverableCmd::Create { project_id, data } => {
            post_json(client, &format!("{api}/api/projects/{project_id}/deliverables"), &data, fmt).await
        }
        DeliverableCmd::Update { id, data } => {
            put_json(client, &format!("{api}/api/deliverables/{id}"), &data, fmt).await
        }
        DeliverableCmd::Delete { id } => delete_one(client, &format!("{api}/api/deliverables/{id}")).await,
    }
}

async fn do_search(client: &Client, api: &str, query: &str, fmt: OutputFormat) -> CliResult {
    get_list(client, &format!("{api}/api/search?q={query}"), fmt).await
}
