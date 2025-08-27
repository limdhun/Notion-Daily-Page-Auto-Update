const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_DATABASE_ID;

function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

(async () => {
  // 제목 속성 자동 탐지
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const titleProp = Object.entries(db.properties)
    .find(([, def]) => def.type === "title")?.[0];
  if (!titleProp) throw new Error("title 속성을 찾을 수 없음");

  // 페이지 생성
  await notion.pages.create({
    parent: { database_id: DB_ID },
    properties: { [titleProp]: { title: [{ text: { content: todayKST() } }] } },
    children: Array.from({ length: 9 }).map((_, i) => ({
      object: "block",
      type: "to_do",
      to_do: { rich_text: [{ text: { content: `할 일 ${i + 1}` } }], checked: false }
    }))
  });

  console.log("OK");
})().catch(err => {
  console.error("STATUS:", err.status, "CODE:", err.code, "MSG:", err.message);
  if (err.body) console.error("BODY:", JSON.stringify(err.body));
  process.exit(1);
});
