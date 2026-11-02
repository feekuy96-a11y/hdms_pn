/**
 * DOH Pattani GIS Master Static Datasets
 * สกัดข้อมูลสถิติและขอบเขตจำลองของ ๑๒ อำเภอ และข้อมูลตำบลสำคัญใน จ.ปัตตานี
 * เพื่อลดขนาดโมดูลคำนวณของ lib/gis-utils.ts ให้มีขนาดกะทัดรัดและโหลดเร็ว
 */

export const PATTANI_SUBDISTRICTS_DATA = [
  // อ.เมืองปัตตานี
  { tambon: "รูสะมิแล", village: "บ.รูสะมิแล", amphoe: "เมืองปัตตานี", bounds: [101.205, 6.848, 101.242, 6.885] },
  { tambon: "บานา", village: "บ.บานา", amphoe: "เมืองปัตตานี", bounds: [101.265, 6.855, 101.305, 6.895] },
  { tambon: "สะบารัง", village: "ชุมชนสะบารัง", amphoe: "เมืองปัตตานี", bounds: [101.240, 6.855, 101.265, 6.875] },
  { tambon: "อาเนาะรู", village: "ชุมชนหัวตลาด", amphoe: "เมืองปัตตานี", bounds: [101.242, 6.870, 101.265, 6.895] },
  { tambon: "จะบังติกอ", village: "ชุมชนจะบังติกอ", amphoe: "เมืองปัตตานี", bounds: [101.245, 6.835, 101.270, 6.858] },
  { tambon: "ตะลุโบะ", village: "บ.ดอนยาง", amphoe: "เมืองปัตตานี", bounds: [101.220, 6.820, 101.260, 6.850] },
  { tambon: "ปะกาฮะรัง", village: "บ.ปะกาฮะรัง", amphoe: "เมืองปัตตานี", bounds: [101.215, 6.835, 101.245, 6.865] },
  { tambon: "ตันหยงลุโละ", village: "บ.กรือเซะ", amphoe: "เมืองปัตตานี", bounds: [101.295, 6.840, 101.340, 6.875] },
  { tambon: "บาราโหม", village: "บ.บาราโหม", amphoe: "เมืองปัตตานี", bounds: [101.305, 6.865, 101.345, 6.895] },
  // อ.หนองจิก
  { tambon: "ดอนรัก", village: "บ.ดอนรัก", amphoe: "หนองจิก", bounds: [101.175, 6.825, 101.220, 6.855] },
  { tambon: "ตุยง", village: "บ.ตุยง", amphoe: "หนองจิก", bounds: [101.140, 6.840, 101.185, 6.875] },
  { tambon: "บ่อทอง", village: "บ.ค่ายอิงคยุทธ", amphoe: "หนองจิก", bounds: [101.135, 6.800, 101.180, 6.840] },
  { tambon: "บางตาวา", village: "บ.บางตาวา", amphoe: "หนองจิก", bounds: [101.180, 6.860, 101.225, 6.895] },
  { tambon: "เกาะเปาะ", village: "บ.เกาะเปาะ", amphoe: "หนองจิก", bounds: [101.125, 6.855, 101.175, 6.890] },
  // อ.ยะหริ่ง
  { tambon: "ยามู", village: "บ.ยามู", amphoe: "ยะหริ่ง", bounds: [101.345, 6.840, 101.390, 6.885] },
  { tambon: "บางปู", village: "บ.บางปู", amphoe: "ยะหริ่ง", bounds: [101.320, 6.860, 101.365, 6.895] },
  { tambon: "ตะโละกาโปร์", village: "บ.ตะโละกาโปร์", amphoe: "ยะหริ่ง", bounds: [101.380, 6.850, 101.435, 6.905] },
  // อ.สายบุรี
  { tambon: "ตะลุบัน", village: "บ.ตะลุบัน", amphoe: "สายบุรี", bounds: [101.580, 6.680, 101.630, 6.725] },
  { tambon: "ละหาร", village: "บ.ละหาร", amphoe: "สายบุรี", bounds: [101.540, 6.640, 101.590, 6.690] },
  // อ.ยะรัง
  { tambon: "ยะรัง", village: "บ.ยะรัง", amphoe: "ยะรัง", bounds: [101.270, 6.740, 101.315, 6.785] },
  // อ.โคกโพธิ์
  { tambon: "โคกโพธิ์", village: "บ.โคกโพธิ์", amphoe: "โคกโพธิ์", bounds: [101.110, 6.710, 101.160, 6.755] },
  { tambon: "นาประดู่", village: "บ.นาประดู่", amphoe: "โคกโพธิ์", bounds: [101.140, 6.660, 101.190, 6.710] },
];

export const PATTANI_DISTRICTS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "อ.เมืองปัตตานี", code: "9401" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.20, 6.88], [101.28, 6.89], [101.30, 6.84], [101.23, 6.82], [101.20, 6.88]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.หนองจิก", code: "9403" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.12, 6.85], [101.22, 6.86], [101.22, 6.78], [101.14, 6.76], [101.12, 6.85]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.โคกโพธิ์", code: "9402" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.05, 6.78], [101.16, 6.78], [101.18, 6.66], [101.08, 6.64], [101.05, 6.78]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ยะรัง", code: "9405" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.24, 6.78], [101.33, 6.78], [101.32, 6.68], [101.22, 6.70], [101.24, 6.78]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.สายบุรี", code: "9407" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.55, 6.74], [101.66, 6.72], [101.64, 6.60], [101.52, 6.62], [101.55, 6.74]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ยะหริ่ง", code: "9406" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.34, 6.88], [101.46, 6.87], [101.44, 6.78], [101.32, 6.80], [101.34, 6.88]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ปะนาเระ", code: "9404" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.46, 6.87], [101.56, 6.84], [101.54, 6.74], [101.44, 6.76], [101.46, 6.87]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.มายอ", code: "9408" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.34, 6.78], [101.46, 6.77], [101.45, 6.68], [101.33, 6.68], [101.34, 6.78]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.แม่ลาน", code: "9412" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.18, 6.68], [101.25, 6.69], [101.24, 6.60], [101.16, 6.61], [101.18, 6.68]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ทุ่งยางแดง", code: "9409" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.44, 6.68], [101.53, 6.68], [101.52, 6.58], [101.42, 6.59], [101.44, 6.68]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.กะพ้อ", code: "9410" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.53, 6.62], [101.62, 6.60], [101.60, 6.52], [101.51, 6.54], [101.53, 6.62]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ไม้แก่น", code: "9411" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.64, 6.62], [101.72, 6.60], [101.69, 6.52], [101.62, 6.54], [101.64, 6.62]]]
      }
    }
  ]
};
