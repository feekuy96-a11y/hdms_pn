import { expect,test,type Page } from "@playwright/test";

const base=process.env.BASE_PATH||"";
const date="2026-11-24T01:10:00.000Z";
const flood={id:"F-LOCAL-CLOSURE",route_no:"43",section_name:"ช่วงน้ำท่วมทดสอบ",km_start:"5+000",km_end:"6+000",lat_start:5.811,lon_start:101.233,
  lat_end:5.815,lon_end:101.244,coordinates_json:[[101.233,5.811],[101.244,5.815]],water_level_cm:50,traffic_status:"CLOSED",
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
  if(isMobile&&process.env.HDMS_CLOSURE_NARROW==="1") await page.setViewportSize({width:360,height:800});
  await fixture(page,origin,unexpected);
  const section=await open(page,isMobile);
  await section.getByRole("button",{name:"กรอกข้อมูลปิดการจราจร"}).click();
  const save=section.getByRole("button",{name:"บันทึกข้อมูลปิดการจราจร"});
  const actionBar=section.locator("[data-hdms-sticky-actions]");
  await expect(actionBar).toHaveCSS("position","sticky");
  await expect(actionBar).toBeInViewport();
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await save.click();
  await expect(section.getByRole("status")).toContainText("ปักหมุด A และ B");
  const map=section.getByTestId("local-closure-map").locator(".leaflet-container");
  await expect(map).toBeVisible();
  for(const [side,x,y] of [["A",45,90],["B",145,150]] as const){
    await section.getByRole("button",{name:`ปักจุด ${side}`}).click();
    await expect(section.getByText(`แตะแผนที่เพื่อปักจุด ${side}`)).toBeVisible();
    await map.click({position:{x,y}});
    await expect(section.getByText(`แตะแผนที่เพื่อปักจุด ${side}`)).toHaveCount(0);
    await section.getByLabel(`พื้นที่ ${side}`).fill(`พื้นที่ ${side} สำหรับทดสอบ`);
    await section.getByLabel(`จุดสังเกต ${side}`).fill(`จุดสังเกต ${side}`);
  }
  await expect(map.locator(".doh-draft-endpoint")).toHaveCount(2);
  await expect(map.locator(".doh-draft-endpoint.leaflet-marker-draggable")).toHaveCount(0);
  await section.getByRole("button",{name:"หาแนวถนน A–B"}).click();
  await expect(section.getByText("แสดงแนวจากระบบแล้ว",{exact:false})).toBeVisible();
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
  await expect(publicPage.getByText("ปิดทั้งสองทิศทาง",{exact:true})).toBeVisible();
  const savedMap=publicPage.getByTestId("local-closure-map").locator(".leaflet-container");
  await expect(savedMap).toBeVisible();
  await expect(savedMap.locator(".doh-draft-endpoint")).toHaveCount(2);
  await expect(savedMap.locator(".doh-draft-endpoint.leaflet-marker-draggable")).toHaveCount(0);
  await expect.poll(()=>savedMap.evaluate(el=>{
    const map=el.getBoundingClientRect();
    return [...el.querySelectorAll(".doh-draft-endpoint")].every(pin=>{
      const box=pin.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
      return x>=map.left&&x<=map.right&&y>=map.top&&y<=map.bottom;
    });
  })).toBe(true);
  const markerA=savedMap.getByRole("button",{name:"จุดปิด A",exact:true});
  const markerB=savedMap.getByRole("button",{name:"จุดปิด B",exact:true});
  const summary=savedMap.getByRole("button",{name:"ดูสรุปช่วงปิดการจราจร",exact:true});
  await expect(markerA.locator("svg")).toBeVisible();
  await expect(markerB.locator("svg")).toBeVisible();
  await markerA.click();
  await expect(publicPage.locator('[data-closure-popup="A"]')).toContainText("พื้นที่ A สำหรับทดสอบ");
  await publicPage.getByRole("button",{name:"ปิดรายละเอียดบนแผนที่"}).click();
  await markerB.click();
  await expect(publicPage.locator('[data-closure-popup="B"]')).toContainText("พื้นที่ B สำหรับทดสอบ");
  await publicPage.getByRole("button",{name:"ปิดรายละเอียดบนแผนที่"}).click();
  await summary.press("Enter");
  await expect(publicPage.locator('[data-closure-popup="SECTION"]')).toContainText("ผ่านไม่ได้ทั้งสองทิศทาง");
  const summaryPanel=publicPage.locator('[data-closure-popup="SECTION"]');
  await expect(summaryPanel).toContainText("ข้อสังเกตจากพื้นที่");
  await expect(summaryPanel).toHaveAttribute("data-hdms-popup","panel");
  const close=publicPage.getByRole("button",{name:"ปิดรายละเอียดบนแผนที่"});
  await expect(close).toBeFocused();
  expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await close.press("Escape");
  await expect(summaryPanel).toHaveCount(0);
  await expect(summary).toBeFocused();
  await expect(savedMap.locator(".doh-dir-arrow-icon")).toHaveCount(0);
  const readPopupPalette=()=>summaryPanel.evaluate(node=>[getComputedStyle(node).backgroundColor,getComputedStyle(node).color]);
  await summary.press("Enter");
  const light=await readPopupPalette();
  await publicPage.evaluate(()=>localStorage.setItem("hdms.citizen.theme","dark"));
  await publicPage.reload();
  await expect(publicPage.getByRole("main")).toHaveAttribute("data-citizen-theme","dark");
  await summary.press("Enter");
  const dark=await readPopupPalette();
  expect(dark[0]).not.toBe(light[0]);
  expect(dark[1]).not.toBe(light[1]);
  await publicPage.evaluate(()=>localStorage.removeItem("hdms.citizen.theme"));
  await expect(publicPage.getByRole("img",{name:"รูปจุดปิด A"})).toBeVisible();
  await expect(publicPage.getByText("ทางเลี่ยงประกอบข้อมูล",{exact:true})).toBeVisible();
  const reread=await open(page,isMobile);
  await reread.getByRole("button",{name:"แก้ไขข้อมูลปิดการจราจร"}).click();
  await expect(reread.getByLabel("เหตุผลที่ปิด")).toHaveValue("ระดับน้ำสูง");
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

test("closure highway mode slices the selected section and clears stale geometry when switching modes", async ({ page, isMobile }) => {
  const highwayLayers = [{
    layer_id: "MAIN_HIGHWAY", layer_name: "ทางหลวงสายหลัก", is_visible: true, metadata: {},
    geojson_data: { type: "FeatureCollection", features: [
      { type: "Feature", properties: { route_no: "43", section_group_id: "H-OWN", section_name: "ช่วงน้ำท่วมทดสอบ",
        km_start: "0+000", km_end: "12+000", direction_code: "A_TO_B", branch_type: "MAIN_CARRIAGEWAY" },
      geometry: { type: "LineString", coordinates: [[101.20,6.815],[101.235,6.82],[101.27,6.83]] } },
      { type: "Feature", properties: { route_no: "43", section_group_id: "H-NEXT", section_name: "ตอนถัดไป",
        km_start: "12+000", km_end: "16+000", direction_code: "A_TO_B", branch_type: "MAIN_CARRIAGEWAY" },
      geometry: { type: "LineString", coordinates: [[101.27,6.83],[101.30,6.84]] } },
    ]},
  }];
  const externalActions:string[]=[];
  await page.route("**/functions/v1/hdms-api*", async route => {
    const request=route.request().postDataJSON();
    if (!["getSystemDataAction","getAdminOperationalDataAction","getAdminStaticGisDataAction"].includes(request?.action)) {
      externalActions.push(request?.action ?? "unknown");
      return route.fulfill({status:400,json:{error:"unexpected action"}});
    }
    return route.fulfill({json:{...payload,highwayLayers}});
  });
  const section=await open(page,isMobile);
  await section.getByRole("button",{name:"กรอกข้อมูลปิดการจราจร"}).click();
  const highway=section.getByRole("radio",{name:"ทางหลวงในความรับผิดชอบ"});
  await highway.check();
  await section.getByLabel("หมายเลขทางหลวง",{exact:true}).selectOption("43");
  await section.getByLabel("ตอนควบคุม",{exact:true}).selectOption({label:"ช่วงน้ำท่วมทดสอบ"});
  const start=section.getByLabel("กม. เริ่มต้น (A)",{exact:true});
  const end=section.getByLabel("กม. สิ้นสุด (B)",{exact:true});
  const generate=section.getByRole("button",{name:"สร้างแนวจากช่วง กม."});
  await expect(start).toHaveValue("0+000");
  await expect(end).toHaveValue("12+000");
  await start.fill("1+000");
  await end.fill("13+000");
  await generate.click();
  await expect(section.getByRole("status")).toContainText("ไม่พบแนวที่ครอบคลุม");
  const marks=section.getByTestId("local-closure-map").locator(".doh-draft-endpoint");
  await expect(marks).toHaveCount(0);
  await end.fill("10+000");
  await generate.click();
  await expect(section.getByRole("status")).toContainText("สร้างแนวและหมุด A/B");
  await expect(marks).toHaveCount(2);
  await start.fill("2+000");
  await expect(marks).toHaveCount(0);
  await generate.click();
  await expect(marks).toHaveCount(2);
  await section.getByRole("button",{name:"ดัดแนวเส้น"}).click();
  const editorMap=section.getByTestId("local-closure-map");
  await editorMap.scrollIntoViewIfNeeded();
  await editorMap.locator(".doh-vertex-mid").first().click({timeout:6500});
  await expect(section.getByRole("button",{name:"ย้อนกลับ"})).toBeEnabled();
  await section.getByRole("button",{name:"ย้อนกลับ"}).click();
  await expect(section.getByRole("button",{name:"ย้อนกลับ"})).toBeDisabled();
  await section.getByRole("button",{name:"เสร็จสิ้นการดัดเส้น"}).click();
  for(const side of ["A","B"]){
    await section.getByLabel(`พื้นที่ ${side}`,{exact:true}).fill("พื้นที่ตรวจสอบ");
    await section.getByLabel(`จุดสังเกต ${side}`,{exact:true}).fill(`จุด ${side}`);
  }
  await section.getByLabel("เหตุผลที่ปิด",{exact:true}).fill("ตรวจสอบแนว");
  await section.getByLabel("รายละเอียดเพิ่มเติม",{exact:true}).fill("จนกว่าสถานการณ์จะคลี่คลาย");
  await section.getByRole("button",{name:"บันทึกข้อมูลปิดการจราจร"}).click();
  await expect(section.getByRole("status")).toContainText("บันทึกข้อมูลในเบราว์เซอร์นี้แล้ว");
  await section.getByRole("radio",{name:"ถนนทั่วไป · ปัก A/B"}).check();
  await expect(marks).toHaveCount(0);
  await expect(section.getByRole("button",{name:"ปักจุด A"})).toBeVisible();
  await expect(section.getByLabel("ตอนควบคุม",{exact:true})).toHaveCount(0);
  await expect(section.getByLabel(/กม\. เริ่มต้น|กม\. สิ้นสุด/)).toHaveCount(0);
  for(const [side,x,y] of [["A",45,90],["B",145,150]] as const){
    await section.getByRole("button",{name:`ปักจุด ${side}`}).click();
    await section.getByTestId("local-closure-map").locator(".leaflet-container").click({position:{x,y}});
  }
  const map=section.getByTestId("local-closure-map");
  await expect(marks).toHaveCount(2);
  const bPoint=section.getByRole("group",{name:"จุดสิ้นสุด B"}).getByText(/พิกัด:/);
  const bBefore=await bPoint.innerText();
  await section.getByRole("button",{name:"ย้ายจุด A"}).click();
  await map.locator(".leaflet-container").click({position:{x:80,y:115}});
  await expect(marks).toHaveCount(2);
  await expect(bPoint).toHaveText(bBefore);
  expect(externalActions).toEqual([]);
});
