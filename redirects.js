var redirects = {
  '/hack': '/'
};

module.exports = function(app) {
  for (var requestUrl in redirects) {
    var redirectDest = redirects[requestUrl];
    (function(src, dst) {
      app.get(src, function(req, res) {
        res.redirect(dst, 301);
      });
    })(requestUrl, redirectDest);
  }
};
