import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // el tamaño recomendado para GCM
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta APP_ENCRYPTION_KEY. Generar con: openssl rand -base64 32",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY debe ser de 32 bytes en base64 (son ${key.length}).`,
    );
  }
  return key;
}

/**
 * Cifra un secreto para guardarlo en la tabla `settings`.
 *
 * RLS ya impide que otro usuario lea la fila; esto suma la segunda capa: que un
 * dump de la base tampoco sirva de nada.
 *
 * Formato: base64( iv[12] · authTag[16] · ciphertext )
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** Descifra un valor producido por encrypt(). Lanza si fue alterado. */
export function decrypt(payload: string): string {
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Valor cifrado inválido");
  }

  const iv = buffer.subarray(0, IV_BYTES);
  const authTag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

/** `apify_api_xxxx…9f2a` — lo único del secreto que puede volver al cliente. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 10)}••••${value.slice(-4)}`;
}

/** Comparación en tiempo constante, para secretos que llegan por URL. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual lanza si difieren en largo, y el largo no es secreto.
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
