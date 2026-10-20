import http from "node:http";

const API = 8083;

const server = http.createServer((req, res) => {
  const proxyReq = http.request(
    { host: "127.0.0.1", port: API, path: req.url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("bad gateway");
  });
  req.pipe(proxyReq);
});

server.listen(8080, "127.0.0.1", () => {
  console.log("local proxy on 127.0.0.1:8080 -> api 8083");
});
