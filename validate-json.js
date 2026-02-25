const fs = require("fs");

function check(path) {
  const txt = fs.readFileSync(path, "utf8");
  JSON.parse(txt);
  console.log("OK:", path, "(bytes:", txt.length + ")");
}

check("lib/system_v1.json");
check("lib/system_v1.schema.json");
