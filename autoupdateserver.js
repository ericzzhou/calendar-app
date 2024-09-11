const http = require("http");
const url = require("url");

const httpServer = http.createServer((req, res) => {
    console.log(req.url);
  const queryObject = url.parse(req.url, true).query;
  console.log(queryObject);
  if (queryObject.code) {
  }
});

httpServer.listen(0, () => {
  const address = httpServer.address();

  console.log(`Server listening on port: ${address.port}`);
});
