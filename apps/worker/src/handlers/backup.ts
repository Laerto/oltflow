import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { prisma } from "@oltflow/db";
import { encryptSecret, decryptSecret } from "@oltflow/core";
import type { BackupPayload, BackupVerifyPayload } from "@oltflow/core";
import { log } from "../logger.js";
import { notifyEvent } from "../notify/engine.js";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/var/lib/oltflow/backups";
const OLT_CRED_KEY = process.env.OLT_CRED_KEY ?? "";

export interface LocalConfig {
  path?: string; // relative under BACKUP_DIR or absolute
}

export interface SshConfig {
  host: string;
  port?: number;
  user: string;
  password?: string;
  privateKey?: string;
  remotePath: string;
}

type TargetConfig = LocalConfig & SshConfig;

function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "").split("?")[0] || "oltpanel",
  };
}

function runCmd(
  cmd: string,
  args: string[],
  env: Record<string, string> = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function appendLog(runId: number, line: string, buf: string[]): Promise<string> {
  const stamp = new Date().toISOString().slice(11, 19);
  buf.push(`[${stamp}] ${line}`);
  const logText = buf.join("\n").slice(-50_000);
  await prisma.backupRun.update({ where: { id: runId }, data: { log: logText } }).catch(() => {});
  return logText;
}

function decryptTargetConfig(configEnc: string): TargetConfig {
  if (!OLT_CRED_KEY) throw new Error("OLT_CRED_KEY missing");
  try {
    return JSON.parse(decryptSecret(configEnc, OLT_CRED_KEY)) as TargetConfig;
  } catch {
    // Allow unencrypted JSON for migration/dev bootstrap only
    return JSON.parse(configEnc) as TargetConfig;
  }
}

export async function handleBackup(payload: BackupPayload): Promise<unknown> {
  const { runId, targetId } = payload;
  const lines: string[] = [];
  const logLine = (s: string) => appendLog(runId, s, lines);

  await prisma.backupRun.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date(), error: null },
  });
  await logLine("Backup started");

  try {
    const target = targetId
      ? await prisma.backupTarget.findUnique({ where: { id: targetId } })
      : null;
    const cfg = target ? decryptTargetConfig(target.configEnc) : ({ path: "" } as LocalConfig);
    const kind = target?.kind ?? "local";

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const relDir = `runs/${stamp}`;
    const absDir = path.join(BACKUP_DIR, relDir);
    await fs.mkdir(absDir, { recursive: true });
    await logLine(`Work dir: ${absDir}`);

    // ── 1) pg_dump -Fc ─────────────────────────────────────────────────────
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set");
    const db = parseDatabaseUrl(dbUrl);
    const dumpPath = path.join(absDir, "database.dump");
    await logLine(`pg_dump ${db.host}:${db.port}/${db.database} …`);
    const dump = await runCmd(
      "pg_dump",
      ["-Fc", "-f", dumpPath, "-h", db.host, "-p", db.port, "-U", db.user, db.database],
      { PGPASSWORD: db.password }
    );
    if (dump.code !== 0) {
      throw new Error(`pg_dump failed: ${dump.stderr || dump.stdout}`);
    }
    const dumpStat = await fs.stat(dumpPath);
    await logLine(`Dump OK · ${(dumpStat.size / 1024 / 1024).toFixed(2)} MB`);

    // ── 2) Config archive ──────────────────────────────────────────────────
    const configDir = path.join(absDir, "config");
    await fs.mkdir(configDir, { recursive: true });

    // Integration rows (encrypted) + settings (non-secret mostly)
    const [integrations, settings, migration] = await Promise.all([
      prisma.integration.findMany(),
      prisma.setting.findMany(),
      prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1
      `.catch(() => [] as { migration_name: string }[]),
    ]);

    await fs.writeFile(
      path.join(configDir, "integrations.json"),
      JSON.stringify(
        integrations.map((i) => ({
          id: i.id,
          enabled: i.enabled,
          configEnc: i.configEnc,
          status: i.status,
        })),
        null,
        2
      )
    );
    await fs.writeFile(path.join(configDir, "settings.json"), JSON.stringify(settings, null, 2));

    // Optional compose/env copies mounted into the worker
    for (const [src, name] of [
      ["/app/.env.backup", ".env"],
      ["/app/docker-compose.yml.backup", "docker-compose.yml"],
    ] as const) {
      if (existsSync(src)) {
        await fs.copyFile(src, path.join(configDir, name));
        await logLine(`Included ${name}`);
      }
    }

    // ── 3) Manifest ────────────────────────────────────────────────────────
    const dumpSha = await sha256File(dumpPath);
    const manifest = {
      appVersion: process.env.npm_package_version ?? "2.0.0",
      schemaMigration: migration[0]?.migration_name ?? null,
      createdAt: new Date().toISOString(),
      database: { name: db.database, format: "pg_dump-Fc", sha256: dumpSha, sizeBytes: dumpStat.size },
      target: target ? { id: target.id, kind: target.kind, name: target.name } : null,
      files: ["database.dump", "config/"],
    };
    await fs.writeFile(path.join(absDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // ── 4) Tar bundle ──────────────────────────────────────────────────────
    const tarName = `oltflow-backup-${stamp}.tar.gz`;
    const tarPath = path.join(absDir, tarName);
    const tar = await runCmd("tar", ["-czf", tarPath, "-C", absDir, "database.dump", "config", "manifest.json"]);
    if (tar.code !== 0) throw new Error(`tar failed: ${tar.stderr}`);
    const tarStat = await fs.stat(tarPath);
    const tarSha = await sha256File(tarPath);
    await logLine(`Archive ${tarName} · ${(tarStat.size / 1024 / 1024).toFixed(2)} MB · sha256=${tarSha.slice(0, 16)}…`);

    // ── 5) Deliver to target ───────────────────────────────────────────────
    if (kind === "ssh" && target) {
      await deliverSsh(cfg as SshConfig, tarPath, tarName, logLine);
    } else if (kind === "local" && cfg.path) {
      const destRoot = path.isAbsolute(cfg.path!) ? cfg.path! : path.join(BACKUP_DIR, cfg.path!);
      await fs.mkdir(destRoot, { recursive: true });
      const dest = path.join(destRoot, tarName);
      await fs.copyFile(tarPath, dest);
      await logLine(`Copied to local target: ${dest}`);
    }

    // Retention prune for this target
    if (target?.retention) {
      await applyRetention(target.id, target.retention as { keepLast?: number }, logLine);
    }

    await prisma.backupRun.update({
      where: { id: runId },
      data: {
        status: "success",
        path: relDir,
        sizeBytes: BigInt(tarStat.size),
        sha256: tarSha,
        manifest,
        finishedAt: new Date(),
        log: lines.join("\n").slice(-50_000),
      },
    });
    if (target) {
      await prisma.backupTarget.update({
        where: { id: target.id },
        data: { lastRunAt: new Date() },
      });
    }

    await notifyEvent({
      eventType: "backup.completed",
      severity: "info",
      title: `Backup OK · ${tarName}`,
      body: `Size ${(tarStat.size / 1024 / 1024).toFixed(1)} MB · sha256 ${tarSha.slice(0, 12)}…`,
      detail: { runId, path: relDir },
    });

    log.info({ runId, path: relDir, size: tarStat.size }, "backup completed");
    return { ok: true, path: relDir, sha256: tarSha, sizeBytes: tarStat.size };
  } catch (err) {
    const message = (err as Error).message;
    await logLine(`ERROR: ${message}`);
    await prisma.backupRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        error: message,
        finishedAt: new Date(),
        log: lines.join("\n").slice(-50_000),
      },
    });
    await notifyEvent({
      eventType: "backup.failed",
      severity: "critical",
      title: "Backup dështoi",
      body: message,
      detail: { runId },
    });
    log.error({ runId, err: message }, "backup failed");
    throw err;
  }
}

async function deliverSsh(
  cfg: SshConfig,
  localFile: string,
  remoteName: string,
  logLine: (s: string) => Promise<string>
): Promise<void> {
  if (!cfg.host || !cfg.user || !cfg.remotePath) {
    throw new Error("SSH target incomplete (host/user/remotePath)");
  }
  const port = String(cfg.port ?? 22);
  const remote = `${cfg.user}@${cfg.host}:${cfg.remotePath.replace(/\/$/, "")}/${remoteName}`;
  await logLine(`SCP → ${remote}`);

  const tmpKey = cfg.privateKey
    ? path.join("/tmp", `oltflow-backup-key-${Date.now()}`)
    : null;
  try {
    const scpArgs = ["-P", port, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes"];
    if (tmpKey && cfg.privateKey) {
      await fs.writeFile(tmpKey, cfg.privateKey, { mode: 0o600 });
      scpArgs.push("-i", tmpKey);
    }
    scpArgs.push(localFile, remote);
    const env: Record<string, string> = {};
    // Password auth via sshpass if available; prefer key.
    if (cfg.password && !cfg.privateKey) {
      const has = await runCmd("which", ["sshpass"]);
      if (has.code === 0) {
        const r = await runCmd("sshpass", ["-p", cfg.password, "scp", ...scpArgs]);
        if (r.code !== 0) throw new Error(`scp failed: ${r.stderr}`);
        await logLine("SCP OK (password)");
        return;
      }
      throw new Error("SSH password requires sshpass or use a private key");
    }
    const r = await runCmd("scp", scpArgs, env);
    if (r.code !== 0) throw new Error(`scp failed: ${r.stderr || r.stdout}`);
    await logLine("SCP OK");
  } finally {
    if (tmpKey) await fs.unlink(tmpKey).catch(() => {});
  }
}

async function applyRetention(
  targetId: number,
  retention: { keepLast?: number },
  logLine: (s: string) => Promise<string>
): Promise<void> {
  const keep = retention.keepLast ?? 7;
  if (keep < 1) return;
  const success = await prisma.backupRun.findMany({
    where: { targetId, status: { in: ["success", "verified"] } },
    orderBy: { startedAt: "desc" },
  });
  const drop = success.slice(keep);
  for (const r of drop) {
    if (r.path) {
      const abs = path.join(BACKUP_DIR, r.path);
      await fs.rm(abs, { recursive: true, force: true }).catch(() => {});
    }
    await prisma.backupRun.delete({ where: { id: r.id } }).catch(() => {});
  }
  if (drop.length) await logLine(`Retention: removed ${drop.length} old run(s), keep ${keep}`);
}

/** Verify checksum of stored archive and optionally list dump TOC. */
export async function handleBackupVerify(payload: BackupVerifyPayload): Promise<unknown> {
  const run = await prisma.backupRun.findUnique({ where: { id: payload.runId } });
  if (!run || !run.path) throw new Error("Backup run not found or has no path");
  const absDir = path.join(BACKUP_DIR, run.path);
  const files = await fs.readdir(absDir);
  const tar = files.find((f) => f.endsWith(".tar.gz"));
  if (!tar) throw new Error("Archive not found on disk");
  const tarPath = path.join(absDir, tar);
  const sha = await sha256File(tarPath);
  if (run.sha256 && run.sha256 !== sha) {
    throw new Error(`Checksum mismatch: expected ${run.sha256}, got ${sha}`);
  }
  // List custom dump TOC if database.dump still present
  const dumpPath = path.join(absDir, "database.dump");
  let tocPreview = "";
  if (existsSync(dumpPath)) {
    const list = await runCmd("pg_restore", ["-l", dumpPath]);
    tocPreview = list.stdout.split("\n").slice(0, 20).join("\n");
  }
  await prisma.backupRun.update({
    where: { id: run.id },
    data: { status: "verified", verifiedAt: new Date() },
  });
  return { ok: true, sha256: sha, tocPreview };
}

/** Encrypt target config for storage. */
export function encryptBackupConfig(config: object): string {
  if (!OLT_CRED_KEY) throw new Error("OLT_CRED_KEY required to store backup target secrets");
  return encryptSecret(JSON.stringify(config), OLT_CRED_KEY);
}

export function decryptBackupConfigPublic(configEnc: string): Record<string, unknown> {
  const raw = decryptTargetConfig(configEnc) as unknown as Record<string, unknown>;
  const out = { ...raw };
  if (typeof out.password === "string" && out.password) out.password = "••••••••";
  if (typeof out.privateKey === "string" && out.privateKey) {
    out.privateKey = "••••••••";
    out.privateKeySet = true;
  }
  return out;
}

export { BACKUP_DIR };
