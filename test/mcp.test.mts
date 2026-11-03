// The MCP server's surface, over an in-memory connection: what a client
// sees before any tool touches the database, and the planning card's page.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { Client, InMemoryTransport } = await import("@modelcontextprotocol/client");
const { createSunwalksServer, CARD_URI } = await import("../src/mcp/server");
const { planningCardHtml } = await import("../src/mcp/card-html");

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createSunwalksServer();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" }, { capabilities: { elicitation: { form: {} } } });
  await client.connect(clientSide);
  return client;
}

test("the server offers the planning tools, the card, and the two prompts", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["find_photos", "forecast_accuracy", "list_spots", "log_walk", "recommend_walk"]);
  const recommend = tools.find((t) => t.name === "recommend_walk")!;
  assert.equal((recommend._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri, CARD_URI);
  assert.ok(recommend.outputSchema, "the card reads structured output");

  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ["how-was-it", "plan-tomorrow"]);
  const howWasIt = await client.getPrompt({ name: "how-was-it", arguments: { notes: "pink for ten minutes" } });
  const message = howWasIt.messages[0].content;
  assert.ok(message.type === "text" && message.text.includes("pink for ten minutes"));

  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map((t) => t.uriTemplate).sort(), ["sunwalks://photo/{id}", "sunwalks://spot/{name}"]);
  await client.close();
});

test("the plan is advice: nothing on the card commits to a spot", async () => {
  const html = await planningCardHtml();
  assert.match(html, /^<!doctype html>/);
  assert.ok(!/<\/script/i.test(html.slice(html.indexOf("<script type=\"module\">") + 22, html.lastIndexOf("</script>"))), "the bundle can't close its script early");
  assert.match(html, /A suggestion\. Report where you went in the morning\./);
  assert.doesNotMatch(html, /callServerTool\(\{name:"log_walk"/);
});
