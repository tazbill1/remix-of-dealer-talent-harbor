/** Plain text from a Word (.docx) file, given as base64. */
export async function docxText(b64: string) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That Word file looks empty or damaged.");
  return strFromU8(xml).replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
