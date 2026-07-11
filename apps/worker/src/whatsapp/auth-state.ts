import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { prisma } from "@oltflow/db";
import { encryptSecret, decryptSecret } from "@oltflow/core";

/**
 * DB-backed, AES-GCM-encrypted Baileys auth state — the Postgres equivalent of
 * Baileys' `useMultiFileAuthState`. One row "creds", one per signal key. The blob
 * is a full WhatsApp session, so it is always stored encrypted with OLT_CRED_KEY.
 */

function credKey(): string {
  const k = process.env.OLT_CRED_KEY;
  if (!k) throw new Error("OLT_CRED_KEY nuk është konfiguruar (WhatsApp auth)");
  return k;
}

async function readData<T>(id: string): Promise<T | null> {
  const row = await prisma.whatsappAuth.findUnique({ where: { id } });
  if (!row) return null;
  try {
    return JSON.parse(decryptSecret(row.data, credKey()), BufferJSON.reviver) as T;
  } catch {
    return null;
  }
}

async function writeData(id: string, value: unknown): Promise<void> {
  const data = encryptSecret(JSON.stringify(value, BufferJSON.replacer), credKey());
  await prisma.whatsappAuth.upsert({ where: { id }, create: { id, data }, update: { data } });
}

async function removeData(id: string): Promise<void> {
  await prisma.whatsappAuth.deleteMany({ where: { id } });
}

export interface DbAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}

export async function useDbAuthState(): Promise<DbAuthState> {
  const creds: AuthenticationCreds = (await readData<AuthenticationCreds>("creds")) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData<SignalDataTypeMap[T]>(`key:${type}:${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(
                  value
                ) as unknown as SignalDataTypeMap[T];
              }
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const cat = data[category as keyof typeof data];
            for (const id in cat) {
              const value = cat[id];
              const rid = `key:${category}:${id}`;
              tasks.push(value ? writeData(rid, value) : removeData(rid));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
    clear: () => prisma.whatsappAuth.deleteMany({}).then(() => undefined),
  };
}
