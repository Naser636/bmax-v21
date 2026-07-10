import { HttpRequestQueue } from "@/core/http-request-queue";

const queue = new HttpRequestQueue<number>();

queue.enqueue(1);
queue.enqueue(2);

console.assert(queue.size() === 2);
console.assert(queue.dequeue() === 1);
console.assert(queue.size() === 1);

console.log("HTTP Request Queue OK");
