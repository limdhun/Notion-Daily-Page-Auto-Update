// create_todo.js (템플릿 원본 복제형 + 주말 스킵 + 중복 방지)
const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB_ID = process.env.NOTION_DATABASE_ID;
const SRC_PAGE = process.env.NOTION_SOURCE_PAGE_ID;

function nowKST(){ return new Date(Date.now() + 9*60*60*1000); }
function todayYMD(){ const d=nowKST(); const y=d.getUTCFullYear();
  const m=String(d.getUTCMonth()+1).padStart(2,"0");
  const da=String(d.getUTCDate()).padStart(2,"0"); return `${y}-${m}-${da}`; }

async function listChildrenOnce(blockId){
  const out=[]; let cursor;
  do{
    const r=await notion.blocks.children.list({ block_id:blockId, start_cursor:cursor });
    out.push(...r.results); cursor=r.has_more? r.next_cursor: undefined;
  } while(cursor);
  return out;
}

function shallowCopy(block){
  const allow=["to_do","paragraph","bulleted_list_item","numbered_list_item","heading_1","heading_2","heading_3","toggle","divider","quote","callout"];
  const t=allow.find(k=>block[k]); if(!t) return null;
  const clone=JSON.parse(JSON.stringify(block[t]));
  if(t==="to_do") clone.checked=false; // 매일 미체크 초기화
  return { object:"block", type:t, [t]:clone };
}

(async () => {
  // 주말 스킵
  const dow = nowKST().getUTCDay(); // 0=일,6=토
  if (dow===0 || dow===6){ console.log("SKIP: weekend"); process.exit(0); }

  const ymd = todayYMD();

  // DB 메타 → 제목/날짜 속성 자동 탐지
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const titleProp = Object.entries(db.properties).find(([,def])=>def.type==="title")?.[0];
  if(!titleProp) throw new Error("title 속성을 찾을 수 없음");
  const dateProp  = Object.entries(db.properties).find(([,def])=>def.type==="date")?.[0];

  // 중복 방지
  const filter = dateProp ? { property: dateProp, date: { equals: ymd } }
                          : { property: titleProp, title: { equals: ymd } };
  const existed = await notion.databases.query({ database_id: DB_ID, filter });
  if (existed.results.length>0){ console.log("SKIP: already exists", ymd); process.exit(0); }

  // 원본 페이지 블록 읽기 → 얕은 복사
  const children = (await listChildrenOnce(SRC_PAGE)).map(shallowCopy).filter(Boolean);

  // 속성 구성
  const properties = { [titleProp]: { title: [{ text: { content: ymd } }] } };
  if (dateProp) properties[dateProp] = { date: { start: ymd } };

  // 생성
  await notion.pages.create({
    parent: { database_id: DB_ID },
    properties,
    children
  });

  console.log("OK:", ymd);
})().catch(err=>{
  console.error("STATUS:", err.status);
  console.error("CODE:", err.code);
  console.error("MSG:", err.message);
  if (err.body) console.error("BODY:", JSON.stringify(err.body));
  process.exit(1);
});
