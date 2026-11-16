/**
 * `npm run models`: list the Gemini models this API key can use, so
 * GEMINI_CHAT_MODEL and GEMINI_EMBED_MODEL can be set to IDs that really exist.
 */
import "./env";
import { chatModel, embedModel, listModels } from "../src/lib/gemini";

async function main() {
  const models = await listModels();
  const chat = models.filter((m) => m.methods.includes("generateContent")).map((m) => m.name);
  const embed = models.filter((m) => m.methods.some((x) => x.toLowerCase().includes("embed"))).map((m) => m.name);

  console.log("Chat models (generateContent):");
  for (const name of chat) console.log(`  ${name}`);
  console.log("\nEmbedding models:");
  for (const name of embed) console.log(`  ${name}`);

  console.log(`\nConfigured chat model:  ${chatModel()}  ${chat.includes(chatModel()) ? "OK" : "NOT AVAILABLE to this key"}`);
  console.log(`Configured embed model: ${embedModel()}  ${embed.includes(embedModel()) ? "OK" : "NOT AVAILABLE to this key"}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
