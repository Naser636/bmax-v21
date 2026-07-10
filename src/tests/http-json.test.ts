import {
  parseJson,
  stringifyJson,
} from "@/core/http-json";

const text = stringifyJson({ ok: true });

const data = parseJson<{ ok: boolean }>(text);

console.assert(data.ok);

console.log("HTTP JSON OK");
