const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB_ID = process.env.NOTION_DATABASE_ID;
// DB의 제목 속성명을 정확히 적는다. 보통 "Name" 또는 "제목".
const TITLE_PROP = "Name";

function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}

(async () => {
  const title = todayKST();

  await notion.pages.create({
    parent: { database_id: DB_ID },
    properties: { [TITLE_PROP]: { title: [{ text: { content: title } }] } },
    children: [
      "할 일 1","할 일 2","할 일 3","할 일 4","할 일 5",
      "할 일 6","할 일 7","할 일 8","할 일 9"
    ].map(text => ({
      object: "block",
      type: "to_do",
      to_do: { rich_text: [{ text: { content: text } }], checked: false }
    }))
  });
})().catch(e => { console.error(e); process.exit(1); });
