import { expect,test,type Page } from "@playwright/test";

const base=process.env.BASE_PATH||"";
const date="2026-11-24T01:10:00.000Z";
const flood={id:"F-LOCAL-CLOSURE",route_no:"43",section_name:"ช่วงน้ำท่วมทดสอบ",km_start:"5+000",km_end:"6+000",lat_start:6.821,lon_start:101.233,
  lat_end:6.825,lon_end:101.244,coordinates_json:[[101.233,6.821],[101.244,6.825]],water_level_cm:50,traffic_status:"CLOSED",
  latest_photo_url:"",is_active:true,updated_at:date,direction_meta:{}};
const detour={id:"D-LOCAL-CLOSURE",is_active:true,geometry_revision:2,updated_at:date,direction_mode:"FORWARD_ONLY",flood_id_ref:flood.id,
  route_name:"ทางเลี่ยงประกอบข้อมูล",lon_start:101.202,lat_start:6.816,lon_end:101.294,lat_end:6.838,
  coordinates_json:[[101.202,6.816],[101.223,6.79],[101.294,6.838]],description:"เลี่ยงช่วงปิด"};
const payload={updatedAt:date,floodRoutes:[flood],detourRoutes:[detour],highwayLayers:[],offices:[],
  timelineUpdates:[],mitigationProjects:[],systemSettings:{name:"ระบบทดสอบ",org:"ปัตตานี",phone:"1586"}};
const goodPhoto=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");

async function fixture(page:Page,origin:string,unexpected:string[]) {
  await page.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());
    if (url.origin===origin) return route.continue();
    if(url.pathname.endsWith("/functions/v1/hdms-api")) {
      const request=req.postDataJSON();
      if(request?.action==="snapRouteAction") return route.fulfill({json:request.args});
      if(["getPublicSystemDataAction","getSystemDataAction","getAdminOperationalDataAction","getAdminStaticGisDataAction"].includes(request?.action)) return route.fulfill({json:payload});
      unexpected.push(request?.action || "unexpected HDMS request");
      return route.fulfill({status:400,json:{error:"unexpected action"}});
    }
    if (/auth\/v1|traffic.closure|storage\/v1/.test(url.pathname)) unexpected.push(url.pathname);
    return route.abort();
  });
}
async function open(page:Page,isMobile:boolean) {
  await page.goto(base+"/admin/");
  const menu=page.getByRole("button",{name:"รายการเหตุการณ์",exact:true});
  if(!await menu.isVisible()&&isMobile) await page.getByRole("button",{name:"เมนู",exact:true}).click();
  await menu.click();
  await page.getByRole("button",{name:/กางดูช่วงย่อยทั้งหมด.*ช่วงน้ำท่วมทดสอบ/}).click();
  await page.getByRole("button",{name:"รายละเอียด",exact:true}).first().click();
  return page.getByRole("region",{name:"ข้อมูลปิดการจราจร"});
}

test("closure details, map and photo persist locally and appear on both pages only in the recording browser",async({ page,context,browser,isMobile,baseURL })=>{
  const unexpected:string[]=[],origin=new URL(baseURL!).origin;
  await fixture(page,origin,unexpected);
  const section=await open(page,isMobile);
  await section.getByRole("button",{name:"กรอกข้อมูลปิดการจราจร"}).click();
  const save=section.getByRole("button",{name:"บันทึกข้อมูลปิดการจราจร"});
  await save.click();
  await expect(section.getByRole("status")).toContainText("ปักหมุด A และ B");
  const map=section.getByTestId("local-closure-map").locator(".leaflet-container");
  await expect(map).toBeVisible();
  for(const [side,x,y] of [["A",45,90],["B",145,150]] as const){
    await section.getByRole("button",{name:`ปักจุด ${side}`}).click();
    await expect(section.getByText(`แตะแผนที่เพื่อปักจุด ${side}`)).toBeVisible();
    await map.click({position:{x,y}});
    await expect(section.getByText(`แตะแผนที่เพื่อปักจุด ${side}`)).toHaveCount(0);
    await section.getByLabel(`หลัก กม. ${side}`).fill(side==="A"?"0+000":"12+000");
    await section.getByLabel(`พื้นที่ ${side}`).fill(`พื้นที่ ${side} สำหรับทดสอบ`);
    await section.getByLabel(`จุดสังเกต ${side}`).fill(`จุดสังเกต ${side}`);
  }
  await section.getByRole("button",{name:"หาแนวถนน A–B"}).click();
  await expect(section.getByText("แสดงแนวจากระบบแล้ว",{exact:false})).toBeVisible();
  await section.getByLabel("เริ่มปิด (วันและเวลาไทย)").fill("2026-11-24T08:10");
  await section.getByLabel("เหตุผลที่ปิด").fill("ระดับน้ำสูง");
  await section.getByLabel("รายละเอียดเพิ่มเติม").fill("ข้อสังเกตจากพื้นที่");
  await section.getByRole("checkbox",{name:"ทางเลี่ยงประกอบข้อมูล"}).check();
  await section.getByLabel("แนบรูปจุด A").setInputFiles({name:"local.png",mimeType:"image/png",buffer:goodPhoto});
  await expect(section.getByRole("img",{name:"รูปจุดปิด A"})).toBeVisible();
  await save.click();
  await expect(section.getByRole("status")).toContainText("บันทึกข้อมูลในเบราว์เซอร์นี้แล้ว");
  const link=section.getByRole("link",{name:"ดูบนแผนที่หน้าประชาชน"});
  const href=await link.getAttribute("href");
  expect(href).toContain("?closure-view=");
  const publicPage=await context.newPage();
  await fixture(publicPage,origin,unexpected);
  await publicPage.goto(href!);
  await expect(publicPage.getByRole("heading",{name:"ข้อมูลปิดการจราจร"})).toBeVisible();
  await expect(publicPage.getByText("ปิดทั้งสองทิศทาง · กม. 0+000 ถึง กม. 12+000")).toBeVisible();
  await expect(publicPage.getByTestId("local-closure-map").locator(".leaflet-container")).toBeVisible();
  await expect(publicPage.getByRole("img",{name:"รูปจุดปิด A"})).toBeVisible();
  await expect(publicPage.getByText("ทางเลี่ยงประกอบข้อมูล",{exact:true})).toBeVisible();
  const reread=await open(page,isMobile);
  await reread.getByRole("button",{name:"แก้ไขข้อมูลปิดการจราจร"}).click();
  await expect(reread.getByLabel("เหตุผลที่ปิด")).toHaveValue("ระดับน้ำสูง");
  await expect(reread.getByLabel("หลัก กม. B")).toHaveValue("12+000");
  await publicPage.goto(base+"/");
  await expect(publicPage.getByRole("heading",{name:"ข้อมูลปิดการจราจร"})).toHaveCount(0);
  const other=await browser.newContext();
  try {
    const outside=await other.newPage();await fixture(outside,origin,unexpected);
    await outside.goto(new URL(href!,origin).toString());
    await expect(outside.getByText("ไม่พบข้อมูลในเบราว์เซอร์นี้", {exact:false})).toBeVisible();
    await expect(outside.getByText("ระดับน้ำสูง",{exact:true})).toHaveCount(0);
  } finally {await other.close();}
  expect(unexpected).toEqual([]);
});
