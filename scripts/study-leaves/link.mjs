// ربط الإجازات الدراسية المخزنة في قاعدة البيانات بالأرشيف الذكي.
// التشغيل: node scripts/study-leaves/link.mjs
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const service = await server.ssrLoadModule("/src/services/studyLeavesService.js");
  const { autoLinkFacultySources } = await server.ssrLoadModule(
    "/src/services/facultyAutoLinkService.js"
  );

  const leaves = await service.fetchStudyLeaves();
  console.log("leaves:", leaves.length);

  const report = await autoLinkFacultySources({
    sources: ["study_leave"],
    studyLeaves: leaves,
  });

  console.log("report:", JSON.stringify(report.sources?.study_leave || report, null, 2));
  console.log("created links:", report.created);
  console.log("review items:", report.review?.length || 0);
  console.log("write errors:", report.writeErrors);
} finally {
  await server.close();
}
