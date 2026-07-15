#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function loadSpecification(mission) {
  const file = path.join(
    "runtime",
    "specifications",
    `${mission}.md`
  );

  if (!fs.existsSync(file)) {
    return {
      found: false,
      path: file,
      content: null
    };
  }

  return {
    found: true,
    path: file,
    content: fs.readFileSync(file, "utf8")
  };
}

module.exports = {
  loadSpecification
};
