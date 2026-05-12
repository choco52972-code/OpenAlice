import { existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { Logger } from './logger.js';

export interface TemplateMeta {
  readonly name: string;
  readonly description?: string;
  /** Absolute path to the template's `bootstrap.sh`. */
  readonly bootstrapScript: string;
  /** Absolute path to the template's `files/` directory (may not exist). */
  readonly filesDir: string;
  /**
   * Adapter ids the template wants enabled by default in new workspaces
   * (the create form pre-checks these). Sourced from `template.json`'s
   * `defaultAgents` key. Empty/missing → `['claude']` to preserve legacy
   * single-agent flow.
   */
  readonly defaultAgents: readonly string[];
}

/**
 * Discovers `server/templates/<name>/bootstrap.sh` directories at startup and
 * exposes them as named templates. Each template *must* have an executable
 * `bootstrap.sh`; everything else (`template.json` for metadata, `files/` for
 * static assets the script copies) is optional.
 *
 * Cached for the server's lifetime — templates don't change at runtime.
 */
export class TemplateRegistry {
  private readonly byName = new Map<string, TemplateMeta>();

  private constructor() {}

  static async load(dir: string, logger: Logger): Promise<TemplateRegistry> {
    const reg = new TemplateRegistry();
    const absDir = resolve(dir);
    if (!existsSync(absDir)) {
      logger.warn('templates.dir_missing', { dir: absDir });
      return reg;
    }
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const templateDir = join(absDir, name);
      const bootstrapScript = join(templateDir, 'bootstrap.sh');
      if (!existsSync(bootstrapScript)) {
        logger.warn('templates.no_bootstrap', { name, templateDir });
        continue;
      }
      const filesDir = join(templateDir, 'files');
      const tplMeta = await readTemplateMeta(join(templateDir, 'template.json'));
      const meta: TemplateMeta = {
        name,
        ...(tplMeta.description !== undefined ? { description: tplMeta.description } : {}),
        bootstrapScript,
        filesDir,
        defaultAgents: tplMeta.defaultAgents,
      };
      reg.byName.set(name, meta);
    }
    logger.info('templates.loaded', { dir: absDir, names: Array.from(reg.byName.keys()) });
    return reg;
  }

  /**
   * Register a synthetic template at runtime — used for the legacy
   * `AQ_BOOTSTRAP_SCRIPT` fallback so old configurations keep working
   * during the migration window.
   */
  registerSynthetic(meta: TemplateMeta): void {
    this.byName.set(meta.name, meta);
  }

  list(): TemplateMeta[] {
    return Array.from(this.byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): TemplateMeta | undefined {
    return this.byName.get(name);
  }

  /**
   * Name used when a client doesn't specify a template. Prefers `chat`
   * (the new MCP-injection demo) if available, otherwise falls back to the
   * first alphabetical template.
   */
  defaultName(): string | undefined {
    if (this.byName.has('chat')) return 'chat';
    const first = this.list()[0];
    return first?.name;
  }
}

interface ParsedTemplateMeta {
  readonly description?: string;
  readonly defaultAgents: readonly string[];
}

async function readTemplateMeta(path: string): Promise<ParsedTemplateMeta> {
  const fallback: ParsedTemplateMeta = { defaultAgents: ['claude'] };
  try {
    if (!statSync(path).isFile()) return fallback;
  } catch {
    return fallback;
  }
  try {
    const raw = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const obj = parsed as Record<string, unknown>;
    const description = typeof obj['description'] === 'string' ? obj['description'] : undefined;
    const defaultAgents = Array.isArray(obj['defaultAgents'])
      ? obj['defaultAgents'].filter((a): a is string => typeof a === 'string')
      : null;
    return {
      ...(description !== undefined ? { description } : {}),
      defaultAgents: defaultAgents && defaultAgents.length > 0 ? defaultAgents : ['claude'],
    };
  } catch {
    return fallback;
  }
}

