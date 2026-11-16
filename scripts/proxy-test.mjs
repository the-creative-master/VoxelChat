#!/usr/bin/env node
/**
 * A tiny reverse proxy, used to test VoxelChat the way a preview proxy or a
 * corporate proxy puts in front of it.
 *
 *   node scripts/proxy-test.mjs            # buffering proxy
 *   node scripts/proxy-test.mjs --stream   # proxy that passes chunks through
 */
import http from "node:http";

const streaming = process.argv.includes("--stream");
// A proxy that refuses to pass a long lived response through at all.
const hangsOnStreams = process.argv.includes("--hang");

const server = http.createServer((request, response) => {
    const chunks = [];

    if (hangsOnStreams && request.method === "POST" && request.url === "/api/chat") {
        const received = [];

        request.on("data", (chunk) => received.push(chunk));
        request.on("end", () => {
            const body = Buffer.concat(received).toString();

            if (body.includes('"stream":true')) {
                // Never answer – just hold the socket open.
                return;
            }
        });

        request.on("end", () => {
            if (Buffer.concat(received).toString().includes('"stream":true')) return;

            forward();
        });

        var forward = () => {
            const upstream = http.request(
                {
                    host: "127.0.0.1",
                    port: 7898,
                    path: request.url,
                    method: request.method,
                    headers: {...request.headers, host: "127.0.0.1:7898"},
                },
                (upstreamResponse) => {
                    response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
                    upstreamResponse.pipe(response);
                },
            );

            upstream.on("error", () => {
                response.writeHead(502);
                response.end("bad gateway");
            });

            upstream.end(Buffer.concat(received));
        };

        return;
    }

    const upstream = http.request(
        {
            host: "127.0.0.1",
            port: 7898,
            path: request.url,
            method: request.method,
            headers: {...request.headers, host: "127.0.0.1:7898"},
        },
        (upstreamResponse) => {
            if (streaming) {
                response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
                upstreamResponse.pipe(response);

                return;
            }

            upstreamResponse.on("data", (chunk) => chunks.push(chunk));
            upstreamResponse.on("end", () => {
                response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
                response.end(Buffer.concat(chunks));
            });
        },
    );

    upstream.on("error", () => {
        response.writeHead(502);
        response.end("bad gateway");
    });

    request.pipe(upstream);
});

server.listen(7896, "127.0.0.1", () => {
    console.log(`proxy on http://127.0.0.1:7896 (${streaming ? "streaming" : "buffering"})`);
});
