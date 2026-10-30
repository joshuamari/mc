"use server";

import { getCurrentUser } from "@/lib/auth";
import { manilaDate } from "@/lib/accounts";
import {
  BACKUP_TABLES,
  backupDocument,
  backupFilename,
  serializeBackup,
} from "@/lib/backup";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export type ExportBackupState =
  | { error: string }
  | { filename: string; json: string }
  | null;

export async function exportBackup(
  _state: ExportBackupState,
  _formData: FormData,
): Promise<ExportBackupState> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const tables: Record<string, unknown[]> = {};

  for (const table of BACKUP_TABLES) {
    const loaded = await loadTable(supabase, table, user.id);
    if (loaded.error) {
      return { error: "The backup could not be prepared." };
    }
    tables[table.name] = loaded.rows;
  }

  const exportedOn = manilaDate(new Date());
  const document = backupDocument({
    exportedOn,
    accountEmail: user.email,
    tables,
  });

  return {
    filename: backupFilename(exportedOn),
    json: serializeBackup(document),
  };
}

async function loadTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: (typeof BACKUP_TABLES)[number],
  userId: string,
): Promise<{ rows: unknown[]; error: string | null }> {
  const rows: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from(table.name)
      .select("*")
      .eq(table.ownerColumn, userId)
      .order(table.orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { rows: [], error: error.message };
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) {
      return { rows, error: null };
    }
  }

  return { rows: [], error: "The backup could not be prepared." };
}
