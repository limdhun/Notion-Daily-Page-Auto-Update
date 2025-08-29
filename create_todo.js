const { Client } = require("@notionhq/client");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;
const SRC_PAGE = process.env.NOTION_SOURCE_PAGE_ID; // 템플릿로부터 만든 "원본 페이지"의 ID

// ===== 필수 환경변수 검사 =====
if (!NOTION_TOKEN) throw new Error("NOTION_TOKEN is missing");
if (!DB_ID) throw new Error("NOTION_DATABASE_ID is missing");
if (!SRC_PAGE) throw new Error("NOTION_SOURCE_PAGE_ID is missing");

const notion = new Client({ auth: NOTION_TOKEN });

// ===== KST 날짜 유틸 =====
function nowKST() { return new Date(Date.now() + 9 * 60 * 60 * 1000); }
function todayYMD_KST() {
  const d = nowKST();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`; // YYYY-MM-DD
}

// ===== Notion 헬퍼 =====
async function listChildren(blockId) {
  const out = [];
  let cursor;
  do {
    const r = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

// 복사 허용 블록 타입만 화이트리스트
const ALLOW = new Set([
  "to_do", "paragraph", "bulleted_list_item", "numbered_list_item",
  "heading_1", "heading_2", "heading_3", "toggle",
  "divider", "quote", "callout"
]);

async function copyBlockTree(block, depth = 10) {
  const type = block.type;
  if (!ALLOW.has(type)) return null;

  // 블록 본문 복사
  const node = { object: "block", type };
  node[type] = JSON.parse(JSON.stringify(block[type]));

  // to_do는 매일 미체크 초기화
  if (type === "to_do") node[type].checked = false;

  // 자식 재귀 복사
  if (block.has_children && depth > 0) {
    const kids = await listChildren(block.id);
    const copiedKids = [];
    for (const k of kids) {
      const c = await copyBlockTree(k, depth - 1);
      if (c) copiedKids.push(c);
    }
    if (copiedKids.length) node.children = copiedKids;
  }

  return node;
}

(async () => {
  // 1) 주말 스킵 (0=일, 6=토)
  const dow = nowKST().getUTCDay();
  if (dow === 0 || dow === 6) {
    console.log("SKIP: weekend");
    process.exit(0);
  }

  const ymd = todayYMD_KST();

  // 2) DB 메타에서 제목/날짜 속성 자동 탐지
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const titleProp = Object.entries(db.properties).find(([, def]) => def.type === "title")?.[0];
  if (!titleProp) throw new Error("title 속성을 찾을 수 없음");
  const dateProp = Object.entries(db.properties).find(([, def]) => def.type === "date")?.[0]; // 없을 수 있음

  // 3) 중복 생성 방지
  const filter = dateProp
    ? { property: dateProp, date: { equals: ymd } }
    : { property: titleProp, title: { equals: ymd } };

  const existed = await notion.databases.query({ database_id: DB_ID, filter });
  if (existed.results.length > 0) {
    console.log("SKIP: already exists for", ymd);
    process.exit(0);
  }

  // 4) 원본 페이지(템플릿으로부터 만든 일반 페이지)의 블록 트리 복사
  const top = await listChildren(SRC_PAGE);
  const children = (await Promise.all(top.map(b => copyBlockTree(b)))).filter(Boolean);

  // 5) 속성 구성
  const properties = { [titleProp]: { title: [{ text: { content: ymd } }] } };
  if (dateProp) properties[dateProp] = { date: { start: ymd } };

  // 6) 새 항목 생성
  await notion.pages.create({
    parent: { database_id: DB_ID },
    properties,
    children
  });

  console.log("OK:", ymd);
})().catch(err => {
  console.error("STATUS:", err.status);
  console.error("CODE:", err.code);
  console.error("MSG:", err.message);
  if (err.body) console.error("BODY:", JSON.stringify(err.body));
  process.exit(1);
});
