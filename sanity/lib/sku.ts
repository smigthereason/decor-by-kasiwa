/**
 * Decor by Kasiwa product SKU helpers.
 *
 * SKU format: DBK-{PRODUCT_INITIALS}-{STABLE_CODE}
 * Example: Ceramic Pineapple Vase -> DBK-CPV-8H2KQ1
 *
 * The stable code is derived from the Sanity document ID, so once generated
 * the SKU does not need to change if the product name changes later.
 */

function productInitials(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];

  if (words.length === 0) return "ITEM";

  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase().padEnd(2, "X");
  }

  return words
    .slice(0, 4)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function stableCode(value: string): string {
  // FNV-1a 32-bit hash. Deterministic and dependency-free.
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0")
    .slice(-6);
}

export function generateProductSku(name: string, documentId: string): string {
  const cleanName = name.trim();
  const cleanDocumentId = documentId.replace(/^drafts\./, "").trim();

  if (!cleanName || !cleanDocumentId) return "";

  return `DBK-${productInitials(cleanName)}-${stableCode(cleanDocumentId)}`;
}
