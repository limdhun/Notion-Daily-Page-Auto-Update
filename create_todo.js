const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_DATABASE_ID;

// 원하는 체크리스트로 수정
const TASKS = [
  "할 일 1","할 일 2","할 일 3","할 일 4","할 일 5",
  "할 일 6","할 일 7","할 일 8","할 일 9"
];

function nowKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function todayYMD_KST() {
  const d = nowKST();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`; // YYYY-MM-DD
}

(async () => {
  // 1) 주말 건너뛰기
  const dow = nowKST().getUTCDay(); // 0=일, 6=토 (KST 기준)
  if (dow === 0 || dow === 6) {
    console.log("SKIP: weekend");
    process.exit(0);
  }

  const ymd = todayYMD_KST();

  // 2) DB 메타에서 제목/날짜 속성 자동 탐지
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const titleProp = Object.entries(db.properties)
    .find(([, def]) => def.type === "title")?.[0];
  if (!titleProp) throw new Error("title 속성을 찾을 수 없음");
  const dateProp = Object.entries(db.properties)
    .find(([, def]) => def.type === "date")?.[0]; // 없을 수 있음

  // 3) 중복 생성 방지
  const filter = dateProp
    ? { property: dateProp, date: { equals: ymd } }
    : { property: titleProp, title: { equals: ymd } };

  const existed = await notion.databases.query({ database_id: DB_ID, filter });
  if (existed.results.length > 0) {
    console.log("SKIP: already exists for", ymd);
    process.exit(0);
  }

  // 4) 속성 구성
  const properties = { [titleProp]: { title: [{ text: { content: ymd } }] } };
  if (dateProp) properties[dateProp] = { date: { start: ymd } };

  // 5) 페이지 생성
  await notion.pages.create({
    parent: { database_id: DB_ID },
    properties,
    children: TASKS.map((text) => ({
      object: "block",
      type: "to_do",
      to_do: { rich_text: [{ text: { content: text } }], checked: false },
    })),
  });

  console.log("OK:", ymd);
})().catch((err) => {
  console.error("STATUS:", err.status);
  console.error("CODE:", err.code);
  console.error("MSG:", err.message);
  if (err.body) console.error("BODY:", JSON.stringify(err.body));
  process.exit(1);
});
