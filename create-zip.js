#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const distFolder = path.join(__dirname, "dist");
const outputZip = path.join(distFolder, "horariosflexible-ui.zip");
const xsAppPath = path.join(__dirname, "xs-app.json");

if (!fs.existsSync(distFolder)) {
  console.error("Error: dist does not exist. Run build first.");
  process.exit(1);
}

if (!fs.existsSync(xsAppPath)) {
  console.error("Error: xs-app.json does not exist in project root.");
  process.exit(1);
}

const output = fs.createWriteStream(outputZip);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", function () {
  console.log("ZIP created:", outputZip, "bytes:", archive.pointer());
});

archive.on("error", function (err) {
  console.error("Error creating ZIP:", err);
  process.exit(1);
});

archive.pipe(output);

fs.readdirSync(distFolder).forEach(function (entry) {
  if (entry === "horariosflexible-ui.zip") {
    return;
  }
  const fullPath = path.join(distFolder, entry);
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    archive.directory(fullPath, entry);
  } else {
    archive.file(fullPath, { name: entry });
  }
});

archive.file(xsAppPath, { name: "xs-app.json" });

archive.finalize();
